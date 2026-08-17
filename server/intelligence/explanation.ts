import type {
  DataQualityState,
  ExplainableScore,
  IntelligenceTimeframe,
  MarketRegimeSnapshot,
  MarketStructureSnapshot,
  MetricResult,
  MomentumSnapshot,
  MultiTimeframeSnapshot,
  NexusExplanation,
  VolatilitySnapshot,
  VolumeSnapshot,
} from "./types";

export interface ExplanationInput {
  assetName: string;
  symbol: string;
  primaryTimeframe: IntelligenceTimeframe | null;
  quality: DataQualityState;
  regime: MetricResult<MarketRegimeSnapshot>;
  structure: MetricResult<MarketStructureSnapshot>;
  momentum: MetricResult<MomentumSnapshot>;
  volatility: MetricResult<VolatilitySnapshot>;
  volume: MetricResult<VolumeSnapshot>;
  multiTimeframe: MetricResult<MultiTimeframeSnapshot>;
  opportunityScore: ExplainableScore;
  riskScore: ExplainableScore;
  signalStrength: ExplainableScore;
}

const disclaimer = "This is research and analysis only, not personalized financial advice. Scores are analytical indexes, not probabilities or promises of future performance.";

function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

function unavailableReasons(input: ExplanationInput): string[] {
  return Array.from(new Set([
    input.opportunityScore.unavailableReason,
    input.riskScore.unavailableReason,
    input.signalStrength.unavailableReason,
    input.regime.status === "UNAVAILABLE" ? input.regime.reason : null,
    input.structure.status === "UNAVAILABLE" ? input.structure.reason : null,
    input.momentum.status === "UNAVAILABLE" ? input.momentum.reason : null,
    input.volatility.status === "UNAVAILABLE" ? input.volatility.reason : null,
    input.multiTimeframe.status === "UNAVAILABLE" ? input.multiTimeframe.reason : null,
  ].filter((reason): reason is string => Boolean(reason))));
}

export function createNexusExplanation(input: ExplanationInput): NexusExplanation {
  const cannotScore = input.quality === "UNAVAILABLE"
    || input.quality === "ERROR"
    || input.opportunityScore.value === null
    || input.riskScore.value === null
    || input.signalStrength.value === null;

  if (cannotScore) {
    const reasons = unavailableReasons(input);
    return {
      summary: `Nexus cannot produce a scored market analysis for ${input.symbol} because required evidence is unavailable or insufficient.`,
      what: "The current market state is not classified with enough validated evidence.",
      why: reasons[0] ?? "One or more required analysis inputs are unavailable.",
      evidence: [],
      risks: reasons.length ? reasons : ["Insufficient validated evidence limits the analysis."],
      disclaimer,
    };
  }

  const timeframe = input.primaryTimeframe ?? "the selected";
  const regime = input.regime.status === "AVAILABLE" ? humanize(input.regime.value.regime) : "unclear";
  const structure = input.structure.status === "AVAILABLE" ? humanize(input.structure.value.trend) : "unavailable structure";
  const momentum = input.momentum.status === "AVAILABLE" ? humanize(input.momentum.value.direction) : "unavailable momentum";
  const volatility = input.volatility.status === "AVAILABLE" ? humanize(input.volatility.value.level) : "unavailable";
  const volume = input.volume.status === "AVAILABLE" ? humanize(input.volume.value.trend) : "unavailable";
  const alignment = input.multiTimeframe.status === "AVAILABLE" ? humanize(input.multiTimeframe.value.alignment) : "unavailable";

  const positiveEvidence = input.opportunityScore.factors
    .filter((factor) => factor.impact === "POSITIVE" && factor.points > 0)
    .sort((left, right) => right.points - left.points)
    .slice(0, 4)
    .map((factor) => factor.description);
  const risks = input.riskScore.factors
    .filter((factor) => (factor.impact === "RISK" || factor.impact === "LIMITATION") && factor.points > 0)
    .sort((left, right) => right.points - left.points)
    .slice(0, 4)
    .map((factor) => factor.description);
  if (input.quality === "STALE") risks.unshift("At least one required input is stale cached data.");

  return {
    summary: `${input.assetName} currently shows a ${regime} classification on ${timeframe}. Its opportunity index is ${input.opportunityScore.value}/100, risk index is ${input.riskScore.value}/100, and signal strength is ${input.signalStrength.value}/100.`,
    what: `The ${timeframe} structure is ${structure}, momentum is ${momentum}, and current volatility is ${volatility}.`,
    why: `The classification combines ${alignment}, ${volume} volume, confirmed structure, momentum, and volatility evidence from the available timeframes.`,
    evidence: positiveEvidence.length ? positiveEvidence : ["Available evidence is present but no factor met the positive contribution threshold."],
    risks: risks.length ? risks : ["No elevated modeled risk factor was detected, but market conditions can change and the analysis is not predictive."],
    disclaimer,
  };
}
