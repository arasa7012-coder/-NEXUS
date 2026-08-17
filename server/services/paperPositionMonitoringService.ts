import { and, desc, eq, ne } from "drizzle-orm";
import { paperPositionMonitoringEvents, paperPositionMonitoringStates, simulationPortfolios } from "../../drizzle/schema";
import { derivePaperPositionState, hasMonitoringStateTransition, monitoringAlertValue, monitoringEventKey, monitoringExposurePercent, shouldCloseMonitoredPosition, type PaperPositionState } from "../monitoring/contracts";
import { getDb } from "../db";
import { getSimulationPortfolioProtection, monitorSimulationPositions } from "./simulationPortfolio";

const STATE_VALUES = ["OPEN", "WATCH", "STOP_APPROACHING", "TARGET_APPROACHING", "RISK_INCREASED", "DATA_STALE", "PROTECTION_TRIGGERED", "CLOSED"] as const;

function asDecimal(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : value.toFixed(8);
}

/** Runs only when a signed-in user requests monitoring. It records observations but never mutates a paper ledger. */
export async function evaluatePaperPositionMonitoring(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Paper-monitoring storage is temporarily unavailable.");
  const [portfolioRows, monitoredResult, protection] = await Promise.all([
    db.select().from(simulationPortfolios).where(eq(simulationPortfolios.userId, userId)).limit(1),
    monitorSimulationPositions(userId),
    getSimulationPortfolioProtection(userId),
  ]);
  const portfolio = portfolioRows[0];
  if (!portfolio) return { simulation: true as const, evaluatedAt: Date.now(), transitions: [], positions: [], execution: "USER_REQUESTED_ONLY" as const };
  const exposurePercent = monitoringExposurePercent(protection.exposure);
  const existing = await db.select().from(paperPositionMonitoringStates).where(eq(paperPositionMonitoringStates.userId, userId));
  const existingByPosition = new Map(existing.map((row) => [row.positionId, row]));
  const transitions: Array<{ positionId: number; previousState: PaperPositionState | null; nextState: PaperPositionState; reason: string }> = [];
  const observedPositionIds = new Set<number>();

  for (const position of monitoredResult.positions) {
    observedPositionIds.add(position.positionId);
    const decision = derivePaperPositionState(position, exposurePercent);
    const prior = existingByPosition.get(position.positionId);
    const previousState = prior?.state ?? null;
    const currentValue = monitoringAlertValue(position);
    const evidence = {
      simulation: true,
      positionId: position.positionId,
      symbol: position.symbol,
      unrealizedPnlUsd: position.unrealizedPnlUsd,
      stopDistancePercent: position.distanceToStopPercent,
      targetDistancePercent: position.distanceToTargetPercent,
      exposurePercent,
      riskLevel: position.currentRiskLevel,
      regime: position.currentRegime,
      dataQuality: position.dataQuality,
      providerUpdatedAt: position.providerUpdatedAt,
      protectionStatus: position.protectionStatus,
    };
    await db.insert(paperPositionMonitoringStates).values({
      userId, simulationPortfolioId: portfolio.id, positionId: position.positionId, symbol: position.symbol,
      state: decision.state, previousState: previousState ?? undefined, currentPriceUsd: asDecimal(position.currentPriceUsd), previousPriceUsd: prior?.currentPriceUsd ?? null,
      exposurePercent: asDecimal(exposurePercent), riskLevel: position.currentRiskLevel, marketRegime: position.currentRegime,
      dataQuality: position.dataQuality, dataSource: position.source, providerUpdatedAt: position.providerUpdatedAt === null ? null : new Date(position.providerUpdatedAt),
      triggerReason: decision.reason, evidenceJson: JSON.stringify(evidence), observedAt: new Date(position.evaluatedAt),
    }).onDuplicateKeyUpdate({ set: {
      state: decision.state, previousState: previousState ?? null, currentPriceUsd: asDecimal(position.currentPriceUsd), previousPriceUsd: prior?.currentPriceUsd ?? null,
      exposurePercent: asDecimal(exposurePercent), riskLevel: position.currentRiskLevel, marketRegime: position.currentRegime,
      dataQuality: position.dataQuality, dataSource: position.source, providerUpdatedAt: position.providerUpdatedAt === null ? null : new Date(position.providerUpdatedAt),
      triggerReason: decision.reason, evidenceJson: JSON.stringify(evidence), observedAt: new Date(position.evaluatedAt),
    }});
    if (hasMonitoringStateTransition(previousState, decision.state)) {
      const eventKey = monitoringEventKey(position.positionId, decision.state, position.providerUpdatedAt, position.evaluatedAt);
      try {
        await db.insert(paperPositionMonitoringEvents).values({
          eventKey, userId, simulationPortfolioId: portfolio.id, positionId: position.positionId, symbol: position.symbol,
          previousState: previousState ?? undefined, nextState: decision.state, severity: decision.severity,
          currentValue, previousValue: prior?.currentPriceUsd ?? null, riskLevel: position.currentRiskLevel, marketRegime: position.currentRegime,
          dataQuality: position.dataQuality, dataSource: position.source, providerUpdatedAt: position.providerUpdatedAt === null ? null : new Date(position.providerUpdatedAt),
          triggerReason: decision.reason, evidenceJson: JSON.stringify(evidence), observedAt: new Date(position.evaluatedAt),
        });
      } catch { /* event key is idempotent for the same state observation */ }
      transitions.push({ positionId: position.positionId, previousState, nextState: decision.state, reason: decision.reason });
    }
  }

  for (const prior of existing.filter((row) => shouldCloseMonitoredPosition(row.state, observedPositionIds.has(row.positionId)))) {
    const now = Date.now();
    const reason = "The paper position is no longer open in the simulation ledger.";
    await db.update(paperPositionMonitoringStates).set({ previousState: prior.state, state: "CLOSED", triggerReason: reason, observedAt: new Date(now) }).where(eq(paperPositionMonitoringStates.id, prior.id));
    try {
      await db.insert(paperPositionMonitoringEvents).values({
        eventKey: monitoringEventKey(prior.positionId, "CLOSED", null, now), userId, simulationPortfolioId: prior.simulationPortfolioId, positionId: prior.positionId, symbol: prior.symbol,
        previousState: prior.state, nextState: "CLOSED", severity: "INFO", currentValue: null, previousValue: prior.currentPriceUsd ?? null,
        riskLevel: prior.riskLevel, marketRegime: prior.marketRegime, dataQuality: prior.dataQuality, dataSource: prior.dataSource,
        providerUpdatedAt: prior.providerUpdatedAt, triggerReason: reason, evidenceJson: prior.evidenceJson, observedAt: new Date(now),
      });
    } catch { /* closed transition already audited */ }
    transitions.push({ positionId: prior.positionId, previousState: prior.state, nextState: "CLOSED", reason });
  }
  return { simulation: true as const, evaluatedAt: monitoredResult.evaluatedAt, positions: monitoredResult.positions, transitions, execution: "USER_REQUESTED_ONLY" as const };
}

export async function listPaperPositionMonitoring(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Paper-monitoring storage is temporarily unavailable.");
  const [states, events] = await Promise.all([
    db.select().from(paperPositionMonitoringStates).where(eq(paperPositionMonitoringStates.userId, userId)).orderBy(desc(paperPositionMonitoringStates.updatedAt)).limit(Math.min(Math.max(limit, 1), 100)),
    db.select().from(paperPositionMonitoringEvents).where(eq(paperPositionMonitoringEvents.userId, userId)).orderBy(desc(paperPositionMonitoringEvents.createdAt)).limit(Math.min(Math.max(limit, 1), 100)),
  ]);
  return { states, events, simulation: true as const };
}
