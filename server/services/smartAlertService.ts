import { and, desc, eq, isNull } from "drizzle-orm";
import { paperPositionMonitoringEvents, simulationPortfolios, simulationPositions, simulationRiskEvents, smartAlertEvents } from "../../drizzle/schema";
import { shouldEmitSmartAlert } from "../copilot/contracts";
import type { SmartAlertSeverity, SmartAlertType } from "../copilot/contracts";
import { getCopilotPreferences } from "./copilotService";
import { getDb } from "../db";
import { getAssetIntelligence, supportedIntelligenceAssets as verifiedAssets } from "./marketIntelligence";
import { evaluatePaperPositionMonitoring } from "./paperPositionMonitoringService";

type Candidate = { type: SmartAlertType; severity: SmartAlertSeverity; symbol: string | null; positionId?: number | null; strategyId?: number | null; alertGroupKey?: string | null; currentValue?: string | null; previousValue?: string | null; title: string; summary: string; whyItMatters: string; attentionContext: string; dataQuality: string; dataSource: string | null; providerUpdatedAt: number | null; evidence: unknown };

function candidateKey(candidate: Candidate) {
  return `${candidate.type}:${candidate.symbol ?? "MARKET"}:${candidate.providerUpdatedAt ?? "unavailable"}`.slice(0, 160);
}

async function createIfEligible(userId: number, candidate: Candidate, minimumSeverity: SmartAlertSeverity, cooldownMinutes: number, enabled: Set<SmartAlertType>) {
  if (!shouldEmitSmartAlert({ enabled: Array.from(enabled), minimumSeverity, type: candidate.type, severity: candidate.severity, priorCooldownUntil: null, now: Date.now() })) return null;
  const db = await getDb();
  if (!db) throw new Error("Smart alert storage is temporarily unavailable.");
  const existing = await db.select().from(smartAlertEvents).where(and(eq(smartAlertEvents.userId, userId), eq(smartAlertEvents.eventType, candidate.type), candidate.symbol ? eq(smartAlertEvents.symbol, candidate.symbol) : isNull(smartAlertEvents.symbol))).orderBy(desc(smartAlertEvents.createdAt)).limit(1);
  const now = new Date();
  if (!shouldEmitSmartAlert({ enabled: Array.from(enabled), minimumSeverity, type: candidate.type, severity: candidate.severity, priorCooldownUntil: existing[0]?.cooldownUntil.getTime() ?? null, now: now.getTime() })) return null;
  const cooldownUntil = new Date(now.getTime() + cooldownMinutes * 60_000);
  try {
    const result = await db.insert(smartAlertEvents).values({ userId, alertKey: candidateKey(candidate), alertGroupKey: candidate.alertGroupKey ?? `${candidate.type}:${candidate.symbol ?? "MARKET"}`, eventType: candidate.type, severity: candidate.severity, symbol: candidate.symbol, positionId: candidate.positionId ?? null, strategyId: candidate.strategyId ?? null, currentValue: candidate.currentValue ?? null, previousValue: candidate.previousValue ?? null, title: candidate.title, summary: candidate.summary, whyItMatters: candidate.whyItMatters, attentionContext: candidate.attentionContext, dataQuality: candidate.dataQuality, dataSource: candidate.dataSource, providerUpdatedAt: candidate.providerUpdatedAt ? new Date(candidate.providerUpdatedAt) : null, evidenceJson: JSON.stringify(candidate.evidence), observedAt: now, cooldownUntil });
    return Number((result as { insertId?: number }).insertId ?? 0);
  } catch { return null; }
}

export async function evaluateSmartAlerts(userId: number) {
  const preferences = await getCopilotPreferences(userId);
  const desired = preferences.favoriteSymbols.length ? preferences.favoriteSymbols : ["BTC", "ETH", "SOL"];
  const candidates: Candidate[] = [];
  try { await evaluatePaperPositionMonitoring(userId); } catch { /* Monitoring absence becomes explicit only when stored evidence exists; no alert fabricates a state. */ }
  for (const symbol of desired) {
    const asset = verifiedAssets.find((item) => item.symbol === symbol);
    if (!asset) continue;
    try {
      const analysis = await getAssetIntelligence({ assetId: asset.id, preferredTimeframe: "4h" });
      const frame = analysis.primaryTimeframe ? analysis.timeframes.find((item) => item.timeframe === analysis.primaryTimeframe) : null;
      const metadata = frame?.metadata;
      const quality = metadata?.quality ?? "UNAVAILABLE";
      const source = metadata?.source ?? null;
      const providerUpdatedAt = metadata?.providerUpdatedAt ?? null;
      if (!frame || quality === "UNAVAILABLE" || quality === "ERROR") {
        candidates.push({ type: "DATA_UNAVAILABLE", severity: "WATCH", symbol, title: `${symbol} evidence unavailable`, summary: "Verified intelligence did not return a usable primary timeframe.", whyItMatters: "Nexus will not infer a market condition without verified evidence.", attentionContext: "Review the provider status before relying on analysis.", dataQuality: quality, dataSource: source, providerUpdatedAt, evidence: { assetId: asset.id, unavailableReasons: frame?.metadata.unavailableReasons ?? ["PRIMARY_TIMEFRAME_UNAVAILABLE"] } });
        continue;
      }
      const regime = frame.regime.status === "AVAILABLE" ? frame.regime.value.regime : "UNCLEAR";
      const volatility = frame.volatility.status === "AVAILABLE" ? frame.volatility.value.level : "UNAVAILABLE";
      const structure = frame.structure.status === "AVAILABLE" ? frame.structure.value : null;
      const evidence = { assetId: asset.id, timeframe: frame.timeframe, quality, source, providerUpdatedAt, regime, volatility, structureEvent: structure?.event ?? "NONE", opportunityScore: analysis.opportunityScore.value, riskScore: analysis.riskScore.value, scoreEvidence: { opportunity: analysis.opportunityScore.factors, risk: analysis.riskScore.factors } };
      if (volatility === "HIGH") candidates.push({ type: "VOLATILITY_SPIKE", severity: "WARNING", symbol, title: `${symbol} high volatility`, summary: `Verified ${frame.timeframe} analysis classifies volatility as HIGH.`, whyItMatters: "High volatility can widen uncertainty around stops, targets, and position sizing.", attentionContext: "Review paper-risk settings and data freshness before acting.", dataQuality: quality, dataSource: source, providerUpdatedAt, evidence });
      if (structure?.event === "BREAKOUT" || structure?.event === "BREAKDOWN") candidates.push({ type: "STRUCTURE_CHANGE", severity: "WATCH", symbol, title: `${symbol} ${structure.event.toLowerCase()} observed`, summary: `Verified structure analysis reported ${structure.event} on ${frame.timeframe}.`, whyItMatters: "Structure events are analytical observations, not execution instructions.", attentionContext: "Inspect the chart evidence and Risk Engine before any paper-trade preview.", dataQuality: quality, dataSource: source, providerUpdatedAt, evidence });
      if ((analysis.opportunityScore.value ?? 0) >= 70) candidates.push({ type: "OPPORTUNITY_SCORE_HIGH", severity: "WATCH", symbol, title: `${symbol} elevated opportunity score`, summary: `Verified opportunity score is ${analysis.opportunityScore.value}.`, whyItMatters: "The score is evidence-based but probabilistic and incomplete when coverage is limited.", attentionContext: "Review the listed factors; it never bypasses Risk Engine controls.", dataQuality: quality, dataSource: source, providerUpdatedAt, evidence });
      if ((analysis.riskScore.value ?? 0) >= 70) candidates.push({ type: "RISK_SCORE_HIGH", severity: "WARNING", symbol, title: `${symbol} elevated risk score`, summary: `Verified risk score is ${analysis.riskScore.value}.`, whyItMatters: "Elevated risk can affect paper-position protection and planned reward-risk.", attentionContext: "Review risk factors and any active paper-position protection.", dataQuality: quality, dataSource: source, providerUpdatedAt, evidence });
    } catch (error) {
      candidates.push({ type: "DATA_UNAVAILABLE", severity: "WATCH", symbol, title: `${symbol} evidence unavailable`, summary: "Nexus could not retrieve verified intelligence for this symbol.", whyItMatters: "No alert may infer a missing market condition.", attentionContext: "Try again after provider data is available.", dataQuality: "UNAVAILABLE", dataSource: null, providerUpdatedAt: null, evidence: { symbol, error: error instanceof Error ? error.message : "UNAVAILABLE" } });
    }
  }
  const db = await getDb();
  if (!db) throw new Error("Smart alert storage is temporarily unavailable.");
  const [portfolioRows, riskEvents, monitoringEvents] = await Promise.all([
    db.select().from(simulationPortfolios).where(eq(simulationPortfolios.userId, userId)).limit(1),
    db.select().from(simulationRiskEvents).where(eq(simulationRiskEvents.userId, userId)).orderBy(desc(simulationRiskEvents.createdAt)).limit(20),
    db.select().from(paperPositionMonitoringEvents).where(eq(paperPositionMonitoringEvents.userId, userId)).orderBy(desc(paperPositionMonitoringEvents.createdAt)).limit(20),
  ]);
  const positions = portfolioRows[0]
    ? await db.select().from(simulationPositions).where(eq(simulationPositions.simulationPortfolioId, portfolioRows[0].id)).limit(20)
    : [];
  for (const position of positions) {
    const price = position.monitorLastPriceUsd === null ? null : Number(position.monitorLastPriceUsd);
    const stop = position.stopPriceUsd === null ? null : Number(position.stopPriceUsd);
    const target = position.targetPriceUsd === null ? null : Number(position.targetPriceUsd);
    const metadata = { positionId: position.id, symbol: position.symbol, price, stop, target, riskLevel: position.riskLevel, source: position.dataSource, providerUpdatedAt: position.providerUpdatedAt?.getTime() ?? null, monitorLastEvaluatedAt: position.monitorLastEvaluatedAt?.getTime() ?? null };
    if (price !== null && stop !== null && price > 0 && Math.abs(price - stop) / price <= 0.01) candidates.push({ type: "STOP_PROXIMITY", severity: "WARNING", symbol: position.symbol, title: `${position.symbol} near paper stop`, summary: "The latest session observation is within 1% of the stored paper stop.", whyItMatters: "This is a protective observation only; Nexus does not execute the stop automatically.", attentionContext: "Review the paper position and Risk Engine protection evidence.", dataQuality: position.dataQuality ?? "UNAVAILABLE", dataSource: position.dataSource, providerUpdatedAt: position.providerUpdatedAt?.getTime() ?? null, evidence: metadata });
    if (price !== null && target !== null && price > 0 && Math.abs(price - target) / price <= 0.01) candidates.push({ type: "TARGET_PROXIMITY", severity: "INFO", symbol: position.symbol, title: `${position.symbol} near paper target`, summary: "The latest session observation is within 1% of the stored paper target.", whyItMatters: "Target proximity is observational and does not cause any external or automatic action.", attentionContext: "Inspect the paper position and explicit exit policy.", dataQuality: position.dataQuality ?? "UNAVAILABLE", dataSource: position.dataSource, providerUpdatedAt: position.providerUpdatedAt?.getTime() ?? null, evidence: metadata });
    if (position.riskLevel === "HIGH" || position.riskLevel === "EXTREME") candidates.push({ type: "PAPER_POSITION_RISK_CHANGE", severity: position.riskLevel === "EXTREME" ? "CRITICAL" : "WARNING", symbol: position.symbol, title: `${position.symbol} paper-position risk ${position.riskLevel}`, summary: `The stored paper position is classified ${position.riskLevel} by the Risk Engine.`, whyItMatters: "The classification is persisted risk evidence, not an execution signal.", attentionContext: "Review planned risk, stop method, and current data quality.", dataQuality: position.dataQuality ?? "UNAVAILABLE", dataSource: position.dataSource, providerUpdatedAt: position.providerUpdatedAt?.getTime() ?? null, evidence: metadata });
  }
  for (const event of riskEvents) {
    if (event.eventType !== "REGIME_CHANGED" && event.eventType !== "DATA_UNAVAILABLE" && event.eventType !== "STOP_OBSERVED" && event.eventType !== "TARGET_OBSERVED") continue;
    const type: SmartAlertType = event.eventType === "REGIME_CHANGED" ? "MARKET_REGIME_CHANGE" : event.eventType === "DATA_UNAVAILABLE" ? "DATA_UNAVAILABLE" : event.eventType === "STOP_OBSERVED" ? "STOP_PROXIMITY" : "TARGET_PROXIMITY";
    candidates.push({ type, severity: event.severity === "CRITICAL" ? "CRITICAL" : event.severity === "WARNING" ? "WARNING" : "INFO", symbol: event.symbol, title: `${event.symbol ?? "Paper position"} ${event.eventType.toLowerCase().replaceAll("_", " ")}`, summary: "A verified paper-risk monitoring event was recorded in the current or prior active session.", whyItMatters: "Risk-event evidence is immutable and does not execute or close any position.", attentionContext: "Open Risk Audit to inspect the recorded monitoring details.", dataQuality: event.eventType === "DATA_UNAVAILABLE" ? "UNAVAILABLE" : "OBSERVED", dataSource: event.dataSource, providerUpdatedAt: event.providerUpdatedAt?.getTime() ?? null, evidence: { riskEventId: event.id, eventType: event.eventType, detailsJson: event.detailsJson, observedPriceUsd: event.observedPriceUsd, createdAt: event.createdAt } });
  }
  for (const event of monitoringEvents) {
    const type: SmartAlertType = event.nextState === "STOP_APPROACHING" || event.nextState === "PROTECTION_TRIGGERED"
      ? "STOP_PROXIMITY"
      : event.nextState === "TARGET_APPROACHING" ? "TARGET_PROXIMITY"
        : event.nextState === "RISK_INCREASED" ? "PAPER_POSITION_RISK_CHANGE"
          : event.nextState === "DATA_STALE" ? "DATA_UNAVAILABLE"
            : event.nextState === "WATCH" ? "MARKET_REGIME_CHANGE"
              : "PAPER_POSITION_RISK_CHANGE";
    candidates.push({
      type, severity: event.severity, symbol: event.symbol, positionId: event.positionId, alertGroupKey: `POSITION:${event.positionId}`,
      currentValue: event.currentValue, previousValue: event.previousValue,
      title: `${event.symbol} monitoring state: ${event.nextState.toLowerCase().replaceAll("_", " ")}`,
      summary: event.triggerReason,
      whyItMatters: "This is a deterministic paper-position observation based on verified market and Risk Engine evidence.",
      attentionContext: "Review the related monitoring evidence; no paper or external order is created from this event.",
      dataQuality: event.dataQuality, dataSource: event.dataSource, providerUpdatedAt: event.providerUpdatedAt?.getTime() ?? null,
      evidence: { monitoringEventId: event.id, positionId: event.positionId, previousState: event.previousState, nextState: event.nextState, currentValue: event.currentValue, previousValue: event.previousValue, riskLevel: event.riskLevel, regime: event.marketRegime, details: event.evidenceJson },
    });
  }
  const created = (await Promise.all(candidates.map((candidate) => createIfEligible(userId, candidate, preferences.minimumAlertSeverity, preferences.alertCooldownMinutes, new Set(preferences.enabledAlertTypes))))).filter((id): id is number => id !== null);
  return { evaluatedAt: Date.now(), createdAlertIds: created, candidatesEvaluated: candidates.length, execution: "USER_REQUESTED_ONLY" as const, simulationOnly: true as const };
}

export async function listSmartAlerts(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Smart alert storage is temporarily unavailable.");
  return db.select().from(smartAlertEvents).where(eq(smartAlertEvents.userId, userId)).orderBy(desc(smartAlertEvents.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function markSmartAlertRead(userId: number, alertId: number) {
  const db = await getDb();
  if (!db) throw new Error("Smart alert storage is temporarily unavailable.");
  const rows = await db.select().from(smartAlertEvents).where(and(eq(smartAlertEvents.userId, userId), eq(smartAlertEvents.id, alertId))).limit(1);
  if (!rows[0]) throw new Error("Smart alert not found.");
  await db.update(smartAlertEvents).set({ isRead: 1 }).where(eq(smartAlertEvents.id, alertId));
  return { success: true as const };
}
