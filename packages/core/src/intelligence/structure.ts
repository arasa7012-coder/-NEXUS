import type {
  AnalysisCandle,
  EvidenceItem,
  IntelligenceTimeframe,
  MarketStructureSnapshot,
  MetricResult,
  PriceLevel,
  StructureEvent,
  StructureTrend,
  SwingPoint,
} from "./types.ts";

const STRUCTURE_MINIMUM_SAMPLES = 30;
const COMPARISON_TOLERANCE = 0.001;
const LEVEL_CLUSTER_TOLERANCE = 0.0075;
const BREAK_MARGIN = 0.002;

function round(value: number, precision: number = 8): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function detectSwingPoints(candles: AnalysisCandle[], lookback: number = 2): SwingPoint[] {
  const safeLookback = Math.max(1, Math.floor(lookback));
  const swings: SwingPoint[] = [];
  for (let index = safeLookback; index < candles.length - safeLookback; index += 1) {
    const candidate = candles[index]!;
    const neighbors = candles.slice(index - safeLookback, index + safeLookback + 1);
    const others = neighbors.filter((_, neighborIndex) => neighborIndex !== safeLookback);
    if (others.every((candle) => candidate.high > candle.high)) {
      swings.push({ index, occurredAt: candidate.closeTime, price: candidate.high, kind: "HIGH" });
    }
    if (others.every((candle) => candidate.low < candle.low)) {
      swings.push({ index, occurredAt: candidate.closeTime, price: candidate.low, kind: "LOW" });
    }
  }
  return swings.sort((left, right) => left.index - right.index || left.kind.localeCompare(right.kind));
}

export function clusterPriceLevels(
  swings: SwingPoint[],
  currentPrice: number,
  minimumTouches: number = 2,
): PriceLevel[] {
  const groups: SwingPoint[][] = [];
  for (const swing of [...swings].sort((left, right) => left.price - right.price)) {
    const matching = groups.find((group) => {
      const mean = group.reduce((sum, point) => sum + point.price, 0) / group.length;
      return Math.abs(swing.price - mean) / Math.abs(mean) <= LEVEL_CLUSTER_TOLERANCE;
    });
    if (matching) matching.push(swing);
    else groups.push([swing]);
  }

  return groups
    .filter((group) => group.length >= minimumTouches)
    .map((group) => {
      const price = group.reduce((sum, point) => sum + point.price, 0) / group.length;
      return {
        price: round(price),
        touches: group.length,
        lastTouchedAt: Math.max(...group.map((point) => point.occurredAt)),
        kind: price <= currentPrice ? "SUPPORT" as const : "RESISTANCE" as const,
      };
    })
    .sort((left, right) => left.price - right.price);
}

function compareSwings(swings: SwingPoint[]): { higher: number; lower: number } {
  let higher = 0;
  let lower = 0;
  for (let index = 1; index < swings.length; index += 1) {
    const previous = swings[index - 1]!.price;
    const current = swings[index]!.price;
    if (current > previous * (1 + COMPARISON_TOLERANCE)) higher += 1;
    if (current < previous * (1 - COMPARISON_TOLERANCE)) lower += 1;
  }
  return { higher, lower };
}

function recentRangePercent(candles: AnalysisCandle[], period: number = 20): number {
  const window = candles.slice(-period);
  const highest = Math.max(...window.map((candle) => candle.high));
  const lowest = Math.min(...window.map((candle) => candle.low));
  const midpoint = (highest + lowest) / 2;
  return midpoint === 0 ? 0 : ((highest - lowest) / midpoint) * 100;
}

export function analyzeMarketStructure(
  candles: AnalysisCandle[],
  timeframe: IntelligenceTimeframe,
): MetricResult<MarketStructureSnapshot> {
  if (candles.length < STRUCTURE_MINIMUM_SAMPLES) {
    return {
      status: "UNAVAILABLE",
      value: null,
      period: STRUCTURE_MINIMUM_SAMPLES,
      sampleCount: candles.length,
      reason: `Market-structure analysis requires at least ${STRUCTURE_MINIMUM_SAMPLES} valid candles.`,
    };
  }

  const latest = candles.at(-1)!;
  const swings = detectSwingPoints(candles, 2);
  const swingHighs = swings.filter((point) => point.kind === "HIGH");
  const swingLows = swings.filter((point) => point.kind === "LOW");
  const highComparisons = compareSwings(swingHighs.slice(-5));
  const lowComparisons = compareSwings(swingLows.slice(-5));
  const higherHighs = highComparisons.higher;
  const lowerHighs = highComparisons.lower;
  const higherLows = lowComparisons.higher;
  const lowerLows = lowComparisons.lower;
  const rangePercent = recentRangePercent(candles, 20);
  const consolidated = rangePercent <= 5;

  let trend: StructureTrend = "MIXED";
  if (higherHighs > 0 && higherLows > 0 && lowerHighs === 0 && lowerLows === 0) trend = "UPTREND";
  else if (lowerHighs > 0 && lowerLows > 0 && higherHighs === 0 && higherLows === 0) trend = "DOWNTREND";
  else if (consolidated) trend = "RANGE";

  const levels = clusterPriceLevels(swings, latest.close, 2);
  const support = levels.filter((level) => level.kind === "SUPPORT");
  const resistance = levels.filter((level) => level.kind === "RESISTANCE");
  const nearestSupport = support.at(-1);
  const nearestResistance = resistance.at(0);
  let event: StructureEvent = consolidated ? "CONSOLIDATION" : "NONE";
  if (nearestResistance && latest.close > nearestResistance.price * (1 + BREAK_MARGIN)) event = "BREAKOUT";
  if (nearestSupport && latest.close < nearestSupport.price * (1 - BREAK_MARGIN)) event = "BREAKDOWN";

  const evidence: EvidenceItem[] = [
    {
      id: "structure-swings",
      label: "Confirmed swing sequence",
      direction: trend === "UPTREND" ? "POSITIVE" : trend === "DOWNTREND" ? "NEGATIVE" : "NEUTRAL",
      value: `${higherHighs} HH / ${higherLows} HL / ${lowerHighs} LH / ${lowerLows} LL`,
      unit: null,
      description: `Confirmed swings contain ${higherHighs} higher-high, ${higherLows} higher-low, ${lowerHighs} lower-high, and ${lowerLows} lower-low comparisons.`,
      timeframe,
      asOf: latest.closeTime,
    },
    {
      id: "structure-range",
      label: "Recent range",
      direction: consolidated ? "NEUTRAL" : "NEUTRAL",
      value: round(rangePercent, 4),
      unit: "%",
      description: `The latest 20-candle high-to-low range is ${round(rangePercent, 4)}% of its midpoint.`,
      timeframe,
      asOf: latest.closeTime,
    },
  ];

  if (nearestSupport) {
    evidence.push({
      id: "structure-support",
      label: "Confirmed support",
      direction: "NEUTRAL",
      value: nearestSupport.price,
      unit: "USD",
      description: `The nearest confirmed support level has ${nearestSupport.touches} swing touches.`,
      timeframe,
      asOf: latest.closeTime,
    });
  }
  if (nearestResistance) {
    evidence.push({
      id: "structure-resistance",
      label: "Confirmed resistance",
      direction: "RISK",
      value: nearestResistance.price,
      unit: "USD",
      description: `The nearest confirmed resistance level has ${nearestResistance.touches} swing touches.`,
      timeframe,
      asOf: latest.closeTime,
    });
  }
  if (event !== "NONE") {
    evidence.push({
      id: `structure-event-${event.toLowerCase()}`,
      label: event === "BREAKOUT" ? "Confirmed close above resistance" : event === "BREAKDOWN" ? "Confirmed close below support" : "Range consolidation",
      direction: event === "BREAKOUT" ? "POSITIVE" : event === "BREAKDOWN" ? "NEGATIVE" : "NEUTRAL",
      value: latest.close,
      unit: "USD",
      description: event === "BREAKOUT"
        ? "The latest close is more than 0.2% above a confirmed multi-touch resistance level."
        : event === "BREAKDOWN"
          ? "The latest close is more than 0.2% below a confirmed multi-touch support level."
          : "The latest 20-candle range is compressed to 5% or less of its midpoint.",
      timeframe,
      asOf: latest.closeTime,
    });
  }

  return {
    status: "AVAILABLE",
    value: {
      trend,
      event,
      higherHighs,
      higherLows,
      lowerHighs,
      lowerLows,
      swingHighs,
      swingLows,
      support,
      resistance,
      evidence,
    },
    period: STRUCTURE_MINIMUM_SAMPLES,
    sampleCount: candles.length,
    reason: null,
  };
}
