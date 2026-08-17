import { calculateRiskLevel } from "./riskLevel";
import type { IntelligenceRiskContext, MonitoredPositionRisk } from "./types";

export interface PositionMonitoringInput {
  positionId: number;
  symbol: string;
  quantity: number;
  averageCostUsd: number;
  stopPriceUsd: number | null;
  targetPriceUsd: number | null;
  plannedRiskUsd: number | null;
  openingRegime: string | null;
  quote: {
    priceUsd: number;
    source: string;
    providerUpdatedAt: number | null;
    isStale: boolean;
  } | null;
  intelligence: IntelligenceRiskContext;
  now: number;
}

export class PositionMonitoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PositionMonitoringError";
  }
}

function finiteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new PositionMonitoringError(`${label} must be finite and non-negative.`);
}

export function evaluatePositionRisk(input: PositionMonitoringInput): MonitoredPositionRisk {
  if (!Number.isInteger(input.positionId) || input.positionId <= 0) throw new PositionMonitoringError("Position identifier must be positive.");
  if (!/^[A-Z0-9]{2,15}$/.test(input.symbol.trim().toUpperCase())) throw new PositionMonitoringError("Position symbol is invalid.");
  finiteNonNegative(input.quantity, "Position quantity");
  finiteNonNegative(input.averageCostUsd, "Average cost");
  if (!Number.isFinite(input.now)) throw new PositionMonitoringError("Evaluation timestamp must be finite.");

  const priceUsd = input.quote?.priceUsd;
  const quoteUsable = priceUsd !== undefined && Number.isFinite(priceUsd) && priceUsd > 0 && !input.quote?.isStale;
  const dataQuality = quoteUsable ? input.intelligence.dataQuality : "UNAVAILABLE";
  const riskLevel = calculateRiskLevel({
    dataQuality,
    atrPercent: quoteUsable && input.intelligence.atrUsd !== null ? (input.intelligence.atrUsd / priceUsd) * 100 : null,
    timeframeConflict: input.intelligence.timeframeConflict,
    intelligenceRiskScore: input.intelligence.intelligenceRiskScore,
    signalStrength: input.intelligence.signalStrength,
    dailyDrawdownPercent: 0,
  });
  const currentRegime = input.intelligence.regime;
  const regimeChanged = input.openingRegime !== null && currentRegime !== null && input.openingRegime !== currentRegime;
  const protectionStatus = !quoteUsable || dataQuality !== "LIVE"
    ? "DATA_UNAVAILABLE"
    : input.stopPriceUsd !== null && priceUsd <= input.stopPriceUsd
      ? "STOP_OBSERVED"
      : input.targetPriceUsd !== null && priceUsd >= input.targetPriceUsd
        ? "TARGET_OBSERVED"
        : "MONITORED";

  return {
    positionId: input.positionId,
    symbol: input.symbol.trim().toUpperCase(),
    quantity: input.quantity,
    currentPriceUsd: quoteUsable ? priceUsd : null,
    unrealizedPnlUsd: quoteUsable ? (priceUsd - input.averageCostUsd) * input.quantity : null,
    stopPriceUsd: input.stopPriceUsd,
    targetPriceUsd: input.targetPriceUsd,
    distanceToStopPercent: quoteUsable && input.stopPriceUsd !== null ? ((priceUsd - input.stopPriceUsd) / priceUsd) * 100 : null,
    distanceToTargetPercent: quoteUsable && input.targetPriceUsd !== null ? ((input.targetPriceUsd - priceUsd) / priceUsd) * 100 : null,
    plannedRiskUsd: input.plannedRiskUsd,
    currentRiskLevel: riskLevel.level,
    openingRegime: input.openingRegime,
    currentRegime,
    regimeChanged,
    dataQuality,
    source: quoteUsable ? input.quote!.source : null,
    providerUpdatedAt: quoteUsable ? input.quote!.providerUpdatedAt : null,
    evaluatedAt: input.now,
    protectionStatus,
  };
}
