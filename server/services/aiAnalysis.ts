import { TechnicalIndicators } from "./technicalAnalysis";

export interface AIAnalysisResult {
  analysisMethod: "DETERMINISTIC_RULES";
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  explanation: string;
  sentiment: number; // -1 to 1
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  priceTarget?: number;
  stopLoss?: number;
}

/**
 * DETERMINISTIC KEYWORD SCORING — NOT a model, NOT AI.
 * Retained as a deterministic baseline. Every return value is tagged with
 * analysisMethod: "DETERMINISTIC_RULES" so no consumer can present it as
 * model output. See server/routers/analysis.ts for the full rationale.
 *
 * Analyze market sentiment from news (deterministic keyword implementation)
 * In production, this would integrate with a real news API and NLP model
 */
export function analyzeSentiment(newsHeadlines: string[]): number {
  // Mock sentiment analysis
  // In production, use FinBERT or similar NLP model
  const positiveWords = [
    "bullish",
    "surge",
    "gain",
    "rally",
    "breakthrough",
    "growth",
  ];
  const negativeWords = [
    "bearish",
    "crash",
    "loss",
    "decline",
    "drop",
    "weakness",
  ];

  let sentimentScore = 0;

  newsHeadlines.forEach((headline) => {
    const lowerHeadline = headline.toLowerCase();
    positiveWords.forEach((word) => {
      if (lowerHeadline.includes(word)) sentimentScore += 0.1;
    });
    negativeWords.forEach((word) => {
      if (lowerHeadline.includes(word)) sentimentScore -= 0.1;
    });
  });

  // Normalize to -1 to 1 range
  return Math.max(-1, Math.min(1, sentimentScore));
}

/**
 * Generate AI-powered trading analysis combining technical indicators and sentiment
 */
export function generateAIAnalysis(
  indicators: TechnicalIndicators,
  currentPrice: number,
  sentiment: number = 0,
  recentPrices: number[] = []
): AIAnalysisResult {
  let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
  let confidence = 50;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
  let explanations: string[] = [];

  // RSI Analysis
  const rsiScore = indicators.rsi;
  if (rsiScore < 30) {
    signal = "BUY";
    confidence += 20;
    explanations.push("RSI indicates oversold conditions");
  } else if (rsiScore > 70) {
    signal = "SELL";
    confidence -= 20;
    explanations.push("RSI indicates overbought conditions");
  }

  // MACD Analysis
  if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
    if (signal !== "SELL") {
      signal = "BUY";
      confidence += 15;
    }
    explanations.push("MACD shows bullish momentum");
  } else if (
    indicators.macd.histogram < 0 &&
    indicators.macd.macd < indicators.macd.signal
  ) {
    if (signal !== "BUY") {
      signal = "SELL";
      confidence -= 15;
    }
    explanations.push("MACD shows bearish momentum");
  }

  // EMA Analysis
  if (indicators.ema20 > indicators.ema50) {
    if (signal !== "SELL") {
      confidence += 10;
    }
    explanations.push("EMA20 above EMA50 (uptrend)");
  } else {
    if (signal !== "BUY") {
      confidence -= 10;
    }
    explanations.push("EMA20 below EMA50 (downtrend)");
  }

  // Bollinger Bands Analysis
  const bbMiddle = indicators.bollingerBands.middle;
  if (currentPrice < indicators.bollingerBands.lower) {
    signal = "BUY";
    confidence += 15;
    riskLevel = "MEDIUM";
    explanations.push("Price at lower Bollinger Band (potential reversal)");
  } else if (currentPrice > indicators.bollingerBands.upper) {
    signal = "SELL";
    confidence -= 15;
    riskLevel = "MEDIUM";
    explanations.push("Price at upper Bollinger Band (potential reversal)");
  }

  // Sentiment Analysis
  if (sentiment > 0.5) {
    if (signal !== "SELL") {
      confidence += 10;
    }
    explanations.push("Positive market sentiment");
  } else if (sentiment < -0.5) {
    if (signal !== "BUY") {
      confidence -= 10;
    }
    explanations.push("Negative market sentiment");
  }

  // Determine Risk Level
  if (confidence > 75) {
    riskLevel = "LOW";
  } else if (confidence < 40) {
    riskLevel = "HIGH";
  }

  // Calculate Price Targets
  let priceTarget: number | undefined;
  let stopLoss: number | undefined;

  if (signal === "BUY") {
    const resistance = indicators.bollingerBands.upper;
    priceTarget = resistance * 1.02; // 2% above resistance
    stopLoss = indicators.bollingerBands.lower * 0.98; // 2% below support
  } else if (signal === "SELL") {
    const support = indicators.bollingerBands.lower;
    priceTarget = support * 0.98; // 2% below support
    stopLoss = indicators.bollingerBands.upper * 1.02; // 2% above resistance
  }

  // Normalize confidence to 0-100
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    analysisMethod: "DETERMINISTIC_RULES" as const,
    signal,
    confidence: Math.round(confidence),
    explanation: explanations.join(". "),
    sentiment,
    riskLevel,
    priceTarget: priceTarget ? Math.round(priceTarget * 100) / 100 : undefined,
    stopLoss: stopLoss ? Math.round(stopLoss * 100) / 100 : undefined,
  };
}

/**
 * Generate market forecast based on recent price action
 */
export function generateForecast(
  recentPrices: number[],
  indicators: TechnicalIndicators
): {
  analysisMethod: "DETERMINISTIC_RULES";
  shortTerm: "BULLISH" | "BEARISH" | "NEUTRAL";
  mediumTerm: "BULLISH" | "BEARISH" | "NEUTRAL";
  volatility: number;
} {
  if (recentPrices.length < 2) {
    return {
    analysisMethod: "DETERMINISTIC_RULES" as const, shortTerm: "NEUTRAL", mediumTerm: "NEUTRAL", volatility: 0 };
  }

  // Calculate volatility
  const returns = [];
  for (let i = 1; i < recentPrices.length; i++) {
    returns.push((recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1]);
  }

  const volatility =
    Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length
    ) * 100;

  // Short-term trend (last 5 candles)
  const shortTermTrend =
    recentPrices[recentPrices.length - 1] > recentPrices[0] ? "BULLISH" : "BEARISH";

  // Medium-term trend (EMA comparison)
  const mediumTermTrend =
    indicators.ema20 > indicators.ema50 ? "BULLISH" : "BEARISH";

  return {
    analysisMethod: "DETERMINISTIC_RULES" as const,
    shortTerm: shortTermTrend,
    mediumTerm: mediumTermTrend,
    volatility: Math.round(volatility * 100) / 100,
  };
}
