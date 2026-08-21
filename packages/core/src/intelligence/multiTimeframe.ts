import type {
  AnalysisDirection,
  EvidenceItem,
  IntelligenceTimeframe,
  MetricResult,
  MultiTimeframeSnapshot,
  TimeframeIntelligenceSummary,
} from "./types.ts";

function frameDirection(summary: TimeframeIntelligenceSummary): AnalysisDirection {
  if (summary.quality === "UNAVAILABLE" || summary.quality === "ERROR") return "NEUTRAL";
  if (summary.trend === "UPTREND" && summary.momentum !== "BEARISH") return "BULLISH";
  if (summary.trend === "DOWNTREND" && summary.momentum !== "BULLISH") return "BEARISH";
  if (summary.trend === "UPTREND" && summary.momentum === "BEARISH") return "MIXED";
  if (summary.trend === "DOWNTREND" && summary.momentum === "BULLISH") return "MIXED";
  if (summary.momentum === "BULLISH") return "BULLISH";
  if (summary.momentum === "BEARISH") return "BEARISH";
  return summary.momentum;
}

export function analyzeMultiTimeframe(
  summaries: TimeframeIntelligenceSummary[],
): MetricResult<MultiTimeframeSnapshot> {
  const unique = new Map<IntelligenceTimeframe, TimeframeIntelligenceSummary>();
  for (const summary of summaries) unique.set(summary.timeframe, summary);

  const unavailableFrames = Array.from(unique.values())
    .filter((summary) => summary.quality === "UNAVAILABLE" || summary.quality === "ERROR")
    .map((summary) => summary.timeframe);
  const available = Array.from(unique.values())
    .filter((summary) => summary.quality === "LIVE" || summary.quality === "STALE");

  if (available.length < 2) {
    return {
      status: "UNAVAILABLE",
      value: null,
      period: null,
      sampleCount: available.length,
      reason: "Multi-timeframe analysis requires at least two available timeframe summaries.",
    };
  }

  const bullishFrames: IntelligenceTimeframe[] = [];
  const bearishFrames: IntelligenceTimeframe[] = [];
  const neutralFrames: IntelligenceTimeframe[] = [];
  const evidence: EvidenceItem[] = [];

  for (const summary of available) {
    const direction = frameDirection(summary);
    if (direction === "BULLISH") bullishFrames.push(summary.timeframe);
    else if (direction === "BEARISH") bearishFrames.push(summary.timeframe);
    else neutralFrames.push(summary.timeframe);

    evidence.push({
      id: `timeframe-${summary.timeframe}`,
      label: `${summary.timeframe} alignment input`,
      direction: direction === "BULLISH" ? "POSITIVE" : direction === "BEARISH" ? "NEGATIVE" : "NEUTRAL",
      value: direction,
      unit: null,
      description: `${summary.timeframe} combines ${summary.trend.toLowerCase()} structure with ${summary.momentum.toLowerCase()} momentum (${summary.quality.toLowerCase()} data).`,
      timeframe: summary.timeframe,
      asOf: Date.now(),
    });
  }

  const threshold = Math.ceil(available.length * 0.6);
  const alignment = bullishFrames.length > 0 && bearishFrames.length > 0
    ? "TREND_CONFLICT"
    : bullishFrames.length >= threshold
      ? "BULLISH_ALIGNMENT"
      : bearishFrames.length >= threshold
        ? "BEARISH_ALIGNMENT"
        : "MIXED_SIGNALS";

  return {
    status: "AVAILABLE",
    value: {
      alignment,
      bullishFrames,
      bearishFrames,
      neutralFrames,
      unavailableFrames,
      availableCount: available.length,
      evidence,
    },
    period: null,
    sampleCount: available.length,
    reason: null,
  };
}
