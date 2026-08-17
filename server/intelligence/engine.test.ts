import { describe, expect, it } from "vitest";
import { composeAssetIntelligence, type TimeframeAnalysisInput } from "./engine";
import type { AnalysisCandle, IntelligenceTimeframe } from "./types";

function trendCandles(count: number, offset: number = 0): AnalysisCandle[] {
  const cycle = [0, 2, 5, 2, -1];
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + offset + Math.floor(index / cycle.length) * 3 + cycle[index % cycle.length]!;
    return {
      openTime: index * 60_000,
      closeTime: (index + 1) * 60_000 - 1,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + index * 2,
      quoteVolumeUsd: close * (100 + index * 2),
      tradeCount: 20 + index,
    };
  });
}

function frame(timeframe: IntelligenceTimeframe, options: Partial<TimeframeAnalysisInput> = {}): TimeframeAnalysisInput {
  return {
    timeframe,
    candles: trendCandles(80),
    source: "coinbase",
    cachedAt: 100_000,
    providerUpdatedAt: 99_000,
    providerTimestampOrigin: "provider",
    isStale: false,
    ...options,
  };
}

describe("composed asset intelligence", () => {
  it("selects 4h as the primary frame and exposes traceable scores and explanation", () => {
    const result = composeAssetIntelligence({
      assetId: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      timeframes: [frame("15m"), frame("1h", { candles: trendCandles(80, 2) }), frame("4h", { candles: trendCandles(80, 4) })],
    });
    expect(result.primaryTimeframe).toBe("4h");
    expect(result.timeframes).toHaveLength(3);
    expect(result.multiTimeframe.status).toBe("AVAILABLE");
    expect(result.opportunityScore.value).not.toBeNull();
    expect(result.riskScore.value).not.toBeNull();
    expect(result.explanation.evidence.length).toBeGreaterThan(0);
  });

  it("withholds scored analysis when no frame meets the minimum evidence contract", () => {
    const result = composeAssetIntelligence({
      assetId: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      timeframes: [frame("1h", { candles: trendCandles(10) })],
    });
    expect(result.primaryTimeframe).toBeNull();
    expect(result.opportunityScore.value).toBeNull();
    expect(result.explanation.summary).toMatch(/cannot produce a scored market analysis/i);
  });

  it("reduces signal strength and discloses stale evidence", () => {
    const result = composeAssetIntelligence({
      assetId: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      timeframes: [frame("1h"), frame("4h", { isStale: true })],
    });
    expect(result.primaryTimeframe).toBe("4h");
    expect(result.signalStrength.value).not.toBeNull();
    expect(result.signalStrength.value!).toBeLessThanOrEqual(60);
    expect(result.explanation.risks.join(" ")).toMatch(/stale/i);
  });
});
