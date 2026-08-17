import type {
  AnalysisCandle,
  EvidenceItem,
  IntelligenceTimeframe,
  MetricResult,
  VolumeSnapshot,
} from "./types";

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, precision: number = 4): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function analyzeVolume(
  candles: AnalysisCandle[],
  timeframe: IntelligenceTimeframe,
): MetricResult<VolumeSnapshot> {
  const period = 20;
  if (candles.length < period) {
    return {
      status: "UNAVAILABLE",
      value: null,
      period,
      sampleCount: candles.length,
      reason: `Volume analysis requires at least ${period} valid candles.`,
    };
  }

  const volumes = candles.slice(-period).map((candle) => candle.volume);
  const baseline = average(volumes.slice(0, 15));
  const recent = average(volumes.slice(15));
  if (baseline <= 0) {
    return {
      status: "UNAVAILABLE",
      value: null,
      period,
      sampleCount: candles.length,
      reason: "Volume analysis requires a positive historical volume baseline.",
    };
  }

  const previousFive = average(volumes.slice(10, 15));
  const relativeVolume = recent / baseline;
  const trendPercent = previousFive === 0 ? 0 : ((recent - previousFive) / previousFive) * 100;
  const trend = trendPercent > 15 ? "INCREASING" : trendPercent < -15 ? "DECREASING" : "STABLE";
  const latest = candles.at(-1)!;
  const evidence: EvidenceItem[] = [
    {
      id: "volume-relative",
      label: "Relative volume",
      direction: relativeVolume >= 1.2 ? "POSITIVE" : relativeVolume <= 0.8 ? "NEGATIVE" : "NEUTRAL",
      value: round(relativeVolume),
      unit: "x baseline",
      description: `Average volume across the latest five ${timeframe} candles is ${round(relativeVolume)} times the preceding baseline.`,
      timeframe,
      asOf: latest.closeTime,
    },
    {
      id: "volume-trend",
      label: "Recent volume change",
      direction: trend === "INCREASING" ? "POSITIVE" : trend === "DECREASING" ? "NEGATIVE" : "NEUTRAL",
      value: round(trendPercent),
      unit: "%",
      description: `The latest five-candle average volume changed ${round(trendPercent)}% versus the preceding five-candle average.`,
      timeframe,
      asOf: latest.closeTime,
    },
  ];

  return {
    status: "AVAILABLE",
    value: {
      trend,
      recentAverage: round(recent),
      baselineAverage: round(baseline),
      relativeVolume: round(relativeVolume),
      trendPercent: round(trendPercent),
      evidence,
    },
    period,
    sampleCount: candles.length,
    reason: null,
  };
}
