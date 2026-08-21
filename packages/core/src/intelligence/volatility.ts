import { calculateAtr, calculateBollingerBands } from "./indicators.ts";
import type {
  AnalysisCandle,
  EvidenceItem,
  IntelligenceTimeframe,
  MetricResult,
  VolatilitySnapshot,
} from "./types.ts";

function round(value: number, precision: number = 4): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function analyzeVolatility(
  candles: AnalysisCandle[],
  timeframe: IntelligenceTimeframe,
): MetricResult<VolatilitySnapshot> {
  const period = 20;
  if (candles.length < period) {
    return {
      status: "UNAVAILABLE",
      value: null,
      period,
      sampleCount: candles.length,
      reason: `Volatility analysis requires at least ${period} valid candles.`,
    };
  }

  const window = candles.slice(-period);
  const averageRangePercent = window.reduce((sum, candle) => (
    sum + (((candle.high - candle.low) / Math.abs(candle.close)) * 100)
  ), 0) / period;
  const atr = calculateAtr(candles, 14);
  const bands = calculateBollingerBands(candles, 20, 2);
  const atrPercent = atr.status === "AVAILABLE" ? atr.value.percent : null;
  const bollingerWidthPercent = bands.status === "AVAILABLE" ? bands.value.widthPercent : null;
  const latest = candles.at(-1)!;

  const high = (atrPercent !== null && atrPercent >= 4)
    || (bollingerWidthPercent !== null && bollingerWidthPercent >= 12)
    || averageRangePercent >= 5;
  const low = (atrPercent === null || atrPercent <= 1)
    && (bollingerWidthPercent === null || bollingerWidthPercent <= 4)
    && averageRangePercent <= 1.5;
  const level = high ? "HIGH" : low ? "LOW" : "NORMAL";
  const evidence: EvidenceItem[] = [
    {
      id: "volatility-average-range",
      label: "Average candle range",
      direction: averageRangePercent >= 5 ? "RISK" : averageRangePercent <= 1.5 ? "NEUTRAL" : "NEUTRAL",
      value: round(averageRangePercent),
      unit: "%",
      description: `The average high-to-low range across the latest 20 ${timeframe} candles is ${round(averageRangePercent)}% of close.`,
      timeframe,
      asOf: latest.closeTime,
    },
  ];

  if (atrPercent !== null) {
    evidence.push({
      id: "volatility-atr",
      label: "ATR 14",
      direction: atrPercent >= 4 ? "RISK" : "NEUTRAL",
      value: atrPercent,
      unit: "% of price",
      description: `ATR 14 is ${atrPercent}% of the latest close.`,
      timeframe,
      asOf: latest.closeTime,
    });
  }
  if (bollingerWidthPercent !== null) {
    evidence.push({
      id: "volatility-bollinger-width",
      label: "Bollinger width",
      direction: bollingerWidthPercent >= 12 ? "RISK" : "NEUTRAL",
      value: bollingerWidthPercent,
      unit: "%",
      description: `Bollinger Band width is ${bollingerWidthPercent}% of the middle band.`,
      timeframe,
      asOf: latest.closeTime,
    });
  }

  return {
    status: "AVAILABLE",
    value: {
      level,
      atrPercent,
      bollingerWidthPercent,
      averageRangePercent: round(averageRangePercent),
      evidence,
    },
    period,
    sampleCount: candles.length,
    reason: null,
  };
}
