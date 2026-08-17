import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  nexusActionApprovals,
  nexusActivityEvents,
  nexusIncidents,
  nexusMonitoringSchedules,
  nexusSecurityModes,
  nexusShieldFindings,
  paperPositionMonitoringStates,
  smartAlertEvents,
} from "../../drizzle/schema";
import { getDb } from "../db";

export const NEXUS_MONITORING_SCHEDULE_KEY = "NEXUS_MANAGED_MONITORING";
export const NEXUS_MONITORING_PATH = "/api/scheduled/nexus-monitoring-health";

type HealthFreshness = "FRESH" | "STALE" | "UNAVAILABLE" | "UNKNOWN";
type EngineStatus = "UNCONFIGURED" | "OPERATIONAL" | "DEGRADED" | "FAILED";
type ShieldCandidate = {
  ruleCode: string;
  riskLevel: "HIGH_RISK" | "BLOCKED";
  reason: string;
  recommendedAction: string;
  evidence: Record<string, unknown>;
};

export function monitoringFreshness(latestAt: Date | null | undefined, now: Date): HealthFreshness {
  if (!latestAt) return "UNKNOWN";
  return now.getTime() - latestAt.getTime() <= 10 * 60_000 ? "FRESH" : "STALE";
}

function healthSeverity(freshness: HealthFreshness): "INFO" | "MEDIUM" | "HIGH" {
  if (freshness === "STALE") return "HIGH";
  if (freshness === "UNAVAILABLE") return "MEDIUM";
  return "INFO";
}

function healthReason(freshness: HealthFreshness): string {
  if (freshness === "FRESH") return "The newest stored monitoring observation is within the configured freshness window.";
  if (freshness === "STALE") return "The newest stored monitoring observation is older than the configured freshness window.";
  if (freshness === "UNAVAILABLE") return "The monitoring data source explicitly reported itself unavailable.";
  return "No stored position-monitoring observation is available yet.";
}

export async function getMonitoringHealth() {
  const db = await getDb();
  if (!db) throw new Error("Monitoring health storage is temporarily unavailable.");
  const config = (await db.select().from(nexusMonitoringSchedules)
    .where(eq(nexusMonitoringSchedules.scheduleKey, NEXUS_MONITORING_SCHEDULE_KEY)).limit(1))[0];
  return config ?? {
    scheduleKey: NEXUS_MONITORING_SCHEDULE_KEY,
    scheduleCronTaskUid: null,
    enabled: 0,
    engineStatus: "UNCONFIGURED" as const,
    lastCheckedAt: null,
    lastEventAt: null,
    dataFreshnessState: "UNKNOWN" as const,
    lastError: null,
  };
}

/** Idempotent project-level check: it records only a state change, never a fabricated per-user monitoring result. */
/**
 * Execution outcome from the scheduled runner for this tick. Supplied so that
 * health reflects whether monitoring ACTUALLY RAN, not merely whether stored
 * observations look recent. Without this, a runner failing on every user still
 * reported OPERATIONAL until data aged past the freshness window.
 */
export type MonitoringExecutionSummary = {
  evaluatedUsers: number;
  failedUsers: number;
  skippedNotEntitled: number;
  skippedBackoff: number;
};

export async function runManagedMonitoringHealthCheck(
  taskUid: string,
  execution?: MonitoringExecutionSummary
) {
  const db = await getDb();
  if (!db) throw new Error("Monitoring health storage is temporarily unavailable.");
  const config = (await db.select().from(nexusMonitoringSchedules)
    .where(and(eq(nexusMonitoringSchedules.scheduleKey, NEXUS_MONITORING_SCHEDULE_KEY), eq(nexusMonitoringSchedules.scheduleCronTaskUid, taskUid))).limit(1))[0];
  if (!config) return { ok: true, skipped: "orphan-or-unregistered-task" as const };

  const now = new Date();
  const latestState = (await db.select().from(paperPositionMonitoringStates).orderBy(desc(paperPositionMonitoringStates.updatedAt)).limit(1))[0];
  const freshness = monitoringFreshness(latestState?.updatedAt, now);
  // Status precedence: execution failure outranks data freshness.
  //   FAILED      every attempted evaluation errored (runner is broken)
  //   DEGRADED    some evaluations errored, or observations are stale
  //   OPERATIONAL evaluations succeeded (or there was legitimately no work)
  const attempted = execution ? execution.evaluatedUsers + execution.failedUsers : 0;
  let nextStatus: EngineStatus;
  if (execution && attempted > 0 && execution.evaluatedUsers === 0) {
    nextStatus = "FAILED";
  } else if ((execution && execution.failedUsers > 0) || freshness === "STALE") {
    nextStatus = "DEGRADED";
  } else {
    nextStatus = "OPERATIONAL";
  }

  // An empty candidate list is NOT a failure: no open positions means there is
  // genuinely nothing to evaluate, and freshness alone governs.
  const executionError =
    execution && execution.failedUsers > 0
      ? `Scheduled monitoring: ${execution.failedUsers} user evaluation(s) failed, ${execution.evaluatedUsers} succeeded.`
      : null;
  const changed = config.engineStatus !== nextStatus || config.dataFreshnessState !== freshness;
  let eventId: number | null = null;

  if (changed) {
    const inserted = await db.insert(nexusActivityEvents).values({
      userId: null,
      source: "HEARTBEAT",
      eventType: "MONITORING_HEALTH_CHANGED",
      severity: healthSeverity(freshness),
      stateBeforeJson: JSON.stringify({ engineStatus: config.engineStatus, dataFreshnessState: config.dataFreshnessState }),
      stateAfterJson: JSON.stringify({ engineStatus: nextStatus, dataFreshnessState: freshness }),
      evidenceJson: JSON.stringify({ rule: "H-101", freshness, latestMonitoringStateId: latestState?.id ?? null, latestObservedAt: latestState?.updatedAt?.toISOString() ?? null, reason: healthReason(freshness), execution: execution ?? null }),
      correlationKey: `monitoring-health:${freshness}`,
      occurredAt: now,
    });
    eventId = Number((inserted as { insertId?: number }).insertId ?? 0) || null;
  }

  await db.update(nexusMonitoringSchedules).set({
    enabled: 1,
    engineStatus: nextStatus,
    dataFreshnessState: freshness,
    lastCheckedAt: now,
    lastEventAt: changed ? now : config.lastEventAt,
    // Only clear lastError when this tick genuinely had no failure. Blindly
    // nulling it erased registration and runner failures on the next tick,
    // hiding exactly the diagnostics an operator needs.
    lastError: executionError,
  }).where(eq(nexusMonitoringSchedules.id, config.id));
  return { ok: true, status: nextStatus, freshness, changed, eventId, execution: execution ?? null };
}

export async function getActivityTimeline(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Activity timeline storage is temporarily unavailable.");
  return db.select().from(nexusActivityEvents)
    .where(or(eq(nexusActivityEvents.userId, userId), isNull(nexusActivityEvents.userId)))
    .orderBy(desc(nexusActivityEvents.occurredAt)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function getCommandOverview(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Command center storage is temporarily unavailable.");
  const [health, states, alerts, findings, incidents, approvals, securityMode] = await Promise.all([
    getMonitoringHealth(),
    db.select().from(paperPositionMonitoringStates).where(eq(paperPositionMonitoringStates.userId, userId)).limit(100),
    db.select().from(smartAlertEvents).where(eq(smartAlertEvents.userId, userId)).orderBy(desc(smartAlertEvents.observedAt)).limit(100),
    db.select().from(nexusShieldFindings).where(and(eq(nexusShieldFindings.userId, userId), eq(nexusShieldFindings.status, "OPEN"))).limit(100),
    db.select().from(nexusIncidents).where(and(eq(nexusIncidents.userId, userId), or(eq(nexusIncidents.state, "OPEN"), eq(nexusIncidents.state, "INVESTIGATING")))).limit(100),
    db.select().from(nexusActionApprovals).where(and(eq(nexusActionApprovals.userId, userId), eq(nexusActionApprovals.state, "PENDING"))).limit(100),
    db.select().from(nexusSecurityModes).where(eq(nexusSecurityModes.userId, userId)).limit(1),
  ]);
  const highPositionStates = states.filter((state) => state.riskLevel === "HIGH" || state.riskLevel === "EXTREME" || state.state === "PROTECTION_TRIGGERED");
  const criticalAlerts = alerts.filter((alert) => alert.severity === "CRITICAL");
  const score = states.length === 0 && alerts.length === 0 && findings.length === 0
    ? null
    : Math.min(100, highPositionStates.length * 30 + criticalAlerts.length * 20 + findings.length * 15 + (health.engineStatus === "DEGRADED" ? 20 : 0));
  return {
    health,
    risk: {
      overallScore: score,
      marketRisk: "INSUFFICIENT_EVIDENCE" as const,
      positionRisk: states.length ? Math.min(100, highPositionStates.length * 35) : null,
      systemRisk: health.engineStatus === "DEGRADED" || health.engineStatus === "FAILED" ? 80 : health.engineStatus === "OPERATIONAL" ? 0 : null,
      monitoringRisk: health.dataFreshnessState,
      permissionRisk: securityMode[0]?.enabled === 1 ? "STRICT_MODE_ENABLED" : "NORMAL_MODE",
      behavioralRisk: findings.length ? Math.min(100, findings.length * 25) : null,
      basis: { monitoredPositionCount: states.length, criticalAlertCount: criticalAlerts.length, openShieldFindingCount: findings.length },
    },
    counts: { activePositions: states.filter((state) => state.state !== "CLOSED").length, openIncidents: incidents.length, pendingApprovals: approvals.length, activeAlerts: alerts.filter((alert) => alert.isRead === 0).length, openShieldFindings: findings.length },
    securityMode: securityMode[0] ?? null,
  };
}

export async function evaluateShield(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Shield storage is temporarily unavailable.");
  const states = await db.select().from(paperPositionMonitoringStates).where(eq(paperPositionMonitoringStates.userId, userId)).limit(100);
  const candidates: ShieldCandidate[] = states.flatMap<ShieldCandidate>((state) => {
    if (state.state === "DATA_STALE") return [{ ruleCode: "S-201", riskLevel: "HIGH_RISK" as const, reason: "Position monitoring data is stale.", recommendedAction: "Review data freshness before approving any sensitive paper action.", evidence: { positionId: state.positionId, state: state.state, observedAt: state.observedAt } }];
    if (state.state === "PROTECTION_TRIGGERED") return [{ ruleCode: "S-202", riskLevel: "BLOCKED" as const, reason: "A stored protection trigger is active for this paper position.", recommendedAction: "Review the immutable protection event and Risk Engine state.", evidence: { positionId: state.positionId, state: state.state, triggerReason: state.triggerReason } }];
    if (state.riskLevel === "EXTREME") return [{ ruleCode: "S-203", riskLevel: "HIGH_RISK" as const, reason: "Stored monitoring evidence marks the position as EXTREME risk.", recommendedAction: "Review position exposure and the linked risk evidence.", evidence: { positionId: state.positionId, riskLevel: state.riskLevel, exposurePercent: state.exposurePercent } }];
    return [];
  });
  const created = [] as number[];
  for (const candidate of candidates) {
    const existing = (await db.select().from(nexusShieldFindings).where(and(eq(nexusShieldFindings.userId, userId), eq(nexusShieldFindings.ruleCode, candidate.ruleCode), eq(nexusShieldFindings.status, "OPEN"))).limit(1))[0];
    if (existing) continue;
    const inserted = await db.insert(nexusShieldFindings).values({ userId, ruleCode: candidate.ruleCode, riskLevel: candidate.riskLevel, reason: candidate.reason, recommendedAction: candidate.recommendedAction, evidenceJson: JSON.stringify(candidate.evidence) });
    const findingId = Number((inserted as { insertId?: number }).insertId ?? 0);
    const now = new Date();
    const event = await db.insert(nexusActivityEvents).values({ userId, source: "SHIELD", eventType: "SHIELD_FINDING_OPENED", severity: candidate.riskLevel === "BLOCKED" ? "CRITICAL" : "HIGH", evidenceJson: JSON.stringify({ findingId, ...candidate }), correlationKey: `shield:${candidate.ruleCode}:${candidate.evidence.positionId ?? "account"}`, occurredAt: now });
    const eventId = Number((event as { insertId?: number }).insertId ?? 0);
    if (candidate.riskLevel === "BLOCKED") {
      await db.insert(nexusSecurityModes).values({ userId, enabled: 1, activatedBy: "RULE", reason: `Shield rule ${candidate.ruleCode}: ${candidate.reason}`, activatedAt: now }).onDuplicateKeyUpdate({ set: { enabled: 1, activatedBy: "RULE", reason: `Shield rule ${candidate.ruleCode}: ${candidate.reason}`, activatedAt: now } });
      const incidentKey = `shield-${candidate.ruleCode}-${candidate.evidence.positionId ?? "account"}`;
      await db.insert(nexusIncidents).values({ userId, incidentKey, severity: "CRITICAL", summary: candidate.reason, evidenceJson: JSON.stringify({ findingId, eventId, ...candidate }), firstDetectedAt: now, lastUpdatedAt: now }).onDuplicateKeyUpdate({ set: { lastUpdatedAt: now, evidenceJson: JSON.stringify({ findingId, eventId, ...candidate }) } });
    }
    created.push(findingId);
  }
  return { evaluatedAt: new Date(), candidates, createdFindingIds: created.filter(Boolean) };
}

export async function createActionPreview(userId: number, actionType: "ENABLE_SECURITY_MODE" | "DISABLE_SECURITY_MODE") {
  const db = await getDb();
  if (!db) throw new Error("Action preview storage is temporarily unavailable.");
  const [overview, existing] = await Promise.all([getCommandOverview(userId), db.select().from(nexusSecurityModes).where(eq(nexusSecurityModes.userId, userId)).limit(1)]);
  const currentEnabled = existing[0]?.enabled === 1;
  const enabling = actionType === "ENABLE_SECURITY_MODE";
  const status = overview.health.engineStatus === "FAILED" ? "BLOCKED" as const : overview.risk.overallScore !== null && overview.risk.overallScore >= 60 ? "REVIEW_REQUIRED" as const : "SAFE" as const;
  const now = new Date();
  const inserted = await db.insert(nexusActionApprovals).values({
    userId, actionType, requestedBy: "USER", previewStatus: status,
    whatText: enabling ? "Enable Nexus Security Mode for this user." : "Disable Nexus Security Mode for this user.",
    whyText: enabling ? "The user requested stricter review for sensitive actions." : "The user requested a return to normal review rules.",
    impactText: enabling ? "Future supported sensitive actions require a risk check, evidence check, and explicit approval." : "Future supported sensitive actions return to normal approval requirements.",
    evidenceJson: JSON.stringify({ health: overview.health, risk: overview.risk, currentSecurityMode: currentEnabled }),
    requiredPermissionsJson: JSON.stringify(["OWN_ACTION_APPROVAL"]),
    state: status === "BLOCKED" ? "REJECTED" : "PENDING",
    expiresAt: new Date(now.getTime() + 15 * 60_000),
    resolvedAt: status === "BLOCKED" ? now : null,
    resolutionReason: status === "BLOCKED" ? "Monitoring health is failed; no safety-mode change is approved without current health evidence." : null,
  });
  return { approvalId: Number((inserted as { insertId?: number }).insertId ?? 0), previewStatus: status, currentEnabled };
}

export async function resolveSecurityModeApproval(userId: number, approvalId: number, decision: "APPROVE" | "REJECT" | "CANCEL" | "ESCALATE") {
  const db = await getDb();
  if (!db) throw new Error("Action approval storage is temporarily unavailable.");
  const approval = (await db.select().from(nexusActionApprovals).where(and(eq(nexusActionApprovals.id, approvalId), eq(nexusActionApprovals.userId, userId))).limit(1))[0];
  if (!approval) throw new Error("Action preview not found.");
  if (approval.state !== "PENDING") throw new Error("Action preview is no longer pending.");
  const now = new Date();
  const nextState = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : decision === "CANCEL" ? "CANCELLED" : "ESCALATED";
  await db.update(nexusActionApprovals).set({ state: nextState, resolvedAt: now, resolutionReason: `User decision: ${decision}` }).where(eq(nexusActionApprovals.id, approval.id));
  if (decision === "APPROVE" && (approval.actionType === "ENABLE_SECURITY_MODE" || approval.actionType === "DISABLE_SECURITY_MODE")) {
    const enabled = approval.actionType === "ENABLE_SECURITY_MODE" ? 1 : 0;
    await db.insert(nexusSecurityModes).values({ userId, enabled, activatedBy: "USER", reason: `Approved action preview #${approval.id}`, activatedAt: now })
      .onDuplicateKeyUpdate({ set: { enabled, activatedBy: "USER", reason: `Approved action preview #${approval.id}`, activatedAt: now } });
  }
  await db.insert(nexusActivityEvents).values({ userId, source: "APPROVAL", eventType: "ACTION_PREVIEW_RESOLVED", severity: decision === "ESCALATE" ? "MEDIUM" : "INFO", evidenceJson: JSON.stringify({ approvalId: approval.id, actionType: approval.actionType, decision }), relatedApprovalId: approval.id, correlationKey: `approval:${approval.id}`, occurredAt: now });
  return { approvalId: approval.id, state: nextState };
}
