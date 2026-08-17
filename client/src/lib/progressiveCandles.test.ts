import { describe, expect, it } from "vitest";
import { mergeProgressiveCandles } from "./progressiveCandles";

const candle = (sequence: number, openTime: number) => ({ sequence, openTime, closeTime: openTime + 60_000, open: sequence, high: sequence + 2, low: sequence - 1, close: sequence + 1, volume: 1 });
describe("progressive historical candle merge", () => {
  it("preserves chronological pages and removes matching page-boundary duplicates", () => { const result = mergeProgressiveCandles([candle(3, 180_000), candle(4, 240_000)], [candle(1, 60_000), candle(2, 120_000), candle(3, 180_000)], 60_000); expect(result.conflict).toBeNull(); expect(result.candles.map((item) => item.sequence)).toEqual([1, 2, 3, 4]); expect(result.gaps).toEqual([]); });
  it("reports a missing interval instead of synthesizing a candle", () => { const result = mergeProgressiveCandles([candle(1, 60_000), candle(3, 180_000)], [], 60_000); expect(result.candles).toHaveLength(2); expect(result.gaps).toHaveLength(1); expect(result.gaps[0]?.expectedOpenTime).toBe(120_000); });
  it("rejects a conflicting duplicate timestamp without replacing the persisted evidence", () => { const conflict = { ...candle(1, 60_000), close: 99 }; const result = mergeProgressiveCandles([candle(1, 60_000)], [conflict], 60_000); expect(result.conflict).toContain("Conflicting duplicate"); expect(result.candles[0]?.close).toBe(2); });
});
