export const intelligenceTimeframes = ["5m", "15m", "1h", "4h", "1d"] as const;

export type IntelligenceTimeframe = (typeof intelligenceTimeframes)[number];
export type DataQualityState = "LIVE" | "STALE" | "UNAVAILABLE" | "ERROR";
export type AnalysisDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED";
export type EvidenceDirection = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "RISK";
export type IntelligenceSource = "coingecko" | "binance" | "coinbase" | "mixed";
export type TimestampOrigin = "provider" | "fetched";

export interface AnalysisCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolumeUsd: number;
  tradeCount: number;
}

export interface EvidenceItem {
  id: string;
  label: string;
  direction: EvidenceDirection;
  value: number | string | null;
  unit: string | null;
  description: string;
  timeframe: IntelligenceTimeframe;
  asOf: number;
}

export interface AnalysisMetadata {
  quality: DataQualityState;
  source: IntelligenceSource;
  providerUpdatedAt: number | null;
  providerTimestampOrigin: TimestampOrigin | null;
  cachedAt: number;
  sampleCount: number;
  isStale: boolean;
  unavailableReasons: string[];
}

export interface AvailableAnalysis<T> {
  quality: "LIVE" | "STALE";
  value: T;
  evidence: EvidenceItem[];
  metadata: AnalysisMetadata;
}

export interface MissingAnalysis {
  quality: "UNAVAILABLE" | "ERROR";
  value: null;
  evidence: EvidenceItem[];
  metadata: AnalysisMetadata;
}

export type AnalysisResult<T> = AvailableAnalysis<T> | MissingAnalysis;

export interface AvailableMetric<T> {
  status: "AVAILABLE";
  value: T;
  period: number | null;
  sampleCount: number;
  reason: null;
}

export interface MissingMetric {
  status: "UNAVAILABLE";
  value: null;
  period: number | null;
  sampleCount: number;
  reason: string;
}

export type MetricResult<T> = AvailableMetric<T> | MissingMetric;

export interface MacdValue {
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerValue {
  upper: number;
  middle: number;
  lower: number;
  widthPercent: number;
}

export interface AtrValue {
  value: number;
  percent: number;
}

export interface IndicatorSnapshot {
  sma20: MetricResult<number>;
  sma50: MetricResult<number>;
  ema20: MetricResult<number>;
  ema50: MetricResult<number>;
  rsi14: MetricResult<number>;
  macd: MetricResult<MacdValue>;
  bollinger20: MetricResult<BollingerValue>;
  atr14: MetricResult<AtrValue>;
}

export interface MomentumSnapshot {
  direction: AnalysisDirection;
  return1PeriodPercent: number;
  return5PeriodPercent: number;
  return10PeriodPercent: number;
  fivePeriodAccelerationPercent: number;
  rsi: number | null;
  macdHistogram: number | null;
  evidence: EvidenceItem[];
}

export type VolatilityLevel = "HIGH" | "NORMAL" | "LOW" | "UNAVAILABLE";

export interface VolatilitySnapshot {
  level: VolatilityLevel;
  atrPercent: number | null;
  bollingerWidthPercent: number | null;
  averageRangePercent: number;
  evidence: EvidenceItem[];
}

export type VolumeTrend = "INCREASING" | "DECREASING" | "STABLE";

export interface VolumeSnapshot {
  trend: VolumeTrend;
  recentAverage: number;
  baselineAverage: number;
  relativeVolume: number;
  trendPercent: number;
  evidence: EvidenceItem[];
}

export interface SwingPoint {
  index: number;
  occurredAt: number;
  price: number;
  kind: "HIGH" | "LOW";
}

export interface PriceLevel {
  price: number;
  touches: number;
  lastTouchedAt: number;
  kind: "SUPPORT" | "RESISTANCE";
}

export type StructureTrend = "UPTREND" | "DOWNTREND" | "RANGE" | "MIXED" | "UNAVAILABLE";
export type StructureEvent = "BREAKOUT" | "BREAKDOWN" | "CONSOLIDATION" | "NONE";

export interface MarketStructureSnapshot {
  trend: StructureTrend;
  event: StructureEvent;
  higherHighs: number;
  higherLows: number;
  lowerHighs: number;
  lowerLows: number;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  support: PriceLevel[];
  resistance: PriceLevel[];
  evidence: EvidenceItem[];
}

export interface TimeframeIntelligenceSummary {
  timeframe: IntelligenceTimeframe;
  quality: DataQualityState;
  trend: StructureTrend;
  momentum: AnalysisDirection;
  volatility: VolatilityLevel;
  sampleCount: number;
  isStale: boolean;
  unavailableReasons: string[];
}

export type TimeframeAlignment =
  | "BULLISH_ALIGNMENT"
  | "BEARISH_ALIGNMENT"
  | "MIXED_SIGNALS"
  | "TREND_CONFLICT"
  | "UNAVAILABLE";

export interface MultiTimeframeSnapshot {
  alignment: TimeframeAlignment;
  bullishFrames: IntelligenceTimeframe[];
  bearishFrames: IntelligenceTimeframe[];
  neutralFrames: IntelligenceTimeframe[];
  unavailableFrames: IntelligenceTimeframe[];
  availableCount: number;
  evidence: EvidenceItem[];
}

export type MarketRegime =
  | "TRENDING_BULLISH"
  | "TRENDING_BEARISH"
  | "RANGE_CONSOLIDATION"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "UNCLEAR";

export interface MarketRegimeSnapshot {
  regime: MarketRegime;
  evidence: EvidenceItem[];
  limitations: string[];
}

export interface ScoreFactor {
  id: string;
  label: string;
  impact: "POSITIVE" | "NEGATIVE" | "RISK" | "LIMITATION";
  points: number;
  maxPoints: number;
  description: string;
  timeframe: IntelligenceTimeframe | null;
}

export interface ExplainableScore {
  value: number | null;
  label: "OPPORTUNITY" | "RISK" | "SIGNAL_STRENGTH";
  coveragePercent: number;
  factors: ScoreFactor[];
  unavailableReason: string | null;
}

export interface NexusExplanation {
  summary: string;
  what: string;
  why: string;
  evidence: string[];
  risks: string[];
  disclaimer: string;
}

export interface TimeframeAnalysis {
  timeframe: IntelligenceTimeframe;
  metadata: AnalysisMetadata;
  indicators: IndicatorSnapshot;
  momentum: MetricResult<MomentumSnapshot>;
  volatility: MetricResult<VolatilitySnapshot>;
  volume: MetricResult<VolumeSnapshot>;
  structure: MetricResult<MarketStructureSnapshot>;
  regime: MetricResult<MarketRegimeSnapshot>;
}

export interface AssetIntelligence {
  assetId: string;
  name: string;
  symbol: string;
  generatedAt: number;
  primaryTimeframe: IntelligenceTimeframe | null;
  timeframes: TimeframeAnalysis[];
  multiTimeframe: MetricResult<MultiTimeframeSnapshot>;
  regime: MetricResult<MarketRegimeSnapshot>;
  opportunityScore: ExplainableScore;
  riskScore: ExplainableScore;
  signalStrength: ExplainableScore;
  explanation: NexusExplanation;
}
