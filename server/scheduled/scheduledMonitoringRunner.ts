import { gt, inArray } from "drizzle-orm";
import {
  nexusActivityEvents,
  paperPositionMonitoringStates,
  simulationPortfolios,
  simulationPositions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveEntitlement } from "../services/entitlementService";
import { evaluatePaperPositionMonitoring } from "../services/paperPositionMonitoringService";

/**
 * Server-side scheduled monitoring execution.
 *
 * WHY THIS EXISTS
 * `evaluatePaperPositionMonitoring` was previously reachable only from a signed-in
 * browser request, so "24/7 monitoring" stopped the moment a user closed a tab.
 * This runner is driven by the platform Heartbeat cron, so evaluation continues
 * with no browser open and survives server restarts (state lives in the database,
 * not in process memory).
 *
 * ENTITLEMENT SEMANTICS — deliberate and documented
 * A "monitoring session" in the entitlement model (`monitoring_sessions` metric)
 * represents a USER-INITIATED evaluation. Scheduled execution is infrastructure
 * the plan already pays for, so this runner uses `resolveEntitlement` (a pure
 * read, `audit: false`) and NEVER calls `consumeEntitlementUsage`. Charging quota
 * for work the user did not request would silently exhaust a FREE account's 3
 * sessions within 15 minutes of the cron running.
 *
 * Access is still gated: a user whose plan does not enable `continuous_monitoring`
 * is skipped entirely.
 *
 * CONCURRENCY
 * Duplicate execution across replicas is prevented upstream: only the single
 * Forge cron job (guarded by name in registerMonitoringHeartbeat) triggers the
 * callback, and the callback authorises on an exact taskUid match.
 */

/** Only users with a position observed or opened recently are worth evaluating. */
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Bounded per-tick work so one run cannot exceed the cron interval. */
const MAX_USERS_PER_RUN = 50;

/** Consecutive-failure backoff, in ticks, keyed by user. Resets on success. */
const RETRY_BACKOFF_TICKS = [0, 1, 2, 4, 8];
const failureState = new Map<number, { consecutive: number; skipTicks: number }>();

/**
 * Overlap guard. The cron fires every 5 minutes; if a tick ever exceeds that
 * (slow provider, large user set) the next invocation would otherwise run
 * concurrently against the same rows and double-evaluate positions. A tick
 * already in flight causes the new one to return immediately.
 */
let tickInFlight = false;

export type ScheduledMonitoringResult = {
  evaluatedUsers: number;
  skippedNotEntitled: number;
  skippedBackoff: number;
  failedUsers: number;
  transitions: number;
  durationMs: number;
  /** True when a previous tick was still running and this one yielded. */
  skippedOverlap?: boolean;
};

function nextBackoff(consecutive: number): number {
  return RETRY_BACKOFF_TICKS[Math.min(consecutive, RETRY_BACKOFF_TICKS.length - 1)]!;
}

/** Users holding at least one open simulation position. */
async function candidateUserIds(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<number[]> {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);

  // A row in simulationPositions IS an open position: the codebase deletes rows
  // on close (see recordSimulationOrder) and the table has no status column.
  // Verified against drizzle/schema.ts before relying on it.
  const openPositions = await db
    .select({ portfolioId: simulationPositions.simulationPortfolioId })
    .from(simulationPositions);

  const portfolioIds = Array.from(new Set(openPositions.map(row => row.portfolioId)));
  if (portfolioIds.length === 0) return [];

  const owners = await db
    .select({ userId: simulationPortfolios.userId })
    .from(simulationPortfolios)
    .where(inArray(simulationPortfolios.id, portfolioIds));

  const recentlyObserved = await db
    .select({ userId: paperPositionMonitoringStates.userId })
    .from(paperPositionMonitoringStates)
    .where(gt(paperPositionMonitoringStates.updatedAt, since));

  const ids = new Set<number>(owners.map(row => row.userId));
  for (const row of recentlyObserved) ids.add(row.userId);
  return Array.from(ids).slice(0, MAX_USERS_PER_RUN);
}

/**
 * Executes one scheduled monitoring tick. Never throws: a failure for one user
 * must not abort the run, and a failed run must not fail the cron callback.
 */
export async function runScheduledMonitoring(): Promise<ScheduledMonitoringResult> {
  const startedAt = Date.now();
  const result: ScheduledMonitoringResult = {
    evaluatedUsers: 0,
    skippedNotEntitled: 0,
    skippedBackoff: 0,
    failedUsers: 0,
    transitions: 0,
    durationMs: 0,
  };


  if (tickInFlight) {
    result.durationMs = Date.now() - startedAt;
    result.skippedOverlap = true;
    return result;
  }
  tickInFlight = true;

  try {
    return await executeTick(result, startedAt);
  } finally {
    // Must release even on an unexpected throw, or monitoring would silently
    // stop forever after a single failure.
    tickInFlight = false;
  }
}

async function executeTick(
  result: ScheduledMonitoringResult,
  startedAt: number
): Promise<ScheduledMonitoringResult> {
  const db = await getDb();
  if (!db) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  let userIds: number[];
  try {
    userIds = await candidateUserIds(db);
  } catch {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // Prevent unbounded growth: drop backoff entries for users who are no longer
  // candidates (deleted account, deleted portfolio, or all positions closed).
  const candidateSet = new Set(userIds);
  for (const tracked of Array.from(failureState.keys())) {
    if (!candidateSet.has(tracked)) failureState.delete(tracked);
  }

  for (const userId of userIds) {
    const state = failureState.get(userId);
    if (state && state.skipTicks > 0) {
      state.skipTicks -= 1;
      result.skippedBackoff += 1;
      continue;
    }

    try {
      // Pure read: does NOT audit and does NOT consume monitoring_sessions.
      const decision = await resolveEntitlement(userId, "continuous_monitoring");
      if (!decision.allowed) {
        result.skippedNotEntitled += 1;
        continue;
      }

      const evaluation = await evaluatePaperPositionMonitoring(userId);
      result.evaluatedUsers += 1;
      result.transitions += evaluation.transitions.length;
      failureState.delete(userId);
    } catch (error) {
      result.failedUsers += 1;
      const consecutive = (failureState.get(userId)?.consecutive ?? 0) + 1;
      failureState.set(userId, { consecutive, skipTicks: nextBackoff(consecutive) });
      await recordFailure(db, userId, error);
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

/** Failures are evidence too — they must be visible, not swallowed. */
async function recordFailure(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  error: unknown
) {
  try {
    await db.insert(nexusActivityEvents).values({
      userId,
      source: "MONITORING",
      eventType: "SCHEDULED_MONITORING_FAILED",
      severity: "MEDIUM",
      evidenceJson: JSON.stringify({
        rule: "M-201",
        reason: error instanceof Error ? error.message : String(error),
        execution: "SCHEDULED",
      }),
      correlationKey: `scheduled-monitoring-failure:${userId}`,
      occurredAt: new Date(),
    });
  } catch {
    /* Recording a failure must never itself break the run. */
  }
}

/** Exposed for tests: clears in-process backoff state. */
export function __resetBackoffState() {
  failureState.clear();
}
