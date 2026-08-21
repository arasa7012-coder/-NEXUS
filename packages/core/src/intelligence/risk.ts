import type { ExplainableScore, ScoreFactor } from "./types.ts";
import type { ScoringInput } from "./scoring.ts";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateRiskScore(input: ScoringInput & { currentPrice: number }): ExplainableScore {
  const factors: ScoreFactor[] = [];
  let points = 0;
  let available = 0;
  const totalInputs = 5;

  if (input.volatility.status === "AVAILABLE") {
    available += 1;
    const volatilityPoints = input.volatility.value.level === "HIGH" ? 30
      : input.volatility.value.level === "NORMAL" ? 10 : 5;
    points += volatilityPoints;
    factors.push({
      id: "risk-volatility",
      label: "Volatility context",
      impact: input.volatility.value.level === "HIGH" ? "RISK" : "LIMITATION",
      points: volatilityPoints,
      maxPoints: 30,
      description: `Current volatility is ${input.volatility.value.level.toLowerCase()}${input.volatility.value.atrPercent === null ? "" : ` with ATR at ${input.volatility.value.atrPercent}% of price`}.`,
      timeframe: input.timeframe,
    });
  } else {
    points += 15;
    factors.push({
      id: "risk-volatility-missing",
      label: "Volatility unavailable",
      impact: "LIMITATION",
      points: 15,
      maxPoints: 30,
      description: input.volatility.reason,
      timeframe: input.timeframe,
    });
  }

  if (input.multiTimeframe.status === "AVAILABLE") {
    available += 1;
    const alignmentPoints = input.multiTimeframe.value.alignment === "TREND_CONFLICT" ? 25
      : input.multiTimeframe.value.alignment === "MIXED_SIGNALS" ? 12 : 5;
    points += alignmentPoints;
    factors.push({
      id: "risk-timeframe-conflict",
      label: "Timeframe agreement",
      impact: alignmentPoints >= 20 ? "RISK" : alignmentPoints >= 10 ? "LIMITATION" : "POSITIVE",
      points: alignmentPoints,
      maxPoints: 25,
      description: `Available timeframes classify as ${input.multiTimeframe.value.alignment.toLowerCase().replace(/_/g, " ")}.`,
      timeframe: null,
    });
  } else {
    points += 15;
    factors.push({
      id: "risk-timeframes-missing",
      label: "Timeframe context unavailable",
      impact: "LIMITATION",
      points: 15,
      maxPoints: 25,
      description: input.multiTimeframe.reason,
      timeframe: null,
    });
  }

  if (input.volume.status === "AVAILABLE") {
    available += 1;
    const volumePoints = input.volume.value.trend === "DECREASING" ? 15
      : input.volume.value.trend === "STABLE" ? 5 : 0;
    points += volumePoints;
    factors.push({
      id: "risk-volume",
      label: "Volume support",
      impact: volumePoints >= 15 ? "RISK" : volumePoints > 0 ? "LIMITATION" : "POSITIVE",
      points: volumePoints,
      maxPoints: 15,
      description: `Volume is ${input.volume.value.trend.toLowerCase()} at ${input.volume.value.relativeVolume}x its baseline.`,
      timeframe: input.timeframe,
    });
  } else {
    points += 10;
    factors.push({
      id: "risk-volume-missing",
      label: "Volume evidence unavailable",
      impact: "LIMITATION",
      points: 10,
      maxPoints: 15,
      description: input.volume.reason,
      timeframe: input.timeframe,
    });
  }

  if (input.structure.status === "AVAILABLE") {
    available += 1;
    const nearestResistance = input.structure.value.resistance
      .filter((level) => level.price > input.currentPrice)
      .sort((left, right) => left.price - right.price)[0];
    const nearestSupport = input.structure.value.support
      .filter((level) => level.price < input.currentPrice)
      .sort((left, right) => right.price - left.price)[0];
    const resistanceDistance = nearestResistance
      ? ((nearestResistance.price - input.currentPrice) / input.currentPrice) * 100
      : null;
    const supportDistance = nearestSupport
      ? ((input.currentPrice - nearestSupport.price) / input.currentPrice) * 100
      : null;
    const levelPoints = resistanceDistance !== null && resistanceDistance <= 2 ? 15
      : supportDistance !== null && supportDistance <= 2 ? 10 : 0;
    points += levelPoints;
    factors.push({
      id: "risk-level-proximity",
      label: "Confirmed level proximity",
      impact: levelPoints > 0 ? "RISK" : "POSITIVE",
      points: levelPoints,
      maxPoints: 15,
      description: resistanceDistance !== null && resistanceDistance <= 2
        ? `Price is ${resistanceDistance.toFixed(2)}% below confirmed resistance.`
        : supportDistance !== null && supportDistance <= 2
          ? `Price is ${supportDistance.toFixed(2)}% above confirmed support, leaving limited downside room before the level is tested.`
          : "No confirmed multi-touch support or resistance is within 2% of the current price.",
      timeframe: input.timeframe,
    });
  } else {
    factors.push({
      id: "risk-structure-missing",
      label: "Price-level evidence unavailable",
      impact: "LIMITATION",
      points: 0,
      maxPoints: 15,
      description: input.structure.reason,
      timeframe: input.timeframe,
    });
  }

  if (input.momentum.status === "AVAILABLE") available += 1;
  const coveragePercent = Math.round((available / totalInputs) * 100);
  const coveragePenalty = Math.round((100 - coveragePercent) * 0.2);
  if (coveragePenalty > 0) {
    points += coveragePenalty;
    factors.push({
      id: "risk-coverage",
      label: "Evidence coverage",
      impact: "LIMITATION",
      points: coveragePenalty,
      maxPoints: 20,
      description: `${available} of ${totalInputs} core risk inputs are available.`,
      timeframe: null,
    });
  }

  if (input.isStale) {
    points += 20;
    factors.push({
      id: "risk-stale-data",
      label: "Stale data",
      impact: "RISK",
      points: 20,
      maxPoints: 20,
      description: "At least one required input is stale cached data rather than a current provider response.",
      timeframe: null,
    });
  }

  if (input.volatility.status === "UNAVAILABLE" || input.structure.status === "UNAVAILABLE") {
    return {
      value: null,
      label: "RISK",
      coveragePercent,
      factors,
      unavailableReason: "Risk score requires current volatility and market-structure evidence.",
    };
  }

  return {
    value: clamp(points),
    label: "RISK",
    coveragePercent,
    factors,
    unavailableReason: null,
  };
}
