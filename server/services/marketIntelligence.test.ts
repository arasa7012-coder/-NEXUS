import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLiveCandlesMock, getLiveCandlesFromSourceMock, getMarketDirectoryMock } = vi.hoisted(() => ({
  getLiveCandlesMock: vi.fn(),
  getLiveCandlesFromSourceMock: vi.fn(),
  getMarketDirectoryMock: vi.fn(),
}));

vi.mock("./marketData", async () => {
  const actual = await vi.importActual<typeof import("./marketData")>("./marketData");
  return {
    ...actual,
    getLiveCandles: getLiveCandlesMock,
    getLiveCandlesFromSource: getLiveCandlesFromSourceMock,
    getMarketDirectory: getMarketDirectoryMock,
  };
});

import { getAssetIntelligence, getLiveFrameIntelligence, getOpportunityScanner } from "./marketIntelligence";

function liveCandles(symbol: string, interval: string) {
  const cycle = [0, 2, 5, 2, -1];
  const candles = Array.from({ length: 160 }, (_, index) => {
    const close = 100 + Math.floor(index / cycle.length) * 3 + cycle[index % cycle.length]!;
    return {
      source: "binance" as const,
      symbol: `${symbol}USDT`,
      interval,
      openTime: index * 60_000,
      closeTime: (index + 1) * 60_000 - 1,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + index * 2,
      quoteVolumeUsd: close * (100 + index * 2),
      tradeCount: 20 + index,
    };
  });
  return {
    symbol: `${symbol}USDT`,
    baseSymbol: symbol,
    interval,
    candles,
    cachedAt: 100_000,
    isStale: false,
    source: "binance" as const,
  };
}

function marketAsset(id: string, name: string, symbol: string) {
  return {
    id,
    name,
    symbol,
    imageUrl: null,
    marketCapRank: 1,
    priceUsd: 100,
    priceChange24hPercent: 2,
    volume24hUsd: 1_000_000,
    marketCapUsd: 10_000_000,
    high24hUsd: 105,
    low24hUsd: 95,
    circulatingSupply: 100_000,
    totalSupply: 100_000,
    maxSupply: 100_000,
    providerUpdatedAt: 99_000,
    providerTimestampOrigin: "provider" as const,
    sparkline7d: [],
  };
}

describe("market intelligence service", () => {
  beforeEach(() => {
    getLiveCandlesMock.mockReset();
    getLiveCandlesFromSourceMock.mockReset();
    getMarketDirectoryMock.mockReset();
    getLiveCandlesMock.mockImplementation(({ symbol, interval }: { symbol: string; interval: string }) => Promise.resolve(liveCandles(symbol, interval)));
    getLiveCandlesFromSourceMock.mockImplementation(({ symbol, interval }: { symbol: string; interval: string }) => Promise.resolve(liveCandles(symbol, interval)));
  });

  it("deduplicates identical in-flight asset intelligence requests and reuses normalized live candles", async () => {
    const input = { assetId: "chainlink", timeframes: ["1h", "4h"] as const, preferredTimeframe: "4h" as const };
    const [left, right] = await Promise.all([
      getAssetIntelligence({ ...input, timeframes: [...input.timeframes] }),
      getAssetIntelligence({ ...input, timeframes: [...input.timeframes] }),
    ]);
    expect(getLiveCandlesMock).toHaveBeenCalledTimes(2);
    expect(left).toEqual(right);
    expect(left.primaryTimeframe).toBe("4h");
    expect(left.opportunityScore.value).not.toBeNull();
  });

  it("reuses cached timeframe evidence when the preferred analysis frame changes", async () => {
    const timeframes = ["1h", "4h"] as const;
    const first = await getAssetIntelligence({ assetId: "cardano", timeframes: [...timeframes], preferredTimeframe: "1h" });
    const second = await getAssetIntelligence({ assetId: "cardano", timeframes: [...timeframes], preferredTimeframe: "4h" });

    expect(getLiveCandlesMock).toHaveBeenCalledTimes(2);
    expect(first.primaryTimeframe).toBe("1h");
    expect(second.primaryTimeframe).toBe("4h");
  });

  it("omits an asset whose required exchange evidence is unavailable instead of ranking it", async () => {
    getMarketDirectoryMock.mockResolvedValue({
      assets: [marketAsset("bitcoin", "Bitcoin", "BTC"), marketAsset("ethereum", "Ethereum", "ETH")],
      page: 1,
      perPage: 10,
      hasMore: false,
      cachedAt: 100_000,
      isStale: false,
      source: "coingecko" as const,
    });
    getLiveCandlesMock.mockImplementation(({ symbol, interval }: { symbol: string; interval: string }) => {
      if (symbol === "ETH") return Promise.reject(new Error("Public exchange candles unavailable."));
      return Promise.resolve(liveCandles(symbol, interval));
    });

    const result = await getOpportunityScanner({ assetIds: ["bitcoin", "ethereum"], timeframe: "4h", limit: 2 });
    expect(result.rows.map((row) => row.assetId)).toEqual(["bitcoin"]);
    expect(result.omitted).toEqual([{ assetId: "ethereum", reason: "Required scoring evidence is unavailable." }]);
  });

  it("builds a live analytical frame only from the explicit provider and timeframe", async () => {
    const result = await getLiveFrameIntelligence({ assetId: "ripple", timeframe: "15m", source: "binance" });

    expect(getLiveCandlesFromSourceMock).toHaveBeenCalledWith(expect.objectContaining({ symbol: "XRP", interval: "15m", source: "binance", cacheTtlMs: 5_000 }));
    expect(result.source).toBe("binance");
    expect(result.intelligence.primaryTimeframe).toBe("15m");
    expect(result.intelligence.timeframes[0]?.metadata.sampleCount).toBe(160);
  });
});
