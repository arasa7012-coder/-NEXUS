import { describe, expect, it } from "vitest";
import { buildAnalysisMetadata, deriveDataQuality, normalizeCandles } from "./normalization";

function candle(overrides: Record<string, unknown> = {}) {
  return {
    openTime: 1_000,
    closeTime: 1_999,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 12,
    quoteVolumeUsd: 1_260,
    tradeCount: 20,
    ...overrides,
  };
}

describe("intelligence candle normalization", () => {
  it("sorts valid candles and rejects duplicate open times without synthesizing replacements", () => {
    const result = normalizeCandles([
      candle({ openTime: 2_000, closeTime: 2_999 }),
      candle(),
      candle({ openTime: 1_000, closeTime: 1_999, close: 106 }),
    ]);

    expect(result.candles.map((item) => item.openTime)).toEqual([1_000, 2_000]);
    expect(result.candles[0]?.close).toBe(105);
    expect(result.rejected).toEqual([{ index: 2, reason: "Duplicate candle open time." }]);
  });

  it("rejects non-finite, negative-volume, and inconsistent OHLC candles", () => {
    const result = normalizeCandles([
      candle({ close: Number.NaN }),
      candle({ openTime: 2_000, closeTime: 2_999, volume: -1 }),
      candle({ openTime: 3_000, closeTime: 3_999, high: 99 }),
    ]);

    expect(result.candles).toHaveLength(0);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      "Candle contains a non-finite numeric field.",
      "Volume and trade-count fields cannot be negative.",
      "High/low values are inconsistent with the candle body.",
    ]);
  });
});

describe("intelligence data quality", () => {
  it("prioritizes errors and insufficient evidence before stale/live classification", () => {
    expect(deriveDataQuality({ hasError: true, isStale: false, sampleCount: 100, minimumSamples: 20 })).toBe("ERROR");
    expect(deriveDataQuality({ isStale: true, sampleCount: 10, minimumSamples: 20 })).toBe("UNAVAILABLE");
    expect(deriveDataQuality({ isStale: true, sampleCount: 20, minimumSamples: 20 })).toBe("STALE");
    expect(deriveDataQuality({ isStale: false, sampleCount: 20, minimumSamples: 20 })).toBe("LIVE");
  });

  it("preserves source and timestamp provenance and records sample limitations once", () => {
    const metadata = buildAnalysisMetadata({
      source: "coinbase",
      providerUpdatedAt: 10_000,
      providerTimestampOrigin: "provider",
      cachedAt: 11_000,
      sampleCount: 12,
      minimumSamples: 20,
      isStale: false,
      unavailableReasons: ["The requested timeframe is not supported."],
    });

    expect(metadata.quality).toBe("UNAVAILABLE");
    expect(metadata.source).toBe("coinbase");
    expect(metadata.providerUpdatedAt).toBe(10_000);
    expect(metadata.unavailableReasons).toEqual([
      "The requested timeframe is not supported.",
      "Requires at least 20 valid samples; received 12.",
    ]);
  });
});
