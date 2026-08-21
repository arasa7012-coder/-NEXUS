import { createNexusExplanation } from "./explanation.ts";
import { calculateIndicatorSnapshot } from "./indicators.ts";
import { analyzeMomentum } from "./momentum.ts";
import { analyzeMultiTimeframe } from "./multiTimeframe.ts";
import { buildAnalysisMetadata } from "./normalization.ts";
import { classifyMarketRegime } from "./regime.ts";
import { calculateRiskScore } from "./risk.ts";
import { calculateOpportunityScore, calculateSignalStrength } from "./scoring.ts";
import { analyzeMarketStructure } from "./structure.ts";
import { analyzeVolatility } from "./volatility.ts";
import { analyzeVolume } from "./volume.ts";
import type {
  AnalysisCandle,
  AssetIntelligence,
  ExplainableScore,
  IntelligenceSource,
  IntelligenceTimeframe,
  MarketRegimeSnapshot,
  MetricResult,
  TimeframeAnalysis,
  TimeframeIntelligenceSummary,
  TimestampOrigin,
} from "./types.ts";

export interface TimeframeAnalysisInput {
  timeframe: IntelligenceTimeframe;
  candles: AnalysisCandle[];
  source: IntelligenceSource;
  cachedAt: number;
  providerUpdatedAt: number | null;
  providerTimestampOrigin: TimestampOrigin | null;
  isStale: boolean;
  unavailableReasons?: string[];
  hasError?: boolean;
}

const primaryPreference: IntelligenceTimeframe[] = ["4h", "1d", "1h", "15m", "5m"];

function missingRegime(reason: string): MetricResult<MarketRegimeSnapshot> {
  return { status: "UNAVAILABLE", value: null, period: null, sampleCount: 0, reason };
}

function missingScore(label: ExplainableScore["label"], reason: string): ExplainableScore {
  return { value: null, label, coveragePercent: 0, factors: [], unavailableReason: reason };
}

export function analyzeTimeframe(input: TimeframeAnalysisInput): TimeframeAnalysis {
  const metadata = buildAnalysisMetadata({
    source: input.source,
    providerUpdatedAt: input.providerUpdatedAt,
    providerTimestampOrigin: input.providerTimestampOrigin,
    cachedAt: input.cachedAt,
    sampleCount: input.candles.length,
    minimumSamples: 20,
    isStale: input.isStale,
    unavailableReasons: input.unavailableReasons,
    hasError: input.hasError,
  });
  const indicators = calculateIndicatorSnapshot(input.candles);
  const momentum = analyzeMomentum(input.candles, input.timeframe);
  const volatility = analyzeVolatility(input.candles, input.timeframe);
  const volume = analyzeVolume(input.candles, input.timeframe);
  const structure = analyzeMarketStructure(input.candles, input.timeframe);
  const regime = metadata.quality === "ERROR"
    ? missingRegime(metadata.unavailableReasons[0] ?? "The timeframe could not be analyzed.")
    : classifyMarketRegime({ timeframe: input.timeframe, structure, volatility, momentum });

  return {
    timeframe: input.timeframe,
    metadata,
    indicators,
    momentum,
    volatility,
    volume,
    structure,
    regime,
  };
}

function toSummary(analysis: TimeframeAnalysis): TimeframeIntelligenceSummary {
  return {
    timeframe: analysis.timeframe,
    quality: analysis.metadata.quality,
    trend: analysis.structure.status === "AVAILABLE" ? analysis.structure.value.trend : "UNAVAILABLE",
    momentum: analysis.momentum.status === "AVAILABLE" ? analysis.momentum.value.direction : "NEUTRAL",
    volatility: analysis.volatility.status === "AVAILABLE" ? analysis.volatility.value.level : "UNAVAILABLE",
    sampleCount: analysis.metadata.sampleCount,
    isStale: analysis.metadata.isStale,
    unavailableReasons: analysis.metadata.unavailableReasons,
  };
}

export function composeAssetIntelligence(input: {
  assetId: string;
  name: string;
  symbol: string;
  timeframes: TimeframeAnalysisInput[];
  preferredTimeframe?: IntelligenceTimeframe;
}): AssetIntelligence {
  const timeframes = input.timeframes.map(analyzeTimeframe);
  const multiTimeframe = analyzeMultiTimeframe(timeframes.map(toSummary));
  const preference = input.preferredTimeframe
    ? [input.preferredTimeframe, ...primaryPreference.filter((timeframe) => timeframe !== input.preferredTimeframe)]
    : primaryPreference;
  const primary = preference
    .map((timeframe) => timeframes.find((analysis) => analysis.timeframe === timeframe))
    .find((analysis): analysis is TimeframeAnalysis => Boolean(
      analysis
      && (analysis.metadata.quality === "LIVE" || analysis.metadata.quality === "STALE")
      && analysis.structure.status === "AVAILABLE"
      && analysis.momentum.status === "AVAILABLE"
      && analysis.volatility.status === "AVAILABLE",
    ));

  if (!primary) {
    const reason = "No timeframe contains sufficient validated structure, momentum, and volatility evidence.";
    const regime = missingRegime(reason);
    const opportunityScore = missingScore("OPPORTUNITY", reason);
    const riskScore = missingScore("RISK", reason);
    const signalStrength = missingScore("SIGNAL_STRENGTH", reason);
    return {
      assetId: input.assetId,
      name: input.name,
      symbol: input.symbol,
      generatedAt: Date.now(),
      primaryTimeframe: null,
      timeframes,
      multiTimeframe,
      regime,
      opportunityScore,
      riskScore,
      signalStrength,
      explanation: createNexusExplanation({
        assetName: input.name,
        symbol: input.symbol,
        primaryTimeframe: null,
        quality: "UNAVAILABLE",
        regime,
        structure: { status: "UNAVAILABLE", value: null, period: null, sampleCount: 0, reason },
        momentum: { status: "UNAVAILABLE", value: null, period: null, sampleCount: 0, reason },
        volatility: { status: "UNAVAILABLE", value: null, period: null, sampleCount: 0, reason },
        volume: { status: "UNAVAILABLE", value: null, period: null, sampleCount: 0, reason },
        multiTimeframe,
        opportunityScore,
        riskScore,
        signalStrength,
      }),
    };
  }

  const isStale = primary.metadata.isStale
    || (multiTimeframe.status === "AVAILABLE" && timeframes.some((analysis) => (
      multiTimeframe.value.bullishFrames.includes(analysis.timeframe)
      || multiTimeframe.value.bearishFrames.includes(analysis.timeframe)
      || multiTimeframe.value.neutralFrames.includes(analysis.timeframe)
    )) && timeframes.some((analysis) => analysis.metadata.isStale));
  const scoringInput = {
    timeframe: primary.timeframe,
    structure: primary.structure,
    momentum: primary.momentum,
    volume: primary.volume,
    volatility: primary.volatility,
    multiTimeframe,
    isStale,
  };
  const opportunityScore = calculateOpportunityScore(scoringInput);
  const riskScore = calculateRiskScore({ ...scoringInput, currentPrice: input.timeframes.find((item) => item.timeframe === primary.timeframe)?.candles.at(-1)?.close ?? 0 });
  const signalStrength = calculateSignalStrength(scoringInput);
  const quality = primary.metadata.quality === "STALE" || isStale ? "STALE" : "LIVE";

  return {
    assetId: input.assetId,
    name: input.name,
    symbol: input.symbol,
    generatedAt: Date.now(),
    primaryTimeframe: primary.timeframe,
    timeframes,
    multiTimeframe,
    regime: primary.regime,
    opportunityScore,
    riskScore,
    signalStrength,
    explanation: createNexusExplanation({
      assetName: input.name,
      symbol: input.symbol,
      primaryTimeframe: primary.timeframe,
      quality,
      regime: primary.regime,
      structure: primary.structure,
      momentum: primary.momentum,
      volatility: primary.volatility,
      volume: primary.volume,
      multiTimeframe,
      opportunityScore,
      riskScore,
      signalStrength,
    }),
  };
}
