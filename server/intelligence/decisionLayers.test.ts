import { describe, expect, it } from "vitest";
import { createNexusExplanation } from "./explanation";
import { classifyMarketRegime } from "./regime";
import { calculateRiskScore } from "./risk";
import { calculateOpportunityScore, calculateSignalStrength, type ScoringInput } from "./scoring";
import type {
  MarketStructureSnapshot,
  MetricResult,
  MomentumSnapshot,
  MultiTimeframeSnapshot,
  VolatilitySnapshot,
  VolumeSnapshot,
} from "./types";

function available<T>(value: T, sampleCount: number = 120): MetricResult<T> {
  return { status: "AVAILABLE", value, period: null, sampleCount, reason: null };
}

function missing<T>(reason: string): MetricResult<T> {
  return { status: "UNAVAILABLE", value: null, period: null, sampleCount: 0, reason };
}

function scoringInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  const structure: MarketStructureSnapshot = {
    trend: "UPTREND",
    event: "BREAKOUT",
    higherHighs: 3,
    higherLows: 3,
    lowerHighs: 0,
    lowerLows: 0,
    swingHighs: [],
    swingLows: [],
    support: [{ price: 95, touches: 2, lastTouchedAt: 1, kind: "SUPPORT" }],
    resistance: [{ price: 110, touches: 2, lastTouchedAt: 1, kind: "RESISTANCE" }],
    evidence: [],
  };
  const momentum: MomentumSnapshot = {
    direction: "BULLISH",
    return1PeriodPercent: 1,
    return5PeriodPercent: 4,
    return10PeriodPercent: 8,
    fivePeriodAccelerationPercent: 1,
    rsi: 62,
    macdHistogram: 2,
    evidence: [],
  };
  const volume: VolumeSnapshot = {
    trend: "INCREASING",
    recentAverage: 150,
    baselineAverage: 100,
    relativeVolume: 1.5,
    trendPercent: 30,
    evidence: [],
  };
  const volatility: VolatilitySnapshot = {
    level: "NORMAL",
    atrPercent: 2,
    bollingerWidthPercent: 7,
    averageRangePercent: 2.5,
    evidence: [],
  };
  const multi: MultiTimeframeSnapshot = {
    alignment: "BULLISH_ALIGNMENT",
    bullishFrames: ["1h", "4h"],
    bearishFrames: [],
    neutralFrames: ["15m"],
    unavailableFrames: [],
    availableCount: 3,
    evidence: [],
  };
  return {
    timeframe: "4h",
    structure: available(structure),
    momentum: available(momentum),
    volume: available(volume),
    volatility: available(volatility),
    multiTimeframe: available(multi),
    isStale: false,
    ...overrides,
  };
}

describe("market regime classification", () => {
  it("classifies directional, volatile, and unavailable contexts without prediction language", () => {
    const base = scoringInput();
    const bullish = classifyMarketRegime({ timeframe: "4h", structure: base.structure, volatility: base.volatility, momentum: base.momentum });
    const highVolatility = classifyMarketRegime({
      timeframe: "4h",
      structure: base.structure,
      momentum: base.momentum,
      volatility: available({ ...base.volatility.value!, level: "HIGH" }),
    });
    const unavailable = classifyMarketRegime({ timeframe: "4h", structure: missing("structure missing"), volatility: base.volatility, momentum: base.momentum });
    expect(bullish.status === "AVAILABLE" && bullish.value.regime).toBe("TRENDING_BULLISH");
    expect(highVolatility.status === "AVAILABLE" && highVolatility.value.regime).toBe("HIGH_VOLATILITY");
    expect(unavailable).toMatchObject({ status: "UNAVAILABLE", value: null });
  });
});

describe("explainable scoring and risk", () => {
  it("produces separate opportunity, risk, and signal indexes with factor lineage", () => {
    const input = scoringInput();
    const opportunity = calculateOpportunityScore(input);
    const risk = calculateRiskScore({ ...input, currentPrice: 100 });
    const signal = calculateSignalStrength(input);
    expect(opportunity.value).toBe(100);
    expect(risk.value).toBe(15);
    expect(signal.value).toBe(100);
    expect(opportunity.factors.reduce((sum, factor) => sum + factor.points, 0)).toBe(100);
    expect(opportunity.factors.every((factor) => factor.description.length > 0)).toBe(true);
  });

  it("withholds opportunity scoring when required multi-timeframe evidence is absent", () => {
    const score = calculateOpportunityScore(scoringInput({ multiTimeframe: missing("Only one timeframe is available.") }));
    expect(score.value).toBeNull();
    expect(score.unavailableReason).toMatch(/requires structure, momentum, volatility/i);
  });

  it("raises modeled risk and caps signal strength when data is stale or timeframes conflict", () => {
    const conflict = scoringInput({
      isStale: true,
      multiTimeframe: available({
        alignment: "TREND_CONFLICT",
        bullishFrames: ["1h"],
        bearishFrames: ["4h"],
        neutralFrames: [],
        unavailableFrames: [],
        availableCount: 2,
        evidence: [],
      }),
    });
    const risk = calculateRiskScore({ ...conflict, currentPrice: 108.5 });
    const signal = calculateSignalStrength(conflict);
    expect(risk.value).not.toBeNull();
    expect(risk.value!).toBeGreaterThan(50);
    expect(signal.value).not.toBeNull();
    expect(signal.value!).toBeLessThan(80);
  });
});

describe("Nexus explanation layer", () => {
  it("renders only structured evidence and avoids certainty or return promises", () => {
    const input = scoringInput();
    const opportunityScore = calculateOpportunityScore(input);
    const riskScore = calculateRiskScore({ ...input, currentPrice: 100 });
    const signalStrength = calculateSignalStrength(input);
    const regime = classifyMarketRegime({ timeframe: "4h", structure: input.structure, volatility: input.volatility, momentum: input.momentum });
    const explanation = createNexusExplanation({
      assetName: "Bitcoin",
      symbol: "BTC",
      primaryTimeframe: "4h",
      quality: "LIVE",
      regime,
      structure: input.structure,
      momentum: input.momentum,
      volatility: input.volatility,
      volume: input.volume,
      multiTimeframe: input.multiTimeframe,
      opportunityScore,
      riskScore,
      signalStrength,
    });
    const text = JSON.stringify(explanation);
    expect(explanation.evidence.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/guaranteed|will rise|will fall|win rate|promise of profit/i);
    expect(explanation.disclaimer).toMatch(/not personalized financial advice/i);
  });

  it("explains missing evidence instead of generating a confident analysis", () => {
    const input = scoringInput({ multiTimeframe: missing("Only one timeframe is available.") });
    const opportunityScore = calculateOpportunityScore(input);
    const riskScore = calculateRiskScore({ ...input, currentPrice: 100 });
    const signalStrength = calculateSignalStrength(input);
    const regime = classifyMarketRegime({ timeframe: "4h", structure: input.structure, volatility: input.volatility, momentum: input.momentum });
    const explanation = createNexusExplanation({
      assetName: "Bitcoin",
      symbol: "BTC",
      primaryTimeframe: "4h",
      quality: "UNAVAILABLE",
      regime,
      structure: input.structure,
      momentum: input.momentum,
      volatility: input.volatility,
      volume: input.volume,
      multiTimeframe: input.multiTimeframe,
      opportunityScore,
      riskScore,
      signalStrength,
    });
    expect(explanation.summary).toMatch(/cannot produce a scored market analysis/i);
    expect(explanation.evidence).toEqual([]);
    expect(explanation.risks.join(" ")).toMatch(/timeframe/i);
  });
});
