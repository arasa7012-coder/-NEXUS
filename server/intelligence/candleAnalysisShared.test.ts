import { describe, expect, it } from "vitest";
import { calculateAtrSeries, calculateSmaSeries, classifyCandleEvidence } from "../../shared/candleAnalysis";

const candles = [
  { open: 10, high: 12, low: 9, close: 11, volume: 1 },
  { open: 11, high: 14, low: 10, close: 13, volume: 1 },
  { open: 13, high: 15, low: 12, close: 14, volume: 1 },
  { open: 14, high: 16, low: 13, close: 15, volume: 1 },
];
describe("shared chart analysis", () => {
  it("calculates reproducible SMA values with explicit unavailable leading candles", () => { expect(calculateSmaSeries(candles, 3)).toEqual([null, null, 12.66666667, 14]); });
  it("calculates Wilder ATR only after the necessary previous close and period", () => { expect(calculateAtrSeries(candles, 2)).toEqual([null, null, 3.5, 3.25]); });
  it("classifies observable candle evidence without a predictive claim", () => { const doji = classifyCandleEvidence({ open: 10, high: 12, low: 8, close: 10.2 }); expect(doji.pattern).toBe("DOJI"); expect(doji.bodySize).toBe(0.2); expect(classifyCandleEvidence({ open: 10, high: 12, low: 9, close: 11 }).direction).toBe("BULLISH"); });
});
