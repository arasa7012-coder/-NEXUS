/**
 * Realtime client — SSE consumer.
 *
 * React Native's fetch does not expose a streaming body, and EventSource is
 * not built in, so the wire is read incrementally and framed here. That turns
 * out to be an advantage: the parsing, reconnection, de-duplication, and
 * ordering logic is plain TypeScript with an injected transport, so all of it
 * is tested rather than assumed.
 *
 * Behaviour that matters:
 *
 *   - **Reconnect with backoff and full jitter.** Without jitter, every client
 *     reconnects at the same instant after a server restart and knocks it over
 *     again. Randomness is correct here — it is scheduling, not identity.
 *   - **Last-Event-ID replay.** On reconnect the client sends the last id it
 *     saw so the server can replay what was missed. A dropped connection must
 *     not silently lose alerts.
 *   - **De-duplication.** Replay windows overlap by design, so the same event
 *     can legitimately arrive twice. Applying an ALERT_CREATED twice would
 *     double a count, so recently-seen ids are suppressed.
 *   - **Connection state is surfaced, never hidden.** The UI is required to
 *     tell the user when live updates have stopped.
 */

import type { EventType, NexusEvent } from "@nexus/contracts";

export type ConnectionState = "IDLE" | "CONNECTING" | "OPEN" | "RECONNECTING" | "OFFLINE";

export interface RealtimeTransport {
  /**
   * Opens the stream and invokes onChunk for each piece of body received.
   * Resolves when the stream ends; rejects on transport failure.
   */
  open(input: {
    url: string;
    headers: Record<string, string>;
    signal: AbortSignal;
    onChunk: (chunk: string) => void;
  }): Promise<void>;
}

export interface RealtimeOptions {
  baseUrl: string;
  transport: RealtimeTransport;
  getAccessToken: () => Promise<string | null>;
  onEvent: (event: NexusEvent) => void;
  onStateChange?: (state: ConnectionState) => void;
  types?: EventType[];
  /** Injected for testability. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  maxRetries?: number;
}

/**
 * Parses the SSE wire format incrementally.
 *
 * Split out from the connection because chunk boundaries fall in arbitrary
 * places — mid-field, mid-event — and that is exactly the class of bug worth
 * pinning with tests rather than discovering in production.
 */
export class SseParser {
  private buffer = "";

  /** Feed a chunk; returns whatever complete frames it completed. */
  push(chunk: string): Array<{ id?: string; event?: string; data: string }> {
    this.buffer += chunk;
    const frames: Array<{ id?: string; event?: string; data: string }> = [];

    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);

      const frame: { id?: string; event?: string; data: string } = { data: "" };
      const dataLines: string[] = [];

      for (const line of raw.split("\n")) {
        // A line beginning with ':' is a comment — the heartbeat. Not an event.
        if (line.startsWith(":") || line.trim() === "") continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "id") frame.id = value;
        else if (field === "event") frame.event = value;
        else if (field === "data") dataLines.push(value);
      }

      if (dataLines.length > 0) {
        frame.data = dataLines.join("\n");
        frames.push(frame);
      }
      boundary = this.buffer.indexOf("\n\n");
    }

    return frames;
  }

  reset(): void {
    this.buffer = "";
  }
}

/** Full-jitter exponential backoff (AWS's formulation). */
export function backoffWithJitter(attempt: number, random: () => number): number {
  const capped = Math.min(1_000 * 2 ** attempt, 30_000);
  return Math.round(random() * capped);
}

export class RealtimeClient {
  private readonly opts: Required<Omit<RealtimeOptions, "types" | "onStateChange">> &
    Pick<RealtimeOptions, "types" | "onStateChange">;
  private controller: AbortController | null = null;
  private state: ConnectionState = "IDLE";
  private lastEventId: string | null = null;
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];
  private stopped = false;
  private attempt = 0;

  constructor(options: RealtimeOptions) {
    this.opts = {
      baseUrl: options.baseUrl.replace(/\/+$/, ""),
      transport: options.transport,
      getAccessToken: options.getAccessToken,
      onEvent: options.onEvent,
      sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      random: options.random ?? Math.random,
      now: options.now ?? Date.now,
      maxRetries: options.maxRetries ?? Infinity,
      types: options.types,
      onStateChange: options.onStateChange,
    };
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.opts.onStateChange?.(next);
  }

  /**
   * Suppress an event id already applied.
   *
   * Bounded to 500 ids: unbounded would leak, and a replay window never spans
   * anything close to that many events.
   */
  private isDuplicate(id: string): boolean {
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > 500) {
      const evicted = this.seenOrder.shift()!;
      this.seen.delete(evicted);
    }
    return false;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.attempt = 0;

    while (!this.stopped && this.attempt <= this.opts.maxRetries) {
      this.setState(this.attempt === 0 ? "CONNECTING" : "RECONNECTING");

      const token = await this.opts.getAccessToken();
      if (!token) {
        // No session: there is nothing to subscribe to. Not an error state.
        this.setState("IDLE");
        return;
      }

      const parser = new SseParser();
      this.controller = new AbortController();

      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        accept: "text/event-stream",
      };
      if (this.lastEventId) headers["last-event-id"] = this.lastEventId;

      const query = this.opts.types?.length ? `?types=${this.opts.types.join(",")}` : "";

      try {
        await this.opts.transport.open({
          url: `${this.opts.baseUrl}/v1/realtime${query}`,
          headers,
          signal: this.controller.signal,
          onChunk: (chunk) => {
            // The first byte proves the stream is live; only then is the
            // connection genuinely OPEN and the retry counter reset.
            this.setState("OPEN");
            this.attempt = 0;

            for (const frame of parser.push(chunk)) {
              if (frame.id) this.lastEventId = frame.id;
              let event: NexusEvent;
              try {
                event = JSON.parse(frame.data) as NexusEvent;
              } catch {
                // A malformed frame must not kill the stream.
                continue;
              }
              if (!event?.id || this.isDuplicate(event.id)) continue;
              this.opts.onEvent(event);
            }
          },
        });
      } catch {
        // Fall through to the backoff below; a transport failure is expected.
      }

      if (this.stopped) break;

      this.setState("RECONNECTING");
      await this.opts.sleep(backoffWithJitter(this.attempt, this.opts.random));
      this.attempt += 1;
    }

    if (!this.stopped) this.setState("OFFLINE");
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    this.controller = null;
    this.setState("IDLE");
  }
}
