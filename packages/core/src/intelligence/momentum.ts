import { calculateIndicatorSnapshot } from "./indicators.ts";
import type {
  AnalysisCandle,
  EvidenceItem,
  IntelligenceTimeframe,
  MetricResult,
  MomentumSnapshot,
} from "./types.ts";

function round(value: number, precision: number = 4): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function analyzeMomentum(
  candles: AnalysisCandle[],
  timeframe: IntelligenceTimeframe,
): MetricResult<MomentumSnapshot> {
  if (candles.length < 11) {
    return {
      status: "UNAVAILABLE",
      value: null,
      period: 10,
      sampleCount: candles.length,
      reason: "Momentum analysis requires at least 11 valid candles.",
    };
  }

  const latestIndex = candles.length - 1;
  const latest = candles[latestIndex]!;
  const return1 = percentChange(latest.close, candles[latestIndex - 1]!.close);
  const return5 = percentChange(latest.close, candles[latestIndex - 5]!.close);
  const return10 = percentChange(latest.close, candles[latestIndex - 10]!.close);
  const previousFive = percentChange(candles[latestIndex - 5]!.close, candles[latestIndex - 10]!.close);
  const acceleration = return5 - previousFive;
  const indicators = calculateIndicatorSnapshot(candles);
  const rsi = indicators.rsi14.status === "AVAILABLE" ? indicators.rsi14.value : null;
  const macdHistogram = indicators.macd.status === "AVAILABLE" ? indicators.macd.value.histogram : null;
  const evidence: EvidenceItem[] = [
    {
      id: "momentum-return-5",
      label: "Five-period return",
      direction: return5 > 0.5 ? "POSITIVE" : return5 < -0.5 ? "NEGATIVE" : "NEUTRAL",
      value: round(return5),
      unit: "%",
      description: `Price changed ${round(return5)}% over the latest five ${timeframe} candles.`,
      timeframe,
      asOf: latest.closeTime,
    },
    {
      id: "momentum-return-10",
      label: "Ten-period return",
      direction: return10 > 1 ? "POSITIVE" : return10 < -1 ? "NEGATIVE" : "NEUTRAL",
      value: round(return10),
      unit: "%",
      description: `Price changed ${round(return10)}% over the latest ten ${timeframe} candles.`,
      timeframe,
      asOf: latest.closeTime,
    },
    {
      id: "momentum-acceleration",
      label: "Momentum change",
      direction: acceleration > 0.5 ? "POSITIVE" : acceleration < -0.5 ? "NEGATIVE" : "NEUTRAL",
      value: round(acceleration),
      unit: "percentage points",
      description: `The latest five-period return differs from the preceding five-period return by ${round(acceleration)} percentage points.`,
      timeframe,
      asOf: latest.closeTime,
    },
  ];

  if (rsi !== null) {
    evidence.push({
      id: "momentum-rsi",
      label: "RSI 14",
      direction: rsi > 55 ? "POSITIVE" : rsi < 45 ? "NEGATIVE" : "NEUTRAL",
      value: rsi,
      unit: null,
      description: `RSI 14 is ${rsi}; it is an analytical momentum input, not a prediction.`,
      timeframe,
      asOf: latest.closeTime,
    });
  }

  if (macdHistogram !== null) {
    evidence.push({
      id: "momentum-macd-histogram",
      label: "MACD histogram",
      direction: macdHistogram > 0 ? "POSITIVE" : macdHistogram < 0 ? "NEGATIVE" : "NEUTRAL",
      value: macdHistogram,
      unit: null,
      description: `The MACD histogram is ${macdHistogram}.`,
      timeframe,
      asOf: latest.closeTime,
    });
  }

  const directionalEvidence = evidence.filter((item) => item.direction === "POSITIVE" || item.direction === "NEGATIVE");
  const positive = directionalEvidence.filter((item) => item.direction === "POSITIVE").length;
  const negative = directionalEvidence.filter((item) => item.direction === "NEGATIVE").length;
  const direction = positive >= 2 && negative === 0
    ? "BULLISH"
    : negative >= 2 && positive === 0
      ? "BEARISH"
      : positive > 0 && negative > 0
        ? "MIXED"
        : "NEUTRAL";

  return {
    status: "AVAILABLE",
    value: {
      direction,
      return1PeriodPercent: round(return1),
      return5PeriodPercent: round(return5),
      return10PeriodPercent: round(return10),
      fivePeriodAccelerationPercent: round(acceleration),
      rsi,
      macdHistogram,
      evidence,
    },
    period: 10,
    sampleCount: candles.length,
    reason: null,
  };
}
