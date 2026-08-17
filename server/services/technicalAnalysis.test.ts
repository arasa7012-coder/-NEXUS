import { describe, it, expect } from "vitest";
import {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateEMA,
} from "./technicalAnalysis";

describe("Technical Analysis Services", () => {
  const mockCandles = [
    { timestamp: 1, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
    { timestamp: 2, open: 102, high: 108, low: 100, close: 106, volume: 1200 },
    { timestamp: 3, open: 106, high: 110, low: 104, close: 108, volume: 1100 },
    { timestamp: 4, open: 108, high: 112, low: 106, close: 110, volume: 1300 },
    { timestamp: 5, open: 110, high: 115, low: 108, close: 112, volume: 1400 },
    { timestamp: 6, open: 112, high: 118, low: 110, close: 115, volume: 1500 },
    { timestamp: 7, open: 115, high: 120, low: 113, close: 118, volume: 1600 },
    { timestamp: 8, open: 118, high: 122, low: 116, close: 120, volume: 1700 },
    { timestamp: 9, open: 120, high: 125, low: 118, close: 122, volume: 1800 },
    { timestamp: 10, open: 122, high: 128, low: 120, close: 125, volume: 1900 },
  ];

  describe("RSI Calculation", () => {
    it("should calculate RSI correctly", () => {
      const rsi = calculateRSI(mockCandles.map((c) => c.close), 14);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it("should return 50 for flat prices", () => {
      const flatPrices = Array(15).fill(100);
      const rsi = calculateRSI(flatPrices, 14);
      expect(rsi).toBe(50);
    });

    it("returns a neutral value when the series has insufficient usable prices", () => {
      expect(calculateRSI([], 14)).toBe(50);
      expect(calculateRSI(mockCandles.slice(0, 6), 14)).toBe(50);
    });
  });

  describe("MACD Calculation", () => {
    it("should calculate MACD correctly", () => {
      const macd = calculateMACD(mockCandles.map((c) => c.close));
      expect(macd).toHaveProperty("macd");
      expect(macd).toHaveProperty("signal");
      expect(macd).toHaveProperty("histogram");
    });

    it("should have valid MACD values", () => {
      const macd = calculateMACD(mockCandles.map((c) => c.close));
      expect(typeof macd.macd).toBe("number");
      expect(typeof macd.signal).toBe("number");
      expect(typeof macd.histogram).toBe("number");
    });
  });

  describe("Bollinger Bands Calculation", () => {
    it("should calculate Bollinger Bands correctly", () => {
      const bb = calculateBollingerBands(mockCandles.map((c) => c.close), 20, 2);
      expect(bb).toHaveProperty("upper");
      expect(bb).toHaveProperty("middle");
      expect(bb).toHaveProperty("lower");
    });

    it("should have upper > middle > lower", () => {
      const bb = calculateBollingerBands(mockCandles.map((c) => c.close), 20, 2);
      expect(bb.upper).toBeGreaterThan(bb.middle);
      expect(bb.middle).toBeGreaterThan(bb.lower);
    });

    it("uses available prices when the requested window exceeds the series length", () => {
      const bb = calculateBollingerBands(mockCandles, 20, 2);
      expect(bb.upper).toBeGreaterThan(bb.lower);
      expect(bb.middle).toBeGreaterThan(0);
    });
  });

  describe("EMA Calculation", () => {
    it("should calculate EMA correctly", () => {
      const ema = calculateEMA(mockCandles.map((c) => c.close), 20);
      expect(typeof ema).toBe("number");
      expect(ema).toBeGreaterThan(0);
    });

    it("should return average for flat prices", () => {
      const flatPrices = Array(20).fill(100);
      const ema = calculateEMA(flatPrices, 20);
      expect(ema).toBeCloseTo(100, 1);
    });

    it("supports candle arrays, close-price arrays, and empty input", () => {
      expect(calculateEMA(mockCandles, 20)).toBe(calculateEMA(mockCandles.map((c) => c.close), 20));
      expect(calculateEMA([], 20)).toBe(0);
    });
  });
});
