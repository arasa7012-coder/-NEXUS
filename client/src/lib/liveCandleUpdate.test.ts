import { describe, expect, it } from "vitest";
import { mergeIncrementalOhlcv } from "@shared/liveCandleUpdate";

const hour = 3_600_000;
const candle = (openTime: number, close: number) => ({ openTime, closeTime: openTime + hour - 1, open: close - 1, high: close + 2, low: close - 2, close, volume: 10 });

describe("incremental verified OHLCV merge", () => {
  it("replaces only the active tail candle and preserves historical references", () => {
    const history = [candle(0, 100), candle(hour, 101)];
    const updated = mergeIncrementalOhlcv(history, [candle(hour, 103)], hour);

    expect(updated.transition).toBe("ACTIVE_REPLACED");
    expect(updated.changed).toBe(true);
    expect(updated.candles).toHaveLength(2);
    expect(updated.candles[0]).toBe(history[0]);
    expect(updated.candles[1]?.close).toBe(103);
  });

  it("keeps the existing array identity when a verified update is unchanged", () => {
    const history = [candle(0, 100), candle(hour, 101)];
    const unchanged = mergeIncrementalOhlcv(history, [candle(hour, 101)], hour);

    expect(unchanged.changed).toBe(false);
    expect(unchanged.transition).toBe("UNCHANGED");
    expect(unchanged.candles).toBe(history);
  });

  it("rejects historical mutation and invalid OHLCV instead of rewriting the chart", () => {
    const history = [candle(0, 100), candle(hour, 101)];
    const historicalMutation = mergeIncrementalOhlcv(history, [candle(0, 102)], hour);
    const invalid = mergeIncrementalOhlcv(history, [{ ...candle(2 * hour, 102), low: 103 }], hour);

    expect(historicalMutation.conflict).toMatch(/finalized candle/i);
    expect(historicalMutation.candles).toBe(history);
    expect(invalid.conflict).toMatch(/not valid OHLCV/i);
    expect(invalid.candles).toBe(history);
  });

  it("appends a later provider candle but leaves a deterministic gap explicit", () => {
    const history = [candle(0, 100)];
    const appended = mergeIncrementalOhlcv(history, [candle(2 * hour, 102)], hour);

    expect(appended.transition).toBe("APPENDED");
    expect(appended.candles).toHaveLength(2);
    expect(appended.gaps).toEqual([{ afterOpenTime: 0, beforeOpenTime: 2 * hour, expectedOpenTime: hour }]);
  });
});
