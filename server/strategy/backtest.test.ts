import { describe, expect, it, vi } from "vitest";

vi.mock("../intelligence/engine", () => ({
  composeAssetIntelligence: () => ({
    primaryTimeframe: "1h",
    timeframes: [{ timeframe: "1h", indicators: { atr14: { status: "AVAILABLE", value: { value: 2, percent: 2 } } }, structure: { status: "AVAILABLE", value: { support: [], resistance: [] } } }],
    opportunityScore: { value: 60 }, riskScore: { value: 15 }, signalStrength: { value: 65 }, regime: { status: "AVAILABLE", value: { regime: "RANGE_CONSOLIDATION" } }, multiTimeframe: { status: "AVAILABLE", value: { alignment: "BULLISH_ALIGNMENT" } },
  }),
}));
import { fingerprintHistoricalCandles, runDeterministicBacktest, validateHistoricalCandles } from "./backtest";
import type { BacktestRunInput, HistoricalCandle } from "./types";

function candles(): HistoricalCandle[] {
  return Array.from({ length: 74 }, (_, index) => {
    const base = index < 61 ? 100 : index === 61 ? 102 : index === 62 ? 102 : 101;
    const collision = index === 63;
    return { openTime: index * 3_600_000, closeTime: (index + 1) * 3_600_000 - 1, open: base, high: collision ? 106 : base + 0.4, low: collision ? 96 : base - 0.4, close: base, volume: 1_000 + index, quoteVolumeUsd: base * (1_000 + index), tradeCount: 10 + index };
  });
}

function input(overrides: Partial<BacktestRunInput["risk"]> = {}): BacktestRunInput {
  const historical = candles();
  return { symbol: "BTC", interval: "1h", source: "coinbase", datasetFingerprint: fingerprintHistoricalCandles({ symbol: "BTC", interval: "1h", source: "coinbase", candles: historical }), candles: historical, rules: { version: 1, entry: { type: "BREAKOUT", lookback: 2 }, exit: { type: "NONE" }, requestedQuantity: 1 }, risk: { initialEquityUsd: 100_000, riskPerTradePercent: 1, maxDailyLossPercent: 20, maxDailyDrawdownPercent: 30, maxOpenPositions: 1, maxPortfolioExposurePercent: 95, maxAssetExposurePercent: 95, stopMethod: "fixed", fixedStopPercent: 2, atrMultiplier: 2, structureBufferBps: 25, minimumRewardRisk: 1, consecutiveLossLimit: 5, cooldownMinutes: 30, feeBps: 10, slippageBps: 10, blockHighVolatility: false, ...overrides } };
}

describe("deterministic strategy backtest", () => {
  it("returns identical auditable output for identical stored candle inputs", () => {
    const first = runDeterministicBacktest(input());
    const second = runDeterministicBacktest(input());
    expect(first).toEqual(second);
    expect(first.simulation).toBe(true);
    expect(first.disclaimer).toMatch(/never submits an external order/i);
    expect(first.equityCurve.length).toBeGreaterThan(1);
  });

  it("rejects historical gaps instead of interpolating market data", () => {
    const broken = candles();
    broken[20] = { ...broken[20]!, openTime: broken[20]!.openTime + 1, closeTime: broken[20]!.closeTime + 1 };
    expect(() => validateHistoricalCandles(broken, "1h", 60)).toThrow(/gap|interval/i);
  });

  it("records a rejected decision when the existing risk exposure gate blocks an otherwise valid signal", () => {
    const result = runDeterministicBacktest(input({ maxPortfolioExposurePercent: 0 }));
    expect(result.trades.some((trade) => trade.decision === "REJECTED")).toBe(true);
    expect(result.trades.filter((trade) => trade.decision === "ACCEPTED")).toHaveLength(0);
  });

  it("uses the stored conservative stop-first collision policy when stop and target are both observed", () => {
    const result = runDeterministicBacktest(input());
    const closed = result.trades.find((trade) => trade.decision === "ACCEPTED" && trade.exitTime !== null);
    expect(closed, JSON.stringify(result.trades)).toBeDefined();
    expect(closed?.exitReason).toBe("STOP");
    expect(closed?.evidence).toMatchObject({ collisionPolicy: "STOP_FIRST" });
  });
});
