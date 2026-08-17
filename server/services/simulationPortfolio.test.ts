import { describe, expect, it } from "vitest";
import { SimulationPortfolioError, calculateSimulationOrder, normalizeSimulationSymbol } from "./simulationPortfolio";

describe("simulation portfolio order math", () => {
  it("uses a server-valued buy to update virtual cash and weighted average cost", () => {
    const result = calculateSimulationOrder({
      side: "buy",
      quantity: 0.5,
      priceUsd: 64_000,
      cashBalanceUsd: 100_000,
      currentPosition: { quantity: 0.5, averageCostUsd: 60_000 },
    });

    expect(result.notionalUsd).toBe(32_000);
    expect(result.nextCashBalanceUsd).toBe(68_000);
    expect(result.nextPosition).toEqual({ quantity: 1, averageCostUsd: 62_000 });
  });

  it("rejects a buy that exceeds the clearly virtual cash balance", () => {
    expect(() => calculateSimulationOrder({
      side: "buy",
      quantity: 2,
      priceUsd: 60_000,
      cashBalanceUsd: 100_000,
      currentPosition: null,
    })).toThrow(/exceeds the available virtual cash/i);
  });

  it("removes a fully sold virtual position and rejects overselling", () => {
    const sold = calculateSimulationOrder({
      side: "sell",
      quantity: 1,
      priceUsd: 65_000,
      cashBalanceUsd: 10_000,
      currentPosition: { quantity: 1, averageCostUsd: 60_000 },
    });
    expect(sold.nextPosition).toBeNull();
    expect(sold.nextCashBalanceUsd).toBe(75_000);

    expect(() => calculateSimulationOrder({
      side: "sell",
      quantity: 1.1,
      priceUsd: 65_000,
      cashBalanceUsd: 10_000,
      currentPosition: { quantity: 1, averageCostUsd: 60_000 },
    })).toThrow(SimulationPortfolioError);
  });

  it("normalizes supported symbols and rejects unsafe identifiers", () => {
    expect(normalizeSimulationSymbol(" btc ")).toBe("BTC");
    expect(() => normalizeSimulationSymbol("btc/usd")).toThrow(SimulationPortfolioError);
  });
});
