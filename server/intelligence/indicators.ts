import type {
  AnalysisCandle,
  AtrValue,
  BollingerValue,
  IndicatorSnapshot,
  MacdValue,
  MetricResult,
} from "./types";
import { calculateAtrSeries, calculateSmaSeries } from "../../shared/candleAnalysis";

const DEFAULT_PRECISION = 8;

function round(value: number, precision: number = DEFAULT_PRECISION): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function validPeriod(period: number): number {
  return Math.max(1, Math.floor(period));
}

function unavailable<T>(period: number | null, sampleCount: number, reason: string): MetricResult<T> {
  return { status: "UNAVAILABLE", value: null, period, sampleCount, reason };
}

function available<T>(value: T, period: number | null, sampleCount: number): MetricResult<T> {
  return { status: "AVAILABLE", value, period, sampleCount, reason: null };
}

function closes(candles: AnalysisCandle[]): number[] {
  return candles.map((candle) => candle.close);
}

function finiteValues(values: number[]): boolean {
  return values.every(Number.isFinite);
}

function emaSeries(values: number[], period: number): Array<number | null> {
  const safePeriod = validPeriod(period);
  const output: Array<number | null> = Array(values.length).fill(null);
  if (values.length < safePeriod || !finiteValues(values)) return output;

  const seed = values.slice(0, safePeriod).reduce((sum, value) => sum + value, 0) / safePeriod;
  const multiplier = 2 / (safePeriod + 1);
  output[safePeriod - 1] = seed;

  let current = seed;
  for (let index = safePeriod; index < values.length; index += 1) {
    current = values[index]! * multiplier + current * (1 - multiplier);
    output[index] = current;
  }
  return output;
}

export function calculateSma(candles: AnalysisCandle[], period: number): MetricResult<number> {
  const safePeriod = validPeriod(period);
  const values = closes(candles);
  if (values.length < safePeriod) {
    return unavailable(safePeriod, values.length, `SMA ${safePeriod} requires at least ${safePeriod} valid candles.`);
  }
  const latest = calculateSmaSeries(candles, safePeriod).at(-1);
  if (latest === null || latest === undefined) return unavailable(safePeriod, values.length, "SMA input contains a non-finite or invalid OHLC value.");
  return available(latest, safePeriod, values.length);
}

export function calculateEma(candles: AnalysisCandle[], period: number): MetricResult<number> {
  const safePeriod = validPeriod(period);
  const values = closes(candles);
  if (values.length < safePeriod) {
    return unavailable(safePeriod, values.length, `EMA ${safePeriod} requires at least ${safePeriod} valid candles.`);
  }
  const series = emaSeries(values, safePeriod);
  const latest = series.at(-1);
  return latest === null || latest === undefined
    ? unavailable(safePeriod, values.length, "EMA input contains a non-finite close value.")
    : available(round(latest), safePeriod, values.length);
}

export function calculateRsi(candles: AnalysisCandle[], period: number = 14): MetricResult<number> {
  const safePeriod = validPeriod(period);
  const values = closes(candles);
  if (values.length < safePeriod + 1) {
    return unavailable(safePeriod, values.length, `RSI ${safePeriod} requires at least ${safePeriod + 1} valid candles.`);
  }
  if (!finiteValues(values)) return unavailable(safePeriod, values.length, "RSI input contains a non-finite close value.");

  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= safePeriod; index += 1) {
    const change = values[index]! - values[index - 1]!;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= safePeriod;
  averageLoss /= safePeriod;

  for (let index = safePeriod + 1; index < values.length; index += 1) {
    const change = values[index]! - values[index - 1]!;
    averageGain = ((averageGain * (safePeriod - 1)) + Math.max(change, 0)) / safePeriod;
    averageLoss = ((averageLoss * (safePeriod - 1)) + Math.max(-change, 0)) / safePeriod;
  }

  if (averageGain === 0 && averageLoss === 0) return available(50, safePeriod, values.length);
  if (averageLoss === 0) return available(100, safePeriod, values.length);
  if (averageGain === 0) return available(0, safePeriod, values.length);
  const relativeStrength = averageGain / averageLoss;
  return available(round(100 - (100 / (1 + relativeStrength)), 4), safePeriod, values.length);
}

export function calculateMacd(
  candles: AnalysisCandle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): MetricResult<MacdValue> {
  const fast = validPeriod(fastPeriod);
  const slow = validPeriod(slowPeriod);
  const signal = validPeriod(signalPeriod);
  const values = closes(candles);
  const minimumSamples = Math.max(fast, slow) + signal;
  if (fast >= slow) return unavailable(null, values.length, "MACD fast period must be shorter than the slow period.");
  if (values.length < minimumSamples) {
    return unavailable(null, values.length, `MACD ${fast}/${slow}/${signal} requires at least ${minimumSamples} valid candles.`);
  }
  if (!finiteValues(values)) return unavailable(null, values.length, "MACD input contains a non-finite close value.");

  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  const macdSeries: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const fastValue = fastSeries[index];
    const slowValue = slowSeries[index];
    if (fastValue !== null && slowValue !== null) macdSeries.push(fastValue - slowValue);
  }

  const signalSeries = emaSeries(macdSeries, signal);
  const macd = macdSeries.at(-1);
  const signalValue = signalSeries.at(-1);
  if (macd === undefined || signalValue === undefined || signalValue === null) {
    return unavailable(null, values.length, "MACD signal line could not be calculated from the available samples.");
  }
  return available(
    { macd: round(macd), signal: round(signalValue), histogram: round(macd - signalValue) },
    null,
    values.length,
  );
}

export function calculateBollingerBands(
  candles: AnalysisCandle[],
  period: number = 20,
  deviationMultiplier: number = 2,
): MetricResult<BollingerValue> {
  const safePeriod = validPeriod(period);
  const multiplier = Math.abs(deviationMultiplier);
  const values = closes(candles);
  if (values.length < safePeriod) {
    return unavailable(safePeriod, values.length, `Bollinger Bands ${safePeriod} requires at least ${safePeriod} valid candles.`);
  }
  const window = values.slice(-safePeriod);
  if (!finiteValues(window)) return unavailable(safePeriod, values.length, "Bollinger input contains a non-finite close value.");
  const middle = window.reduce((sum, value) => sum + value, 0) / safePeriod;
  const variance = window.reduce((sum, value) => sum + ((value - middle) ** 2), 0) / safePeriod;
  const deviation = Math.sqrt(variance);
  const upper = middle + multiplier * deviation;
  const lower = middle - multiplier * deviation;
  const widthPercent = middle === 0 ? 0 : ((upper - lower) / Math.abs(middle)) * 100;
  return available(
    {
      upper: round(upper),
      middle: round(middle),
      lower: round(lower),
      widthPercent: round(widthPercent, 4),
    },
    safePeriod,
    values.length,
  );
}

export function calculateAtr(candles: AnalysisCandle[], period: number = 14): MetricResult<AtrValue> {
  const safePeriod = validPeriod(period);
  if (candles.length < safePeriod + 1) {
    return unavailable(safePeriod, candles.length, `ATR ${safePeriod} requires at least ${safePeriod + 1} valid candles.`);
  }

  const atr = calculateAtrSeries(candles, safePeriod).at(-1);
  if (atr === null || atr === undefined) return unavailable(safePeriod, candles.length, "ATR input contains a non-finite or invalid OHLC range.");
  const latestClose = candles.at(-1)!.close;
  return available(
    { value: atr, percent: round(latestClose === 0 ? 0 : (atr / Math.abs(latestClose)) * 100, 4) },
    safePeriod,
    candles.length,
  );
}

export function calculateIndicatorSnapshot(candles: AnalysisCandle[]): IndicatorSnapshot {
  return {
    sma20: calculateSma(candles, 20),
    sma50: calculateSma(candles, 50),
    ema20: calculateEma(candles, 20),
    ema50: calculateEma(candles, 50),
    rsi14: calculateRsi(candles, 14),
    macd: calculateMacd(candles),
    bollinger20: calculateBollingerBands(candles, 20, 2),
    atr14: calculateAtr(candles, 14),
  };
}
