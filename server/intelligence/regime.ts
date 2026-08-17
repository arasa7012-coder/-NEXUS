import type {
  IntelligenceTimeframe,
  MarketRegimeSnapshot,
  MetricResult,
  MomentumSnapshot,
  VolatilitySnapshot,
  MarketStructureSnapshot,
} from "./types";

export function classifyMarketRegime(input: {
  timeframe: IntelligenceTimeframe;
  structure: MetricResult<MarketStructureSnapshot>;
  volatility: MetricResult<VolatilitySnapshot>;
  momentum: MetricResult<MomentumSnapshot>;
}): MetricResult<MarketRegimeSnapshot> {
  const sampleCount = Math.max(input.structure.sampleCount, input.volatility.sampleCount, input.momentum.sampleCount);
  if (input.structure.status === "UNAVAILABLE" || input.volatility.status === "UNAVAILABLE") {
    const missing = [
      input.structure.status === "UNAVAILABLE" ? input.structure.reason : null,
      input.volatility.status === "UNAVAILABLE" ? input.volatility.reason : null,
    ].filter((reason): reason is string => Boolean(reason));
    return {
      status: "UNAVAILABLE",
      value: null,
      period: null,
      sampleCount,
      reason: `Market regime requires structure and volatility evidence. ${missing.join(" ")}`.trim(),
    };
  }

  const structure = input.structure.value;
  const volatility = input.volatility.value;
  const momentum = input.momentum.status === "AVAILABLE" ? input.momentum.value : null;
  const limitations: string[] = [];
  if (!momentum) limitations.push(input.momentum.reason ?? "Momentum evidence is unavailable.");
  else if (momentum.direction === "MIXED") limitations.push("Momentum evidence is mixed within the selected timeframe.");

  const regime = volatility.level === "HIGH"
    ? "HIGH_VOLATILITY"
    : structure.trend === "UPTREND" && momentum?.direction !== "BEARISH"
      ? "TRENDING_BULLISH"
      : structure.trend === "DOWNTREND" && momentum?.direction !== "BULLISH"
        ? "TRENDING_BEARISH"
        : structure.trend === "RANGE" || structure.event === "CONSOLIDATION"
          ? "RANGE_CONSOLIDATION"
          : volatility.level === "LOW"
            ? "LOW_VOLATILITY"
            : "UNCLEAR";

  return {
    status: "AVAILABLE",
    value: {
      regime,
      evidence: [
        ...structure.evidence.filter((item) => item.id === "structure-swings" || item.id === "structure-range"),
        ...volatility.evidence,
        ...(momentum?.evidence.filter((item) => item.id === "momentum-return-5" || item.id === "momentum-rsi") ?? []),
      ],
      limitations,
    },
    period: null,
    sampleCount,
    reason: null,
  };
}
