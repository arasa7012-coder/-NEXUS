import { describe, expect, it } from "vitest";
import {
  calculateAtr,
  calculateBollingerBands,
  calculateEma,
  calculateIndicatorSnapshot,
  calculateMacd,
  calculateRsi,
  calculateSma,
} from "./indicators";
import type { AnalysisCandle } from "./types";

function series(values: number[], range: number = 1): AnalysisCandle[] {
  return values.map((close, index) => ({
    openTime: index * 60_000,
    closeTime: (index + 1) * 60_000 - 1,
    open: close,
    high: close + range,
    low: Math.max(0.0001, close - range),
    close,
    volume: 100 + index,
    quoteVolumeUsd: close * (100 + index),
    tradeCount: 10 + index,
  }));
}

describe("deterministic technical indicators", () => {
  it("calculates SMA and seeded EMA from the requested complete period", () => {
    const candles = series([1, 2, 3, 4, 5], 0.1);
    expect(calculateSma(candles, 3)).toMatchObject({ status: "AVAILABLE", value: 4 });
    expect(calculateEma(candles, 3)).toMatchObject({ status: "AVAILABLE", value: 4 });
  });

  it("returns unavailable metrics instead of neutral fallback values for short input", () => {
    const candles = series([100, 101, 102]);
    expect(calculateSma(candles, 20)).toMatchObject({ status: "UNAVAILABLE", value: null, sampleCount: 3 });
    expect(calculateRsi(candles, 14)).toMatchObject({ status: "UNAVAILABLE", value: null, sampleCount: 3 });
    expect(calculateAtr(candles, 14)).toMatchObject({ status: "UNAVAILABLE", value: null, sampleCount: 3 });
  });

  it("calculates Wilder RSI for rising, falling, and flat series", () => {
    expect(calculateRsi(series(Array.from({ length: 20 }, (_, index) => 100 + index)))).toMatchObject({ value: 100 });
    expect(calculateRsi(series(Array.from({ length: 20 }, (_, index) => 120 - index)))).toMatchObject({ value: 0 });
    expect(calculateRsi(series(Array.from({ length: 20 }, () => 100)))).toMatchObject({ value: 50 });
  });

  it("calculates positive MACD evidence for a sustained rising series", () => {
    const result = calculateMacd(series(Array.from({ length: 60 }, (_, index) => 100 + index)));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value.macd).toBeGreaterThan(0);
      expect(result.value.signal).toBeGreaterThan(0);
      expect(Number.isFinite(result.value.histogram)).toBe(true);
    }
  });

  it("calculates Bollinger width from the final requested window", () => {
    const result = calculateBollingerBands(series(Array.from({ length: 20 }, (_, index) => index + 1), 0.1), 20, 2);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value.middle).toBe(10.5);
      expect(result.value.upper).toBeCloseTo(22.03256259, 7);
      expect(result.value.lower).toBeCloseTo(-1.03256259, 7);
      expect(result.value.widthPercent).toBeCloseTo(219.6679, 4);
    }
  });

  it("calculates Wilder ATR and percent of the latest close", () => {
    const candles = series(Array.from({ length: 20 }, (_, index) => 100 + index), 1);
    const result = calculateAtr(candles, 14);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value.value).toBe(2);
      expect(result.value.percent).toBeCloseTo(1.6807, 4);
    }
  });

  it("builds a complete snapshot while preserving each metric's availability", () => {
    const snapshot = calculateIndicatorSnapshot(series(Array.from({ length: 60 }, (_, index) => 100 + index * 0.5)));
    expect(Object.values(snapshot).every((metric) => metric.status === "AVAILABLE")).toBe(true);
  });
});
