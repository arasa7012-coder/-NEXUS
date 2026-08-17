import { and, eq, isNull } from "drizzle-orm";
import { nexusMonitoringSchedules } from "../../drizzle/schema";
import { getDb } from "../db";
import { createHeartbeatJob, listHeartbeatJobs } from "../_core/heartbeat";
import { NEXUS_MONITORING_PATH, NEXUS_MONITORING_SCHEDULE_KEY } from "../services/nexusCommandService";

/**
 * Every 5 minutes (6-field cron, seconds first, UTC).
 *
 * Must stay strictly below the 10-minute freshness window used by
 * `monitoringFreshness()` in nexusCommandService. A cadence at or above that
 * window would make the schedule permanently report STALE/DEGRADED.
 */
const MONITORING_CRON = "0 */5 * * * *";

/**
 * Empty session string resolves to the project owner identity in the Forge
 * client. This job is project-scoped and never impersonates an end user.
 */
const PROJECT_OWNER_SESSION = "";

/**
 * Written into scheduleCronTaskUid while a replica is creating the remote job.
 * Never matches a real Forge taskUid, so the callback's exact-uid authorisation
 * rejects any request arriving mid-registration.
 */
const CLAIM_SENTINEL = "__registration_in_progress__";

const JOB_DESCRIPTION =
  "Nexus managed monitoring health check. Reports freshness of stored paper-position monitoring observations.";

type RegistrationOutcome =
  | { status: "REGISTERED"; taskUid: string }
  | { status: "ALREADY_REGISTERED"; taskUid: string }
  | { status: "RECONCILED"; taskUid: string }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; reason: string };

/**
 * Ensures the managed monitoring heartbeat exists, exactly once, without ever
 * blocking or failing server startup.
 *
 * Idempotency has two layers because there are two systems to keep in sync:
 *   1. The `nexusMonitoringSchedules` row, guarded by the existing unique index
 *      on `scheduleKey` (migration 0016), so concurrent replicas cannot insert
 *      duplicates.
 *   2. The Forge cron job, guarded by listing existing jobs by name before
 *      creating one, so restarts and replicas do not accumulate crons.
 *
 * SCOPE: registration only. This deliberately does NOT evaluate positions.
 * `evaluatePaperPositionMonitoring` remains user-request-driven; making it
 * server-initiated is a separate product decision (Phase 1).
 */
export async function registerMonitoringHeartbeat(): Promise<RegistrationOutcome> {
  const db = await getDb();
  if (!db) {
    return { status: "SKIPPED", reason: "Database unavailable at startup." };
  }

  // Layer 1: ensure the schedule row exists. The no-op-style update on conflict
  // preserves engineStatus / dataFreshnessState / lastCheckedAt written by
  // previous heartbeat runs — a restart must not reset observed health.
  try {
    await db
      .insert(nexusMonitoringSchedules)
      .values({ scheduleKey: NEXUS_MONITORING_SCHEDULE_KEY })
      .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  } catch (error) {
    return { status: "FAILED", reason: `Could not ensure schedule row: ${errorText(error)}` };
  }

  const existing = (
    await db
      .select()
      .from(nexusMonitoringSchedules)
      .where(eq(nexusMonitoringSchedules.scheduleKey, NEXUS_MONITORING_SCHEDULE_KEY))
      .limit(1)
  )[0];

  if (!existing) {
    return { status: "FAILED", reason: "Schedule row missing immediately after upsert." };
  }

  // Layer 2: reconcile against Forge. Any failure here is non-fatal — the row
  // stays UNCONFIGURED, which getMonitoringHealth() reports accurately.
  try {
    const remote = await listHeartbeatJobs(PROJECT_OWNER_SESSION);
    const match = remote.jobs.find(job => job.name === NEXUS_MONITORING_SCHEDULE_KEY);

    if (match) {
      if (existing.scheduleCronTaskUid === CLAIM_SENTINEL) {
        // A previous registration died mid-flight but the remote job exists.
        await persistTaskUid(db, existing.id, match.taskUid);
        return { status: "RECONCILED", taskUid: match.taskUid };
      }
      if (existing.scheduleCronTaskUid === match.taskUid) {
        return { status: "ALREADY_REGISTERED", taskUid: match.taskUid };
      }
      // A job exists but our stored uid is absent or stale. Adopt the remote
      // uid rather than creating a second cron; the callback authorizes on an
      // exact taskUid match, so a drifted uid silently disables the handler.
      await persistTaskUid(db, existing.id, match.taskUid);
      return { status: "RECONCILED", taskUid: match.taskUid };
    }

    // MULTI-INSTANCE RACE GUARD.
    // listHeartbeatJobs -> createHeartbeatJob is a check-then-act window: two
    // replicas booting together could both observe "no job" and both create one,
    // producing duplicate crons that double-evaluate every position.
    //
    // The claim below is the serialisation point. A conditional UPDATE against
    // the row's unique scheduleKey is atomic in MySQL, so exactly one replica
    // transitions NULL -> CLAIM_SENTINEL and proceeds to create the remote job.
    // Losers return without creating anything and reconcile on the next boot or
    // the next tick.
    const claim = await db
      .update(nexusMonitoringSchedules)
      .set({ scheduleCronTaskUid: CLAIM_SENTINEL })
      .where(
        and(
          eq(nexusMonitoringSchedules.id, existing.id),
          isNull(nexusMonitoringSchedules.scheduleCronTaskUid)
        )
      );

    // mysql2 and drizzle report this under different keys depending on driver
    // path; the codebase checks both elsewhere (see entitlementService.ts).
    const claimResult = claim as unknown as { affectedRows?: number; rowsAffected?: number };
    const claimedRows = Number(claimResult.affectedRows ?? claimResult.rowsAffected ?? 0);
    if (claimedRows === 0) {
      // Another replica is registering, or a uid already exists. Do not create.
      return { status: "SKIPPED", reason: "Registration claimed by another instance." };
    }

    try {
      const created = await createHeartbeatJob(
        {
          name: NEXUS_MONITORING_SCHEDULE_KEY,
          cron: MONITORING_CRON,
          path: NEXUS_MONITORING_PATH,
          method: "POST",
          description: JOB_DESCRIPTION,
        },
        PROJECT_OWNER_SESSION
      );

      await persistTaskUid(db, existing.id, created.taskUid);
      return { status: "REGISTERED", taskUid: created.taskUid };
    } catch (createError) {
      // Release the claim so a later boot can retry; leaving the sentinel in
      // place would permanently block registration after one Forge outage.
      await db
        .update(nexusMonitoringSchedules)
        .set({ scheduleCronTaskUid: null })
        .where(eq(nexusMonitoringSchedules.id, existing.id));
      throw createError;
    }
  } catch (error) {
    const reason = errorText(error);
    await recordRegistrationError(db, existing.id, reason);
    return { status: "FAILED", reason };
  }
}

async function persistTaskUid(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scheduleId: number,
  taskUid: string
) {
  await db
    .update(nexusMonitoringSchedules)
    .set({ scheduleCronTaskUid: taskUid, lastError: null })
    .where(eq(nexusMonitoringSchedules.id, scheduleId));
}

async function recordRegistrationError(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scheduleId: number,
  reason: string
) {
  try {
    await db
      .update(nexusMonitoringSchedules)
      .set({ lastError: `Heartbeat registration failed: ${reason}` })
      .where(eq(nexusMonitoringSchedules.id, scheduleId));
  } catch {
    /* Recording the failure must never itself fail startup. */
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
