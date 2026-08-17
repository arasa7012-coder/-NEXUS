import type { IntelligenceRiskContext, RiskDataQuality, RiskFactor, RiskLevelResult } from "./types";

export interface RiskLevelInput {
  dataQuality: RiskDataQuality;
  atrPercent: number | null;
  timeframeConflict: boolean;
  intelligenceRiskScore: number | null;
  signalStrength: number | null;
  dailyDrawdownPercent: number;
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function factor(id: string, label: string, points: number, maxPoints: number, description: string): RiskFactor {
  return { id, label, points, maxPoints, description };
}

export function calculateRiskLevel(input: RiskLevelInput): RiskLevelResult {
  if (input.dataQuality === "UNAVAILABLE" || input.dataQuality === "ERROR") {
    return {
      level: null,
      score: null,
      factors: [factor("data", "Market data unavailable", 0, 100, "A measurable risk level requires an available market-data input.")],
      unavailableReason: "Market data is unavailable, so a risk level cannot be calculated safely.",
    };
  }

  const atrPercent = finiteOrNull(input.atrPercent);
  const intelligenceRisk = finiteOrNull(input.intelligenceRiskScore);
  const signalStrength = finiteOrNull(input.signalStrength);
  if (atrPercent === null || intelligenceRisk === null || signalStrength === null || !Number.isFinite(input.dailyDrawdownPercent)) {
    return {
      level: null,
      score: null,
      factors: [factor("evidence", "Insufficient measurable evidence", 0, 100, "Volatility, intelligence risk, signal strength, and daily drawdown are required.")],
      unavailableReason: "Risk evidence is incomplete, so no risk level is shown.",
    };
  }

  const volatilityPoints = atrPercent >= 6 ? 28 : atrPercent >= 3 ? 18 : atrPercent >= 1.5 ? 8 : 2;
  const intelligencePoints = intelligenceRisk >= 75 ? 24 : intelligenceRisk >= 50 ? 15 : intelligenceRisk >= 25 ? 7 : 2;
  const conflictPoints = input.timeframeConflict ? 20 : 0;
  const signalPoints = signalStrength < 35 ? 14 : signalStrength < 55 ? 7 : 0;
  const drawdown = Math.max(0, input.dailyDrawdownPercent);
  const drawdownPoints = drawdown >= 8 ? 14 : drawdown >= 4 ? 8 : drawdown >= 1 ? 3 : 0;
  const stalePoints = input.dataQuality === "STALE" ? 18 : 0;
  const score = Math.min(100, volatilityPoints + intelligencePoints + conflictPoints + signalPoints + drawdownPoints + stalePoints);
  const level = score >= 75 ? "EXTREME" : score >= 50 ? "HIGH" : score >= 25 ? "MODERATE" : "LOW";

  return {
    level,
    score,
    factors: [
      factor("volatility", "ATR volatility", volatilityPoints, 28, `${atrPercent.toFixed(2)}% ATR relative to reference price.`),
      factor("intelligence", "Intelligence risk", intelligencePoints, 24, `Measured intelligence risk score: ${intelligenceRisk.toFixed(0)}/100.`),
      factor("timeframes", "Timeframe alignment", conflictPoints, 20, input.timeframeConflict ? "Available timeframes are mixed or conflicting." : "Available timeframes do not report a conflict."),
      factor("signal", "Signal evidence", signalPoints, 14, `Measured signal strength: ${signalStrength.toFixed(0)}/100.`),
      factor("drawdown", "Current daily drawdown", drawdownPoints, 14, `${drawdown.toFixed(2)}% measured from the UTC-day peak.`),
      factor("freshness", "Data freshness", stalePoints, 18, input.dataQuality === "STALE" ? "Cached or stale data increases uncertainty." : input.dataQuality === "HISTORICAL" ? "Validated closed historical candles are used for this simulation." : "Live market data is available."),
    ],
    unavailableReason: null,
  };
}

export function intelligenceRiskContextToRiskLevelInput(input: IntelligenceRiskContext, dailyDrawdownPercent: number): RiskLevelInput {
  return {
    dataQuality: input.dataQuality,
    atrPercent: input.atrUsd && input.atrUsd > 0 ? input.atrUsd : null,
    timeframeConflict: input.timeframeConflict,
    intelligenceRiskScore: input.intelligenceRiskScore,
    signalStrength: input.signalStrength,
    dailyDrawdownPercent,
  };
}
