/**
 * Technical Analysis Service
 * Calculates various technical indicators for cryptocurrency price data
 */

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PriceSeries = Candle[] | number[];

function closingPrices(series: PriceSeries): number[] {
  return series
    .map((point) => (typeof point === "number" ? point : point.close))
    .filter((price) => Number.isFinite(price));
}

export interface TechnicalIndicators {
  rsi: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  ema20: number;
  ema50: number;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(series: PriceSeries, period: number = 14): number {
  const prices = closingPrices(series);
  const safePeriod = Math.max(1, Math.floor(period));

  if (prices.length < safePeriod + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - safePeriod; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / safePeriod;
  const avgLoss = losses / safePeriod;

  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi * 100) / 100;
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
export function calculateEMA(series: PriceSeries, period: number): number {
  const prices = closingPrices(series);
  if (prices.length === 0) return 0;

  const safePeriod = Math.max(1, Math.floor(period));
  const multiplier = 2 / (safePeriod + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * multiplier + ema * (1 - multiplier);
  }

  return Math.round(ema * 100) / 100;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  series: PriceSeries
): { macd: number; signal: number; histogram: number } {
  const prices = closingPrices(series);
  if (prices.length === 0) return { macd: 0, signal: 0, histogram: 0 };

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  const macd = ema12 - ema26;

  // Calculate signal line (9-period EMA of MACD)
  const macdValues = [];
  for (let i = 0; i < prices.length; i++) {
    const ema12_i = calculateEMA(prices.slice(0, i + 1), 12);
    const ema26_i = calculateEMA(prices.slice(0, i + 1), 26);
    macdValues.push(ema12_i - ema26_i);
  }

  const signal = calculateEMA(macdValues, 9);

  const histogram = macd - signal;

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
  };
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
  series: PriceSeries,
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number } {
  const prices = closingPrices(series);
  if (prices.length === 0) return { upper: 0, middle: 0, lower: 0 };

  const safePeriod = Math.max(1, Math.floor(period));
  const effectivePeriod = Math.min(safePeriod, prices.length);
  const closes = prices.slice(-effectivePeriod);
  const middle = closes.reduce((a, b) => a + b, 0) / effectivePeriod;

  const variance =
    closes.reduce((sum, close) => sum + Math.pow(close - middle, 2), 0) /
    effectivePeriod;
  const standardDeviation = Math.sqrt(variance);

  const deviationMultiplier = Math.abs(stdDev);
  const upper = middle + deviationMultiplier * standardDeviation;
  const lower = middle - deviationMultiplier * standardDeviation;

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
  };
}

/**
 * Calculate all technical indicators
 */
export function calculateAllIndicators(candles: Candle[]): TechnicalIndicators {
  if (candles.length === 0) {
    return {
      rsi: 50,
      macd: { macd: 0, signal: 0, histogram: 0 },
      bollingerBands: { upper: 0, middle: 0, lower: 0 },
      ema20: 0,
      ema50: 0,
    };
  }

  return {
    rsi: calculateRSI(candles),
    macd: calculateMACD(candles),
    bollingerBands: calculateBollingerBands(candles),
    ema20: calculateEMA(candles, 20),
    ema50: calculateEMA(candles, 50),
  };
}

/**
 * Generate trading signal based on technical indicators
 */
export function generateTradingSignal(indicators: TechnicalIndicators): {
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  explanation: string;
} {
  let score = 0;
  let explanations: string[] = [];

  // RSI Analysis
  if (indicators.rsi < 30) {
    score += 2;
    explanations.push("RSI oversold (bullish)");
  } else if (indicators.rsi > 70) {
    score -= 2;
    explanations.push("RSI overbought (bearish)");
  }

  // MACD Analysis
  if (indicators.macd.histogram > 0) {
    score += 1;
    explanations.push("MACD positive (bullish)");
  } else {
    score -= 1;
    explanations.push("MACD negative (bearish)");
  }

  // Bollinger Bands Analysis
  // (simplified - would need current price for full analysis)
  if (indicators.bollingerBands.upper > 0) {
    explanations.push("Bollinger Bands active");
  }

  // EMA Analysis
  if (indicators.ema20 > indicators.ema50) {
    score += 1;
    explanations.push("EMA20 > EMA50 (bullish)");
  } else {
    score -= 1;
    explanations.push("EMA20 < EMA50 (bearish)");
  }

  let signal: "BUY" | "SELL" | "HOLD";
  if (score >= 2) {
    signal = "BUY";
  } else if (score <= -2) {
    signal = "SELL";
  } else {
    signal = "HOLD";
  }

  const confidence = Math.min(100, Math.abs(score) * 25);

  return {
    signal,
    confidence: Math.round(confidence),
    explanation: explanations.join(", "),
  };
}
