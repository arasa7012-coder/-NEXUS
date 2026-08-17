import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { entitlementDecisions, entitlementUsagePeriods, userFeatureEntitlements, userSubscriptions } from "../../drizzle/schema";
import { entitlementCatalog, effectivePlanForState, isSubscriptionStateEntitled, planConfiguration, type EntitlementKey, type SubscriptionPlan, type SubscriptionState, type UsageMetric } from "../entitlements/catalog";
import { getDb } from "../db";

const legacyFeatureAliases: Record<string, EntitlementKey> = {
  basic_market_analysis: "market_basic", advanced_backtesting: "backtesting_advanced", parameter_search: "parameter_search", advanced_strategy_analysis: "advanced_ai_features", copilot_basic: "ai_copilot_basic", copilot_advanced: "ai_copilot_advanced", smart_alerts: "smart_alerts", advanced_alerts: "advanced_alerts", daily_briefing: "daily_briefing", portfolio_ai: "portfolio_ai", strategy_ai_analysis: "advanced_ai_features", paper_position_monitoring: "continuous_monitoring", advanced_position_monitoring: "continuous_monitoring", notification_readiness: "smart_alerts", advanced_notification_channels: "advanced_alerts", nexus_command: "risk_basic", nexus_shield: "risk_basic", advanced_incident_correlation: "risk_advanced", action_approval_center: "risk_basic", managed_monitoring_heartbeat: "continuous_monitoring",
};

export class EntitlementError extends Error {
  constructor(public readonly code: "FEATURE_LOCKED" | "USAGE_LIMIT" | "UNAVAILABLE", message: string, public readonly decision?: EntitlementDecisionResult) { super(message); }
}

export type EntitlementDecisionResult = {
  featureKey: EntitlementKey; allowed: boolean; reasonCode: string; requestedPlan: SubscriptionPlan; effectivePlan: SubscriptionPlan; subscriptionState: SubscriptionState; subscription: { plan: SubscriptionPlan; state: SubscriptionState; trialEndsAt: Date | null; currentPeriodEndsAt: Date | null; stateReason: string }; requiredPlan: SubscriptionPlan; usage: { metric: UsageMetric; limit: number; used: number; remaining: number } | null;
};

function period(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
function planRank(plan: SubscriptionPlan) { return plan === "ELITE" ? 3 : plan === "PRO" ? 2 : 1; }
function asPlan(value: string): SubscriptionPlan { return value === "ELITE" || value === "PRO" ? value : "FREE"; }
function asState(value: string): SubscriptionState { return ["FREE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"].includes(value) ? value as SubscriptionState : "FREE"; }
async function dbOrThrow() { const db = await getDb(); if (!db) throw new EntitlementError("UNAVAILABLE", "Subscription storage is temporarily unavailable."); return db; }

async function subscriptionFor(userId: number) {
  const db = await dbOrThrow();
  let row = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1))[0];
  if (!row) {
    try { await db.insert(userSubscriptions).values({ userId, plan: "FREE", state: "FREE", stateReason: "INITIAL_FREE" }); } catch { /* A concurrent initial read may have created the row. */ }
    row = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1))[0];
  }
  if (!row) throw new EntitlementError("UNAVAILABLE", "Subscription initialization did not complete.");
  return { db, row };
}

function normalizedSubscription(row: typeof userSubscriptions.$inferSelect, now: Date) {
  let plan = asPlan(row.plan);
  let state = asState(row.state);
  let stateReason = row.stateReason;
  if (state === "TRIALING" && (!row.trialEndsAt || row.trialEndsAt.getTime() <= now.getTime())) { state = "EXPIRED"; plan = "FREE"; stateReason = "TRIAL_EXPIRED"; }
  if (state === "ACTIVE" && row.currentPeriodEndsAt && row.currentPeriodEndsAt.getTime() <= now.getTime()) { state = "EXPIRED"; plan = "FREE"; stateReason = "PERIOD_EXPIRED"; }
  return { plan, state, stateReason, trialEndsAt: row.trialEndsAt, currentPeriodEndsAt: row.currentPeriodEndsAt };
}

async function storedOverride(userId: number, featureKey: EntitlementKey) {
  const db = await dbOrThrow();
  const candidates = [featureKey, ...Object.entries(legacyFeatureAliases).filter(([, mapped]) => mapped === featureKey).map(([legacy]) => legacy)];
  const rows = await db.select().from(userFeatureEntitlements).where(eq(userFeatureEntitlements.userId, userId));
  return rows.filter((row) => candidates.includes(row.featureKey)).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;
}

async function usageFor(userId: number, metric: UsageMetric, now: Date) {
  const db = await dbOrThrow(); const window = period(now);
  const row = (await db.select().from(entitlementUsagePeriods).where(and(eq(entitlementUsagePeriods.userId, userId), eq(entitlementUsagePeriods.metric, metric), eq(entitlementUsagePeriods.periodStart, window.start))).limit(1))[0];
  return { row, window, used: row?.usedCount ?? 0 };
}

async function auditDecision(userId: number, decision: EntitlementDecisionResult) {
  const db = await dbOrThrow();
  await db.insert(entitlementDecisions).values({ decisionKey: randomUUID(), userId, featureKey: decision.featureKey, requestedPlan: decision.requestedPlan, effectivePlan: decision.effectivePlan, subscriptionState: decision.subscriptionState, allowed: decision.allowed ? 1 : 0, reasonCode: decision.reasonCode, limitValue: decision.usage?.limit ?? null, usageValue: decision.usage?.used ?? null, evidenceJson: JSON.stringify({ requiredPlan: decision.requiredPlan, metric: decision.usage?.metric ?? null, remaining: decision.usage?.remaining ?? null, stateReason: decision.subscription.stateReason }) });
}

export async function resolveEntitlement(userId: number, featureKey: EntitlementKey, options: { audit?: boolean; now?: Date } = {}): Promise<EntitlementDecisionResult> {
  const now = options.now ?? new Date(); const { row } = await subscriptionFor(userId); const subscription = normalizedSubscription(row, now); const override = await storedOverride(userId, featureKey); const requestedPlan = subscription.plan;
  let effectivePlan = effectivePlanForState(subscription.plan, subscription.state);
  let allowed = false; let reasonCode = isSubscriptionStateEntitled(subscription.state) ? "PLAN_FEATURE_DISABLED" : "SUBSCRIPTION_STATE_RESTRICTED";
  if (override?.enabled === 0) { reasonCode = "ADMIN_OVERRIDE_DISABLED"; }
  else {
    if (override && planRank(asPlan(override.tier)) > planRank(effectivePlan)) effectivePlan = asPlan(override.tier);
    allowed = planConfiguration[effectivePlan].enabled.includes(featureKey);
    if (allowed) reasonCode = override ? "ADMIN_OVERRIDE_GRANTED" : "PLAN_GRANTED";
  }
  const metric = entitlementCatalog[featureKey].usageMetric; const limit = metric ? planConfiguration[effectivePlan].limits[metric] : null; const usageState = metric ? await usageFor(userId, metric, now) : null;
  const usage = metric && limit !== null ? { metric, limit, used: usageState!.used, remaining: Math.max(0, limit - usageState!.used) } : null;
  if (allowed && usage && usage.remaining <= 0) { allowed = false; reasonCode = "USAGE_LIMIT_REACHED"; }
  const decision: EntitlementDecisionResult = { featureKey, allowed, reasonCode, requestedPlan, effectivePlan, subscriptionState: subscription.state, subscription, requiredPlan: minimumPlan(featureKey), usage };
  if (options.audit) await auditDecision(userId, decision);
  return decision;
}

function minimumPlan(featureKey: EntitlementKey): SubscriptionPlan { return (subscriptionPlansFor(featureKey)[0] ?? "ELITE"); }
function subscriptionPlansFor(featureKey: EntitlementKey): SubscriptionPlan[] { return (["FREE", "PRO", "ELITE"] as SubscriptionPlan[]).filter((plan) => planConfiguration[plan].enabled.includes(featureKey)); }

export async function requireEntitlement(userId: number, featureKey: EntitlementKey) { const decision = await resolveEntitlement(userId, featureKey, { audit: true }); if (!decision.allowed) throw new EntitlementError(decision.reasonCode === "USAGE_LIMIT_REACHED" ? "USAGE_LIMIT" : "FEATURE_LOCKED", `This account does not currently have access to ${featureKey}.`, decision); return decision; }

/** Atomically reserves one server-owned usage unit after entitlement approval. */
export async function consumeEntitlementUsage(userId: number, featureKey: EntitlementKey) {
  const decision = await requireEntitlement(userId, featureKey); if (!decision.usage) return decision;
  const db = await dbOrThrow(); const now = new Date(); const { metric, limit } = decision.usage; const { row, window } = await usageFor(userId, metric, now);
  if (!row) {
    try { await db.insert(entitlementUsagePeriods).values({ userId, metric, periodStart: window.start, periodEnd: window.end, usedCount: 1 }); return { ...decision, usage: { ...decision.usage, used: 1, remaining: Math.max(0, limit - 1) } }; } catch { /* Concurrent first reservation retries through bounded update. */ }
  }
  const result = await db.update(entitlementUsagePeriods).set({ usedCount: sql`${entitlementUsagePeriods.usedCount} + 1` }).where(and(eq(entitlementUsagePeriods.userId, userId), eq(entitlementUsagePeriods.metric, metric), eq(entitlementUsagePeriods.periodStart, window.start), sql`${entitlementUsagePeriods.usedCount} < ${limit}`));
  const affected = Number((result as unknown as { affectedRows?: number; rowsAffected?: number }).affectedRows ?? (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0);
  if (affected !== 1) { const denied = await resolveEntitlement(userId, featureKey, { audit: true, now }); throw new EntitlementError("USAGE_LIMIT", "The configured monthly usage limit has been reached.", denied); }
  return { ...decision, usage: { ...decision.usage, used: decision.usage.used + 1, remaining: Math.max(0, limit - decision.usage.used - 1) } };
}

export async function entitlementAccountSummary(userId: number) {
  const { row } = await subscriptionFor(userId); const now = new Date(); const subscription = normalizedSubscription(row, now); const features = await Promise.all((Object.keys(entitlementCatalog) as EntitlementKey[]).map((featureKey) => resolveEntitlement(userId, featureKey, { now })));
  return { subscription, plans: planConfiguration, features, paymentProviderConfigured: false as const, voiceProviderConfigured: false as const };
}
