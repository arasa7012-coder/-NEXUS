import { describe, expect, it } from "vitest";
import { analyzeMomentum } from "./momentum";
import { analyzeVolatility } from "./volatility";
import { analyzeVolume } from "./volume";
import type { AnalysisCandle } from "./types";

function candles(values: number[], options?: { range?: number; volumes?: number[] }): AnalysisCandle[] {
  const range = options?.range ?? 1;
  return values.map((close, index) => ({
    openTime: index * 60_000,
    closeTime: (index + 1) * 60_000 - 1,
    open: close,
    high: close + range,
    low: Math.max(0.0001, close - range),
    close,
    volume: options?.volumes?.[index] ?? 100,
    quoteVolumeUsd: close * (options?.volumes?.[index] ?? 100),
    tradeCount: 20,
  }));
}

describe("momentum analysis", () => {
  it("classifies aligned rising and falling evidence without predictive claims", () => {
    const rising = analyzeMomentum(candles(Array.from({ length: 60 }, (_, index) => 100 + index)), "1h");
    const falling = analyzeMomentum(candles(Array.from({ length: 60 }, (_, index) => 200 - index)), "1h");
    expect(rising.status).toBe("AVAILABLE");
    expect(falling.status).toBe("AVAILABLE");
    if (rising.status === "AVAILABLE" && falling.status === "AVAILABLE") {
      expect(rising.value.direction).toBe("BULLISH");
      expect(falling.value.direction).toBe("BEARISH");
      expect(rising.value.evidence.every((item) => !/guarantee|will rise|profit/i.test(item.description))).toBe(true);
    }
  });

  it("returns unavailable when fewer than eleven valid candles exist", () => {
    expect(analyzeMomentum(candles([1, 2, 3]), "5m")).toMatchObject({ status: "UNAVAILABLE", value: null });
  });
});

describe("volatility analysis", () => {
  it("separates high and low current range environments with transparent metrics", () => {
    const high = analyzeVolatility(candles(Array.from({ length: 40 }, (_, index) => 100 + index), { range: 8 }), "4h");
    const low = analyzeVolatility(candles(Array.from({ length: 40 }, () => 100), { range: 0.2 }), "4h");
    expect(high.status).toBe("AVAILABLE");
    expect(low.status).toBe("AVAILABLE");
    if (high.status === "AVAILABLE" && low.status === "AVAILABLE") {
      expect(high.value.level).toBe("HIGH");
      expect(low.value.level).toBe("LOW");
      expect(high.value.atrPercent).toBeGreaterThan(low.value.atrPercent ?? 0);
    }
  });
});

describe("volume analysis", () => {
  it("detects increasing real candle volume and reports relative volume", () => {
    const volumes = [...Array(15).fill(100), 150, 160, 170, 180, 190];
    const result = analyzeVolume(candles(Array.from({ length: 20 }, (_, index) => 100 + index), { volumes }), "15m");
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value.trend).toBe("INCREASING");
      expect(result.value.relativeVolume).toBe(1.7);
    }
  });

  it("does not create volume evidence when the historical baseline is absent", () => {
    const result = analyzeVolume(candles(Array.from({ length: 20 }, () => 100), { volumes: Array(20).fill(0) }), "15m");
    expect(result).toMatchObject({ status: "UNAVAILABLE", value: null });
  });
});
