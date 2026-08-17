// Machine Learning Prediction Service
// Using simple statistical models for price prediction

export interface PredictionResult {
  symbol: string;
  currentPrice: number;
  predictedPrice24h: number;
  predictedPrice7d: number;
  confidence: number;
  trend: "UP" | "DOWN" | "NEUTRAL";
  volatility: number;
}

// Calculate Simple Moving Average
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// Calculate Exponential Moving Average
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

// Calculate Standard Deviation (Volatility)
export function calculateStdDev(prices: number[]): number {
  if (prices.length < 2) return 0;

  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;

  return Math.sqrt(variance);
}

// Calculate RSI
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Linear Regression for trend prediction
export function linearRegression(prices: number[]): { slope: number; intercept: number } {
  const n = prices.length;
  if (n < 2) return { slope: 0, intercept: prices[0] || 0 };

  const xValues = Array.from({ length: n }, (_, i) => i);
  const xMean = xValues.reduce((a, b) => a + b, 0) / n;
  const yMean = prices.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (prices[i] - yMean);
    denominator += Math.pow(xValues[i] - xMean, 2);
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  return { slope, intercept };
}

// Predict future price using multiple indicators
export function predictPrice(
  historicalPrices: number[],
  daysAhead: number = 1
): PredictionResult | null {
  if (historicalPrices.length < 20) return null;

  const currentPrice = historicalPrices[historicalPrices.length - 1];

  // Calculate indicators
  const sma20 = calculateSMA(historicalPrices, 20);
  const ema12 = calculateEMA(historicalPrices, 12);
  const rsi = calculateRSI(historicalPrices);
  const stdDev = calculateStdDev(historicalPrices);
  const { slope, intercept } = linearRegression(historicalPrices);

  // Predict using linear regression
  const nextX = historicalPrices.length + daysAhead;
  const predictedPrice = intercept + slope * nextX;

  // Calculate trend based on multiple factors
  let trendScore = 0;

  // Factor 1: SMA vs Current Price
  if (currentPrice > sma20) trendScore += 1;
  else if (currentPrice < sma20) trendScore -= 1;

  // Factor 2: EMA vs Current Price
  if (currentPrice > ema12) trendScore += 1;
  else if (currentPrice < ema12) trendScore -= 1;

  // Factor 3: RSI
  if (rsi > 70) trendScore -= 1; // Overbought
  else if (rsi < 30) trendScore += 1; // Oversold
  else if (rsi > 50) trendScore += 0.5;
  else trendScore -= 0.5;

  // Factor 4: Linear Regression Slope
  if (slope > 0) trendScore += 1;
  else if (slope < 0) trendScore -= 1;

  // Determine trend
  let trend: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
  if (trendScore > 1.5) trend = "UP";
  else if (trendScore < -1.5) trend = "DOWN";

  // Calculate confidence (0-100)
  const volatilityPercent = (stdDev / currentPrice) * 100;
  const confidence = Math.max(0, Math.min(100, 80 - volatilityPercent * 2));

  // Adjust prediction based on volatility
  const volatilityAdjustment = stdDev * (daysAhead / 7);
  const adjustedPrediction = predictedPrice + (trend === "UP" ? volatilityAdjustment : -volatilityAdjustment);

  return {
    symbol: "UNKNOWN",
    currentPrice,
    predictedPrice24h: daysAhead === 1 ? adjustedPrediction : 0,
    predictedPrice7d: daysAhead === 7 ? adjustedPrediction : 0,
    confidence: Math.round(confidence),
    trend,
    volatility: Math.round(volatilityPercent * 100) / 100,
  };
}

// Predict multiple timeframes
export function predictPrices(historicalPrices: number[]) {
  const prediction24h = predictPrice(historicalPrices, 1);
  const prediction7d = predictPrice(historicalPrices, 7);

  return {
    prediction24h,
    prediction7d,
  };
}

// Anomaly detection for unusual price movements
export function detectAnomalies(prices: number[], threshold: number = 2): number[] {
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const stdDev = calculateStdDev(prices);

  const anomalies: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    const zScore = Math.abs((prices[i] - mean) / stdDev);
    if (zScore > threshold) {
      anomalies.push(i);
    }
  }

  return anomalies;
}

// Calculate Sharpe Ratio for portfolio performance
export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
  if (returns.length === 0) return 0;

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = calculateStdDev(returns);

  if (stdDev === 0) return 0;

  return (meanReturn - riskFreeRate) / stdDev;
}

// Calculate Maximum Drawdown
export function calculateMaxDrawdown(prices: number[]): number {
  if (prices.length < 2) return 0;

  let maxPrice = prices[0];
  let maxDrawdown = 0;

  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > maxPrice) {
      maxPrice = prices[i];
    } else {
      const drawdown = (maxPrice - prices[i]) / maxPrice;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}
