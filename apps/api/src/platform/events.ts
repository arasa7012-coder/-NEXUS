/**
 * The NEXUS event bus (§11).
 *
 * Every meaningful state change is announced here. Alerts, notifications,
 * the realtime channel, and the audit log are all *subscribers* — none of them
 * is wired directly into the code that caused the change. That is what lets a
 * new consumer (push notifications, a webhook, an automation) be added without
 * touching the risk engine or the monitor runner.
 *
 * In-process by design for v1. The `EventPublisher` interface is the seam: a
 * queue-backed implementation can replace this one without any publisher
 * changing, because publishers only ever see the interface.
 *
 * No dependencies, so it is testable without a running server.
 */

import { IdSequence } from "@nexus/core";
import type { EntityRef, EventType, NexusEvent, Severity } from "@nexus/contracts";

export interface PublishInput {
  type: EventType;
  severity: Severity;
  summary: string;
  entity?: EntityRef | null;
  data?: Record<string, unknown>;
  correlationId?: string | null;
}

export interface EventPublisher {
  publish(input: PublishInput): NexusEvent;
}

export type EventHandler = (event: NexusEvent) => void | Promise<void>;

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/**
 * A handler that throws must not stop the other handlers, and must not
 * unwind the publisher — an alert-fanout bug should never roll back the risk
 * calculation that triggered it. Failures are reported here instead.
 */
export type EventErrorReporter = (error: unknown, event: NexusEvent, handlerName: string) => void;

export class InMemoryEventBus implements EventPublisher {
  private readonly handlers = new Map<EventType | "*", Array<{ name: string; fn: EventHandler }>>();
  private readonly ids: IdSequence;
  private readonly clock: Clock;
  private readonly onError: EventErrorReporter;
  private readonly ring: NexusEvent[] = [];
  private readonly ringSize: number;

  constructor(opts: {
    nodeId: string;
    clock?: Clock;
    onError?: EventErrorReporter;
    recentBufferSize?: number;
  }) {
    this.ids = new IdSequence(opts.nodeId);
    this.clock = opts.clock ?? systemClock;
    this.onError =
      opts.onError ??
      ((error, event, handlerName) => {
        // Structured, on stderr, matching the logger's line format. A bare
        // console.error with an interpolated template is unqueryable and was
        // the only unstructured log path left in the API.
        process.stderr.write(JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          service: "nexus-api",
          msg: "event handler failed",
          handler: handlerName,
          eventType: event.type,
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        }) + "\n");
      });
    this.ringSize = opts.recentBufferSize ?? 200;
  }

  on(type: EventType | "*", name: string, fn: EventHandler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push({ name, fn });
    this.handlers.set(type, list);
    return () => {
      const current = this.handlers.get(type);
      if (!current) return;
      this.handlers.set(
        type,
        current.filter((h) => h.fn !== fn),
      );
    };
  }

  publish(input: PublishInput): NexusEvent {
    const occurredAt = this.clock.now();
    const event: NexusEvent = {
      id: this.ids.next(occurredAt),
      type: input.type,
      occurredAt,
      severity: input.severity,
      entity: input.entity ?? null,
      summary: input.summary,
      data: input.data ?? {},
      correlationId: input.correlationId ?? null,
    };

    this.ring.push(event);
    if (this.ring.length > this.ringSize) this.ring.shift();

    for (const { name, fn } of [...(this.handlers.get(input.type) ?? []), ...(this.handlers.get("*") ?? [])]) {
      try {
        const result = fn(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.onError(error, event, name));
        }
      } catch (error) {
        this.onError(error, event, name);
      }
    }

    return event;
  }

  /** Most-recent-first, for the Command Center's activity feed. */
  recent(limit = 50): NexusEvent[] {
    return this.ring.slice(-limit).reverse();
  }
}
