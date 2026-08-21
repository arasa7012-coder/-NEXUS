/**
 * Monitoring scheduler (§10).
 *
 * Monitoring runs on the backend and stays alive independently of any client.
 * The mobile app displays results; it never keeps monitoring running. That is
 * the requirement, and it is also the only arrangement that survives an app
 * being backgrounded or killed.
 *
 * Three failure modes this guards against, all of which were observed in the
 * legacy monitoring work:
 *
 *   1. Overlapping runs — a slow check still executing when its next tick
 *      arrives. Guarded by an in-flight claim, so a check is never concurrent
 *      with itself.
 *   2. Failure storms — a broken monitor retrying every 30s forever. Guarded
 *      by exponential backoff on consecutive failures.
 *   3. Silent death — a thrown handler killing the loop. Every run is isolated;
 *      a throw marks that monitor ERROR and the loop continues.
 *
 * Pure scheduling logic with an injected clock, so all of the above is
 * verifiable without waiting in real time.
 */

import type { Monitor, MonitorState } from "@nexus/contracts";
import type { Clock, EventPublisher } from "../../platform/events.ts";

export type CheckOutcome = { triggered: boolean; detail?: string };

/**
 * A check may classify its own failure. The runner reads `kind` off the thrown
 * error when present, so the failure taxonomy survives into the event and the
 * monitor row instead of collapsing to "something went wrong".
 */
interface ClassifiedError {
  kind?: string;
}
export type CheckFn = (monitor: Monitor) => Promise<CheckOutcome>;

export interface MonitorRepository {
  listDue(now: number, limit: number): Promise<Monitor[]>;
  save(monitor: Monitor): Promise<void>;
  /**
   * Atomically mark a monitor as claimed for this run, returning false if
   * another worker already holds it. In-memory this is trivial; against the
   * database it must be a conditional UPDATE, or two API instances will run
   * the same check twice.
   */
  claim(monitorId: string, until: number): Promise<boolean>;
  release(monitorId: string): Promise<void>;
}

/**
 * Two independent schedules, deliberately.
 *
 *   **Execution interval** — how often a healthy monitor runs. User-chosen,
 *   floor 15s. It governs normal operation.
 *
 *   **Retry backoff** — how long to wait after a *failure*. Grows
 *   exponentially from 30s to a 30-minute cap.
 *
 * `nextRunAt` takes the maximum of the two, so backoff only takes over once
 * the penalty exceeds the interval. It is therefore entirely normal and
 * correct for `backoff < interval`: a monitor on a 5-minute schedule that
 * fails once waits its usual 5 minutes, not 30 seconds. Backoff exists to slow
 * a *persistently* failing monitor, not to accelerate a healthy one, and
 * forcing backoff above the interval would make one transient blip delay a
 * frequent monitor for no reason.
 *
 * The two are never coupled to alert de-duplication, which has its own
 * lifecycle keyed on the condition rather than on any clock.
 */
export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
  /** Consecutive failures after which the monitor stops retrying entirely. */
  giveUpAfter: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 30_000,
  maxMs: 30 * 60_000,
  giveUpAfter: 10,
};

/**
 * Exponential backoff, deterministic. No jitter here: jitter belongs at the
 * call site where many monitors would otherwise align, and keeping this pure
 * makes the schedule assertable.
 */
export function backoffDelayMs(consecutiveFailures: number, policy: BackoffPolicy = DEFAULT_BACKOFF): number {
  if (consecutiveFailures <= 0) return 0;
  const raw = policy.baseMs * 2 ** (consecutiveFailures - 1);
  return Math.min(raw, policy.maxMs);
}

/** When should this monitor next run, given how its last run went? */
export function nextRunAt(monitor: Monitor, now: number, policy: BackoffPolicy = DEFAULT_BACKOFF): number | null {
  if (monitor.state === "STOPPED" || monitor.state === "PAUSED") return null;
  if (monitor.consecutiveFailures >= policy.giveUpAfter) return null;
  const interval = monitor.intervalSeconds * 1000;
  const penalty = backoffDelayMs(monitor.consecutiveFailures, policy);
  return now + Math.max(interval, penalty);
}

export interface RunReport {
  ran: number;
  triggered: number;
  failed: number;
  skippedLocked: number;
}

export class MonitorRunner {
  private readonly repo: MonitorRepository;
  private readonly events: EventPublisher;
  private readonly clock: Clock;
  private readonly policy: BackoffPolicy;
  private readonly lockMs: number;
  private cycleInFlight = false;

  constructor(deps: {
    repo: MonitorRepository;
    events: EventPublisher;
    clock: Clock;
    policy?: BackoffPolicy;
    lockMs?: number;
  }) {
    this.repo = deps.repo;
    this.events = deps.events;
    this.clock = deps.clock;
    this.policy = deps.policy ?? DEFAULT_BACKOFF;
    this.lockMs = deps.lockMs ?? 120_000;
  }

  /**
   * Execute one scheduling cycle. Safe to call on a timer: a cycle still
   * running causes the next call to return immediately rather than pile up.
   */
  async runCycle(check: CheckFn, limit = 50): Promise<RunReport> {
    const report: RunReport = { ran: 0, triggered: 0, failed: 0, skippedLocked: 0 };
    if (this.cycleInFlight) return report;
    this.cycleInFlight = true;

    try {
      const due = await this.repo.listDue(this.clock.now(), limit);
      for (const monitor of due) {
        const claimed = await this.repo.claim(monitor.id, this.clock.now() + this.lockMs);
        if (!claimed) {
          report.skippedLocked += 1;
          continue;
        }
        try {
          await this.runOne(monitor, check, report);
        } finally {
          await this.repo.release(monitor.id);
        }
      }
    } finally {
      this.cycleInFlight = false;
    }

    return report;
  }

  private async runOne(monitor: Monitor, check: CheckFn, report: RunReport): Promise<void> {
    const startedAt = this.clock.now();
    report.ran += 1;

    try {
      const outcome = await check(monitor);
      const now = this.clock.now();
      const wasFailing = monitor.consecutiveFailures > 0;
      const updated: Monitor = {
        ...monitor,
        state: "ACTIVE",
        lastRunAt: startedAt,
        consecutiveFailures: 0,
        lastOutcome: outcome.triggered ? "TRIGGERED" : "OK",
        // Cleared on success. Spreading the previous monitor would carry a
        // stale failure kind forward, so a recovered monitor would keep
        // displaying the error that no longer applies.
        lastFailureKind: null,
        detail: outcome.detail ?? null,
        nextRunAt: null,
      };
      updated.nextRunAt = nextRunAt(updated, now, this.policy);
      await this.repo.save(updated);

      if (wasFailing) {
        // Recovery is worth announcing: a monitor that silently starts working
        // again leaves the user believing it is still broken.
        this.events.publish({
          type: "MONITOR_RECOVERED",
          severity: "INFO",
          summary: `Monitor "${monitor.name}" recovered.`,
          entity: monitor.target,
          data: { monitorId: monitor.id, userId: monitor.userId },
        });
      }

      if (outcome.triggered) {
        report.triggered += 1;
        this.events.publish({
          type: "SIGNAL_CREATED",
          severity: "WATCH",
          summary: `Monitor "${monitor.name}" triggered.`,
          entity: monitor.target,
          data: { monitorId: monitor.id, detail: outcome.detail ?? null },
        });
      }
    } catch (error) {
      report.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown monitor failure.";
      const failures = monitor.consecutiveFailures + 1;
      const exhausted = failures >= this.policy.giveUpAfter;

      const state: MonitorState = exhausted ? "STOPPED" : "FAILING";
      const updated: Monitor = {
        ...monitor,
        state,
        lastRunAt: startedAt,
        consecutiveFailures: failures,
        lastOutcome: "ERROR",
        lastFailureKind: ((error as ClassifiedError)?.kind ?? "INTERNAL") as Monitor["lastFailureKind"],
        detail: message.slice(0, 280),
        nextRunAt: null,
      };
      updated.nextRunAt = nextRunAt(updated, this.clock.now(), this.policy);
      await this.repo.save(updated);

      const kind = (error as ClassifiedError)?.kind ?? "INTERNAL";

      this.events.publish({
        type: exhausted ? "MONITOR_STOPPED" : "MONITOR_FAILED",
        severity: exhausted ? "WARNING" : "INFO",
        summary: exhausted
          ? `Monitor "${monitor.name}" stopped after ${failures} consecutive failures.`
          : `Monitor "${monitor.name}" failed (${failures}).`,
        entity: monitor.target,
        data: {
          monitorId: monitor.id,
          userId: monitor.userId,
          failures,
          failureKind: kind,
          detail: message.slice(0, 280),
        },
      });
    }
  }
}
