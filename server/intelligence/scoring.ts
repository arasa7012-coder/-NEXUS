import type {
  ExplainableScore,
  IntelligenceTimeframe,
  MarketStructureSnapshot,
  MetricResult,
  MomentumSnapshot,
  MultiTimeframeSnapshot,
  ScoreFactor,
  VolatilitySnapshot,
  VolumeSnapshot,
} from "./types";

export interface ScoringInput {
  timeframe: IntelligenceTimeframe;
  structure: MetricResult<MarketStructureSnapshot>;
  momentum: MetricResult<MomentumSnapshot>;
  volume: MetricResult<VolumeSnapshot>;
  volatility: MetricResult<VolatilitySnapshot>;
  multiTimeframe: MetricResult<MultiTimeframeSnapshot>;
  isStale: boolean;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function limitation(label: string, maxPoints: number, description: string, timeframe: IntelligenceTimeframe | null): ScoreFactor {
  return { id: `missing-${label.toLowerCase().replace(/\s+/g, "-")}`, label, impact: "LIMITATION", points: 0, maxPoints, description, timeframe };
}

function coverage(input: ScoringInput): { available: number; total: number; percent: number } {
  const metrics = [input.structure, input.momentum, input.volume, input.volatility, input.multiTimeframe];
  const available = metrics.filter((metric) => metric.status === "AVAILABLE").length;
  return { available, total: metrics.length, percent: Math.round((available / metrics.length) * 100) };
}

export function calculateOpportunityScore(input: ScoringInput): ExplainableScore {
  const factors: ScoreFactor[] = [];
  const currentCoverage = coverage(input);

  if (input.structure.status === "AVAILABLE") {
    const trendPoints = input.structure.value.trend === "UPTREND" ? 25
      : input.structure.value.trend === "RANGE" ? 8
        : input.structure.value.trend === "MIXED" ? 6 : 0;
    factors.push({
      id: "opportunity-trend",
      label: "Trend",
      impact: trendPoints >= 15 ? "POSITIVE" : trendPoints === 0 ? "NEGATIVE" : "LIMITATION",
      points: trendPoints,
      maxPoints: 25,
      description: `${input.timeframe} market structure is ${input.structure.value.trend.toLowerCase()}.`,
      timeframe: input.timeframe,
    });

    const structurePoints = input.structure.value.event === "BREAKOUT" ? 20
      : input.structure.value.trend === "UPTREND" ? 16
        : input.structure.value.event === "CONSOLIDATION" ? 8
          : input.structure.value.trend === "MIXED" ? 6 : 0;
    factors.push({
      id: "opportunity-structure",
      label: "Market structure",
      impact: structurePoints >= 15 ? "POSITIVE" : structurePoints === 0 ? "NEGATIVE" : "LIMITATION",
      points: structurePoints,
      maxPoints: 20,
      description: input.structure.value.event === "NONE"
        ? `No confirmed structural event is active; the current trend is ${input.structure.value.trend.toLowerCase()}.`
        : `The current structural event is ${input.structure.value.event.toLowerCase()}.`,
      timeframe: input.timeframe,
    });
  } else {
    factors.push(limitation("Trend", 25, input.structure.reason, input.timeframe));
    factors.push(limitation("Market structure", 20, input.structure.reason, input.timeframe));
  }

  if (input.momentum.status === "AVAILABLE") {
    const points = input.momentum.value.direction === "BULLISH" ? 20
      : input.momentum.value.direction === "NEUTRAL" ? 8
        : input.momentum.value.direction === "MIXED" ? 5 : 0;
    factors.push({
      id: "opportunity-momentum",
      label: "Momentum",
      impact: points >= 15 ? "POSITIVE" : points === 0 ? "NEGATIVE" : "LIMITATION",
      points,
      maxPoints: 20,
      description: `${input.timeframe} momentum is ${input.momentum.value.direction.toLowerCase()} with a ten-period return of ${input.momentum.value.return10PeriodPercent}%.`,
      timeframe: input.timeframe,
    });
  } else factors.push(limitation("Momentum", 20, input.momentum.reason, input.timeframe));

  if (input.volume.status === "AVAILABLE") {
    const points = input.volume.value.trend === "INCREASING" && input.volume.value.relativeVolume >= 1.2 ? 15
      : input.volume.value.trend === "STABLE" ? 8 : 3;
    factors.push({
      id: "opportunity-volume",
      label: "Volume confirmation",
      impact: points >= 12 ? "POSITIVE" : points <= 3 ? "NEGATIVE" : "LIMITATION",
      points,
      maxPoints: 15,
      description: `Volume is ${input.volume.value.trend.toLowerCase()} at ${input.volume.value.relativeVolume}x its baseline.`,
      timeframe: input.timeframe,
    });
  } else factors.push(limitation("Volume confirmation", 15, input.volume.reason, input.timeframe));

  if (input.multiTimeframe.status === "AVAILABLE") {
    const points = input.multiTimeframe.value.alignment === "BULLISH_ALIGNMENT" ? 15
      : input.multiTimeframe.value.alignment === "MIXED_SIGNALS" ? 8
        : input.multiTimeframe.value.alignment === "TREND_CONFLICT" ? 3 : 0;
    factors.push({
      id: "opportunity-multi-timeframe",
      label: "Multi-timeframe alignment",
      impact: points >= 12 ? "POSITIVE" : points <= 3 ? "NEGATIVE" : "LIMITATION",
      points,
      maxPoints: 15,
      description: `Available timeframes classify as ${input.multiTimeframe.value.alignment.toLowerCase().replace(/_/g, " ")}.`,
      timeframe: null,
    });
  } else factors.push(limitation("Multi-timeframe alignment", 15, input.multiTimeframe.reason, null));

  if (input.volatility.status === "AVAILABLE") {
    const points = input.volatility.value.level === "NORMAL" ? 5 : input.volatility.value.level === "LOW" ? 3 : 0;
    factors.push({
      id: "opportunity-volatility",
      label: "Volatility suitability",
      impact: input.volatility.value.level === "HIGH" ? "RISK" : points > 0 ? "POSITIVE" : "LIMITATION",
      points,
      maxPoints: 5,
      description: `Current volatility is ${input.volatility.value.level.toLowerCase()}.`,
      timeframe: input.timeframe,
    });
  } else factors.push(limitation("Volatility suitability", 5, input.volatility.reason, input.timeframe));

  const requiredAvailable = input.structure.status === "AVAILABLE"
    && input.momentum.status === "AVAILABLE"
    && input.volatility.status === "AVAILABLE"
    && input.multiTimeframe.status === "AVAILABLE";
  if (!requiredAvailable) {
    return {
      value: null,
      label: "OPPORTUNITY",
      coveragePercent: currentCoverage.percent,
      factors,
      unavailableReason: "Opportunity score requires structure, momentum, volatility, and at least two available timeframes.",
    };
  }

  return {
    value: clamp(factors.reduce((sum, factor) => sum + factor.points, 0)),
    label: "OPPORTUNITY",
    coveragePercent: currentCoverage.percent,
    factors,
    unavailableReason: null,
  };
}

export function calculateSignalStrength(input: ScoringInput): ExplainableScore {
  const currentCoverage = coverage(input);
  const directional: number[] = [];
  if (input.structure.status === "AVAILABLE") {
    if (input.structure.value.trend === "UPTREND") directional.push(1);
    else if (input.structure.value.trend === "DOWNTREND") directional.push(-1);
    else directional.push(0);
  }
  if (input.momentum.status === "AVAILABLE") {
    if (input.momentum.value.direction === "BULLISH") directional.push(1);
    else if (input.momentum.value.direction === "BEARISH") directional.push(-1);
    else directional.push(0);
  }
  if (input.multiTimeframe.status === "AVAILABLE") {
    if (input.multiTimeframe.value.alignment === "BULLISH_ALIGNMENT") directional.push(1);
    else if (input.multiTimeframe.value.alignment === "BEARISH_ALIGNMENT") directional.push(-1);
    else directional.push(0);
  }
  if (input.volume.status === "AVAILABLE") {
    if (input.volume.value.trend === "INCREASING") directional.push(1);
    else if (input.volume.value.trend === "DECREASING") directional.push(-1);
    else directional.push(0);
  }

  const positive = directional.filter((value) => value > 0).length;
  const negative = directional.filter((value) => value < 0).length;
  const neutral = directional.filter((value) => value === 0).length;
  const agreementPercent = directional.length === 0 ? 0 : (Math.max(positive, negative, neutral) / directional.length) * 100;
  const stalePenalty = input.isStale ? 40 : 0;
  const conflictPenalty = input.multiTimeframe.status === "AVAILABLE"
    && input.multiTimeframe.value.alignment === "TREND_CONFLICT" ? 20 : 0;
  const factors: ScoreFactor[] = [
    {
      id: "signal-coverage",
      label: "Evidence coverage",
      impact: currentCoverage.percent >= 80 ? "POSITIVE" : "LIMITATION",
      points: Math.round(currentCoverage.percent * 0.55),
      maxPoints: 55,
      description: `${currentCoverage.available} of ${currentCoverage.total} scoring inputs are available.`,
      timeframe: null,
    },
    {
      id: "signal-agreement",
      label: "Directional agreement",
      impact: agreementPercent >= 75 ? "POSITIVE" : agreementPercent < 50 ? "NEGATIVE" : "LIMITATION",
      points: Math.round(agreementPercent * 0.45),
      maxPoints: 45,
      description: `${Math.round(agreementPercent)}% of directional inputs agree.`,
      timeframe: null,
    },
  ];
  if (input.isStale) {
    factors.push({
      id: "signal-stale-penalty",
      label: "Stale-data limitation",
      impact: "LIMITATION",
      points: -stalePenalty,
      maxPoints: 0,
      description: "At least one required timeframe uses stale cached data, reducing signal strength.",
      timeframe: null,
    });
  }
  if (conflictPenalty > 0) {
    factors.push({
      id: "signal-timeframe-conflict-penalty",
      label: "Timeframe conflict",
      impact: "LIMITATION",
      points: -conflictPenalty,
      maxPoints: 0,
      description: "Bullish and bearish timeframe evidence conflict, reducing signal strength.",
      timeframe: null,
    });
  }

  if (currentCoverage.available < 3 || directional.length < 2) {
    return {
      value: null,
      label: "SIGNAL_STRENGTH",
      coveragePercent: currentCoverage.percent,
      factors,
      unavailableReason: "Signal strength requires at least three available inputs and two directional observations.",
    };
  }

  return {
    value: clamp((currentCoverage.percent * 0.55) + (agreementPercent * 0.45) - stalePenalty - conflictPenalty),
    label: "SIGNAL_STRENGTH",
    coveragePercent: currentCoverage.percent,
    factors,
    unavailableReason: null,
  };
}
