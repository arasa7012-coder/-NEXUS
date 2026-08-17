import { describe, expect, it } from "vitest";
import { clampSavedChartView } from "./chartViewRange";

const candles = [{ openTime: 100 }, { openTime: 200 }, { openTime: 300 }, { openTime: 400 }];
describe("clampSavedChartView", () => {
  it("restores a saved range inside verified coverage unchanged", () => expect(clampSavedChartView({ startTime: 100, endTime: 400, visibleCandles: 4 }, candles, 300)).toEqual({ viewport: { startTime: 100, endTime: 400, visibleCandles: 8 }, adjusted: true }));
  it("clamps a saved range outside verified coverage and reports why", () => expect(clampSavedChartView({ startTime: 1, endTime: 900, visibleCandles: 300 }, candles, 75)).toEqual({ viewport: { startTime: 100, endTime: 400, visibleCandles: 8 }, adjusted: true }));
});
