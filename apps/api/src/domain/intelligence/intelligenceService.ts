/**
 * Intelligence domain service.
 *
 * The mapping layer between @nexus/core's internal representation and the wire
 * contract. It exists so the core can evolve its shape without breaking a
 * shipped app, and so that translation happens exactly once.
 *
 * It computes nothing. Every number originates in the core; every
 * unavailability originates in the provider registry. If a provider returns
 * nothing, this service produces an UNAVAILABLE view with an attributed
 * reason — it does not substitute, interpolate, or invent.
 */

import { composeAssetIntelligence } from "@nexus/core";
import type {
  AssetIntelligence,
  ExplainableScore,
  TimeframeAnalysis,
  TimeframeAnalysisInput,
  IntelligenceTimeframe,
  IntelligenceSource,
  AnalysisCandle,
} from "@nexus/core";
import type {
  AssetIntelligenceView,
  DataOrigin,
  EntityRef,
  ExplainedScore,
  Timeframe,
  TimeframeSummary,
} from "@nexus/contracts";
import type { ProviderRegistry } from "../providers/registry.ts";

export interface RiskInputs {
  riskScore: number | null;
  signalStrength: number | null;
  atrPercent: number | null;
  dataUnavailable: boolean;
  dataQuality: "LIVE" | "STALE" | "UNAVAILABLE";
  origin: DataOrigin | null;
}

export interface CandleQuery {
  symbol: string;
  timeframe: Timeframe;
  limit: number;
}

/** The timeframes NEXUS evaluates by default. */
export const DEFAULT_TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

/** Core's ExplainableScore -> the wire contract's ExplainedScore. */
function toExplainedScore(score: ExplainableScore): ExplainedScore {
  return {
    value: score.value,
    coveragePercent: score.coveragePercent,
    factors: score.factors.map((f) => ({
      id: f.id,
      label: f.label,
      points: f.points,
      maxPoints: f.maxPoints,
      description: f.description,
    })),
    unavailableReason: score.unavailableReason,
  };
}

/**
 * Core's analysis metadata -> DataOrigin.
 *
 * The freshness mapping is the load-bearing part of this file: it is where the
 * core's notion of quality becomes the four states the UI is required to
 * distinguish. A wrong mapping here would let stale data render as live.
 */
/**
 * Core DataQualityState -> the four freshness states the UI must distinguish.
 *
 * This mapping is load-bearing: it is the exact point where the engine's
 * notion of quality becomes what the user sees. Getting it wrong would let
 * stale data render as live, which §19 forbids. `providerTimestampOrigin` of
 * "fetched" means the provider gave us no timestamp of its own and we
 * substituted our receive time — that is cached, not live.
 */
function toDataOrigin(analysis: TimeframeAnalysis, providerId: string | null): DataOrigin {
  const { metadata } = analysis;
  const freshness: DataOrigin["freshness"] =
    metadata.quality === "ERROR" || metadata.quality === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : metadata.quality === "STALE" || metadata.isStale
        ? "STALE"
        : metadata.providerTimestampOrigin === "fetched"
          ? "CACHED"
          : "LIVE";

  return {
    freshness,
    providerId,
    observedAt: metadata.providerUpdatedAt,
    cachedAt: metadata.cachedAt,
    reason: metadata.unavailableReasons[0] ?? null,
  };
}

function toTimeframeSummary(analysis: TimeframeAnalysis, providerId: string | null): TimeframeSummary {
  // "Usable" mirrors exactly the test composeAssetIntelligence applies when
  // choosing a primary timeframe, so the UI's notion of a usable row cannot
  // drift from the engine's.
  const usable =
    (analysis.metadata.quality === "LIVE" || analysis.metadata.quality === "STALE")
    && analysis.structure.status === "AVAILABLE"
    && analysis.momentum.status === "AVAILABLE"
    && analysis.volatility.status === "AVAILABLE";

  return {
    timeframe: analysis.timeframe as Timeframe,
    origin: toDataOrigin(analysis, providerId),
    regime: analysis.regime.status === "AVAILABLE" ? (analysis.regime.value?.regime ?? null) : null,
    sampleCount: analysis.metadata.sampleCount,
    usable,
  };
}

export class IntelligenceService {
  private readonly providers: ProviderRegistry;
  private readonly providerId: string;
  /** The core's IntelligenceSource label for this provider. */
  private readonly sourceName: IntelligenceSource;
  private readonly now: () => number;

  constructor(deps: {
    providers: ProviderRegistry;
    providerId: string;
    sourceName: IntelligenceSource;
    now: () => number;
  }) {
    this.providers = deps.providers;
    this.providerId = deps.providerId;
    this.sourceName = deps.sourceName;
    this.now = deps.now;
  }

  /**
   * Build the intelligence view for one asset.
   *
   * Every timeframe is fetched independently, and a failure on one does not
   * discard the others: partial evidence with honest gaps is more useful than
   * an all-or-nothing error, provided the gaps are labelled — which they are.
   */
  async forAsset(entity: EntityRef, timeframes: Timeframe[] = DEFAULT_TIMEFRAMES): Promise<AssetIntelligenceView> {
    const inputs: TimeframeAnalysisInput[] = [];

    for (const timeframe of timeframes) {
      const result = await this.providers.execute<CandleQuery, AnalysisCandle[]>(this.providerId, {
        symbol: entity.id,
        timeframe,
        limit: 200,
      });

      const failed = result.data === null;
      inputs.push({
        timeframe: timeframe as IntelligenceTimeframe,
        candles: result.data ?? [],
        source: this.sourceName,
        cachedAt: result.origin.cachedAt ?? this.now(),
        providerUpdatedAt: result.origin.observedAt,
        providerTimestampOrigin: result.origin.observedAt === null ? "fetched" : "provider",
        isStale: result.origin.freshness === "STALE",
        hasError: failed,
        ...(failed ? { unavailableReasons: [result.origin.reason ?? "Provider returned no data."] } : {}),
      });
    }

    const intelligence: AssetIntelligence = composeAssetIntelligence({
      assetId: entity.id,
      name: entity.label,
      symbol: entity.id,
      timeframes: inputs,
    });

    // ATR is measured evidence the risk engine requires. It lives on the
    // primary timeframe's volatility snapshot; surfacing it here avoids the
    // risk service reaching back into core internals.
    const primaryAnalysis = intelligence.timeframes.find(
      (t) => t.timeframe === intelligence.primaryTimeframe,
    );
    const atrPercent = primaryAnalysis?.volatility.status === "AVAILABLE"
      ? (primaryAnalysis.volatility.value?.atrPercent ?? null)
      : null;

    return {
      entity,
      atrPercent,
      primaryTimeframe: (intelligence.primaryTimeframe as Timeframe | null) ?? null,
      timeframes: intelligence.timeframes.map((t) => toTimeframeSummary(t, this.providerId)),
      opportunity: toExplainedScore(intelligence.opportunityScore),
      risk: toExplainedScore(intelligence.riskScore),
      signalStrength: toExplainedScore(intelligence.signalStrength),
      // The core writes the narrative from the evidence it actually had. When
      // there was none, it says so rather than producing filler.
      explanation: intelligence.explanation.summary,
      evidence: intelligence.explanation.evidence,
      generatedAt: intelligence.generatedAt,
    };
  }

  /** Exposed so the risk service can consume intelligence without re-fetching. */
  static riskInputsFrom(view: AssetIntelligenceView): RiskInputs {
    const primary = view.timeframes.find((t) => t.timeframe === view.primaryTimeframe);
    return {
      riskScore: view.risk.value,
      signalStrength: view.signalStrength.value,
      atrPercent: view.atrPercent,
      // No qualifying primary timeframe means the engine found no usable
      // evidence anywhere; risk must decline to score rather than guess.
      dataUnavailable: !primary || primary.origin.freshness === "UNAVAILABLE",
      // The core's RiskDataQuality vocabulary, not an invented one.
      dataQuality: !primary || primary.origin.freshness === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : primary.origin.freshness === "STALE"
          ? "STALE"
          : "LIVE",
      origin: primary?.origin ?? null,
    };
  }
}
