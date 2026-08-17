import { describe, expect, it } from "vitest";
import { analyzeMultiTimeframe } from "./multiTimeframe";
import { analyzeMarketStructure, clusterPriceLevels, detectSwingPoints } from "./structure";
import type { AnalysisCandle, TimeframeIntelligenceSummary } from "./types";

function wave(values: number[]): AnalysisCandle[] {
  return values.map((close, index) => ({
    openTime: index * 60_000,
    closeTime: (index + 1) * 60_000 - 1,
    open: close,
    high: close + 1,
    low: Math.max(0.0001, close - 1),
    close,
    volume: 100,
    quoteVolumeUsd: close * 100,
    tradeCount: 20,
  }));
}

function summary(overrides: Partial<TimeframeIntelligenceSummary>): TimeframeIntelligenceSummary {
  return {
    timeframe: "1h",
    quality: "LIVE",
    trend: "UPTREND",
    momentum: "BULLISH",
    volatility: "NORMAL",
    sampleCount: 120,
    isStale: false,
    unavailableReasons: [],
    ...overrides,
  };
}

describe("market structure evidence", () => {
  it("detects confirmed local swings without using the unfinished edge candles", () => {
    const swings = detectSwingPoints(wave([10, 12, 15, 12, 10, 13, 16, 13, 11]), 1);
    expect(swings.filter((point) => point.kind === "HIGH").map((point) => point.price)).toEqual([16, 17]);
    expect(swings.filter((point) => point.kind === "LOW").map((point) => point.price)).toEqual([9]);
  });

  it("requires multiple nearby swing touches before exposing support or resistance", () => {
    const levels = clusterPriceLevels([
      { index: 1, occurredAt: 1, price: 100, kind: "LOW" },
      { index: 2, occurredAt: 2, price: 100.5, kind: "LOW" },
      { index: 3, occurredAt: 3, price: 112, kind: "HIGH" },
    ], 105, 2);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ kind: "SUPPORT", touches: 2, price: 100.25 });
  });

  it("classifies a confirmed higher-high and higher-low sequence as an uptrend", () => {
    const pattern = [
      100, 102, 105, 102, 99, 103, 108, 104, 101, 106,
      111, 107, 104, 109, 114, 110, 107, 112, 117, 113,
      110, 115, 120, 116, 113, 118, 123, 119, 116, 121,
      126, 122, 119, 124, 129, 126, 123, 127, 131, 130,
    ];
    const result = analyzeMarketStructure(wave(pattern), "4h");
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value.trend).toBe("UPTREND");
      expect(result.value.higherHighs).toBeGreaterThan(0);
      expect(result.value.higherLows).toBeGreaterThan(0);
    }
  });

  it("marks a compressed flat range as consolidation and withholds short-series structure", () => {
    const flat = analyzeMarketStructure(wave(Array.from({ length: 40 }, (_, index) => 100 + (index % 3) * 0.1)), "1h");
    const short = analyzeMarketStructure(wave([100, 101, 100]), "1h");
    expect(short).toMatchObject({ status: "UNAVAILABLE", value: null });
    expect(flat.status).toBe("AVAILABLE");
    if (flat.status === "AVAILABLE") {
      expect(flat.value.trend).toBe("RANGE");
      expect(flat.value.event).toBe("CONSOLIDATION");
    }
  });
});

describe("multi-timeframe alignment", () => {
  it("detects bullish alignment from available frames and preserves unavailable frames", () => {
    const result = analyzeMultiTimeframe([
      summary({ timeframe: "5m" }),
      summary({ timeframe: "15m" }),
      summary({ timeframe: "1h", trend: "RANGE", momentum: "NEUTRAL" }),
      summary({ timeframe: "4h", quality: "UNAVAILABLE", trend: "UNAVAILABLE", momentum: "NEUTRAL" }),
    ]);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value.alignment).toBe("BULLISH_ALIGNMENT");
      expect(result.value.unavailableFrames).toEqual(["4h"]);
    }
  });

  it("distinguishes directional conflict from mixed neutral evidence", () => {
    const conflict = analyzeMultiTimeframe([
      summary({ timeframe: "1h" }),
      summary({ timeframe: "4h", trend: "DOWNTREND", momentum: "BEARISH" }),
    ]);
    const mixed = analyzeMultiTimeframe([
      summary({ timeframe: "1h", trend: "RANGE", momentum: "NEUTRAL" }),
      summary({ timeframe: "4h", trend: "MIXED", momentum: "MIXED" }),
    ]);
    expect(conflict.status === "AVAILABLE" && conflict.value.alignment).toBe("TREND_CONFLICT");
    expect(mixed.status === "AVAILABLE" && mixed.value.alignment).toBe("MIXED_SIGNALS");
  });

  it("returns unavailable rather than synthesizing alignment from one frame", () => {
    expect(analyzeMultiTimeframe([summary({ timeframe: "1h" })])).toMatchObject({ status: "UNAVAILABLE", value: null });
  });
});
