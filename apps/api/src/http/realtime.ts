/**
 * Realtime (§17) — Server-Sent Events.
 *
 * SSE rather than WebSocket, deliberately. NEXUS realtime is one-directional:
 * the backend pushes alerts, risk changes, and monitoring updates; the client
 * sends commands over normal HTTP. For that shape SSE is strictly better —
 * it runs over plain HTTP/1.1 with no upgrade handshake, survives proxies that
 * mangle upgrades, reconnects natively with Last-Event-ID replay, and needs no
 * dependency. It is also implementable on node:http, which means the
 * subscription, filtering, and replay logic below is *actually tested* rather
 * than asserted.
 *
 * WebSocket remains the right choice if NEXUS later needs client→server
 * streaming. `RealtimeHub` is transport-agnostic, so that swap does not reach
 * the event bus or the domain.
 *
 * This is not fake realtime: events originate from the domain event bus, and
 * nothing is emitted on a timer.
 */

import type { EventType, NexusEvent } from "@nexus/contracts";
import type { InMemoryEventBus } from "../platform/events.ts";

export interface RealtimeConnection {
  id: string;
  userId: string;
  /** Empty means "everything". */
  types: Set<EventType>;
  send: (frame: string) => void;
  close: () => void;
}

/** SSE wire framing. Kept pure so the exact bytes are assertable. */
export function encodeSseFrame(event: NexusEvent): string {
  // `id:` enables Last-Event-ID replay after a reconnect. `event:` lets the
  // client subscribe per type. Data is one line: JSON never contains a raw
  // newline, so no escaping is needed.
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function encodeHeartbeat(atMs: number): string {
  // An SSE comment. Keeps intermediary proxies from reaping an idle connection
  // and gives the client a liveness signal without a synthetic domain event.
  return `: heartbeat ${atMs}\n\n`;
}

export type AddConnectionResult =
  | { accepted: true }
  | { accepted: false; reason: "USER_LIMIT" | "GLOBAL_LIMIT" };

export class RealtimeHub {
  private readonly connections = new Map<string, RealtimeConnection>();
  /** Secondary index so per-user limits do not require scanning every connection. */
  private readonly byUser = new Map<string, Set<string>>();
  /** Bounded replay buffer for reconnecting clients. */
  private readonly replay: NexusEvent[] = [];
  private readonly replaySize: number;
  private readonly maxPerUser: number;
  private readonly maxTotal: number;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: { replaySize?: number; maxConnectionsPerUser?: number; maxConnections?: number } = {}) {
    this.replaySize = opts.replaySize ?? 100;
    // A client that reconnects without releasing its previous socket would
    // otherwise accumulate open streams until the process runs out of file
    // descriptors. Capping per user bounds that blast radius to one account.
    this.maxPerUser = opts.maxConnectionsPerUser ?? 5;
    this.maxTotal = opts.maxConnections ?? 10_000;
  }

  /** Bind to the domain event bus. Every realtime frame originates here. */
  attach(bus: InMemoryEventBus): void {
    this.unsubscribe = bus.on("*", "realtime-hub", (event) => {
      this.replay.push(event);
      if (this.replay.length > this.replaySize) this.replay.shift();
      this.broadcast(event);
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  add(connection: RealtimeConnection, lastEventId?: string): AddConnectionResult {
    if (this.connections.size >= this.maxTotal) {
      return { accepted: false, reason: "GLOBAL_LIMIT" };
    }

    const existing = this.byUser.get(connection.userId) ?? new Set<string>();
    if (existing.size >= this.maxPerUser) {
      // Evict this user's oldest stream rather than refusing the newest. A
      // client reconnecting after a half-open socket must not be locked out by
      // the corpses of its own earlier connections.
      const oldest = existing.values().next().value as string | undefined;
      if (oldest !== undefined) this.forceClose(oldest);
    }

    this.connections.set(connection.id, connection);
    const set = this.byUser.get(connection.userId) ?? new Set<string>();
    set.add(connection.id);
    this.byUser.set(connection.userId, set);

    // Replay whatever the client missed while disconnected. Without this a
    // dropped connection silently loses alerts, which is the failure mode that
    // makes users stop trusting a monitoring product.
    if (lastEventId) {
      const index = this.replay.findIndex((e) => e.id === lastEventId);
      if (index >= 0) {
        for (const missed of this.replay.slice(index + 1)) {
          if (this.accepts(connection, missed)) {
            try { connection.send(encodeSseFrame(missed)); }
            catch { this.remove(connection.id); return { accepted: true }; }
          }
        }
      }
      // An unknown Last-Event-ID means the client was gone longer than the
      // replay window. Sending nothing is correct — inventing a replay from a
      // truncated buffer would deliver a misleading partial history.
    }

    return { accepted: true };
  }

  remove(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    this.connections.delete(connectionId);
    if (!connection) return;

    // The per-user index must be pruned too, or it grows without bound as
    // users connect and disconnect over the process lifetime.
    const set = this.byUser.get(connection.userId);
    if (set) {
      set.delete(connectionId);
      if (set.size === 0) this.byUser.delete(connection.userId);
    }
  }

  private forceClose(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      try { connection.close(); } catch { /* already gone */ }
    }
    this.remove(connectionId);
  }

  private accepts(connection: RealtimeConnection, event: NexusEvent): boolean {
    return connection.types.size === 0 || connection.types.has(event.type);
  }

  broadcast(event: NexusEvent): number {
    let delivered = 0;
    for (const connection of this.connections.values()) {
      if (!this.accepts(connection, event)) continue;
      try {
        connection.send(encodeSseFrame(event));
        delivered += 1;
      } catch {
        // A dead socket must not stop delivery to healthy ones.
        this.remove(connection.id);
      }
    }
    return delivered;
  }

  /**
   * Heartbeat doubles as reaping: a socket that has died without emitting a
   * close event only reveals itself on write, so this is where such
   * connections are detected and dropped.
   */
  heartbeat(atMs: number): void {
    for (const connection of [...this.connections.values()]) {
      try { connection.send(encodeHeartbeat(atMs)); }
      catch { this.remove(connection.id); }
    }
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  connectionsForUser(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0;
  }

  /** Diagnostics for the readiness endpoint. */
  stats(): { connections: number; users: number; replayBuffered: number } {
    return {
      connections: this.connections.size,
      users: this.byUser.size,
      replayBuffered: this.replay.length,
    };
  }

  closeAll(): void {
    for (const connection of [...this.connections.values()]) {
      try { connection.close(); } catch { /* already gone */ }
    }
    this.connections.clear();
    this.byUser.clear();
  }
}
