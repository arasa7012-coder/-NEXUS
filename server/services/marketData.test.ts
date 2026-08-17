import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./binanceApi", () => ({
  getTickerData: vi.fn(),
  getCandleData: vi.fn(),
  getHistoricalCandleData: vi.fn(),
  getOrderBook: vi.fn(),
  getRecentTrades: vi.fn(),
}));

vi.mock("./coinbaseApi", () => ({
  getCoinbaseTickerData: vi.fn(),
  getCoinbaseCandleData: vi.fn(),
  getCoinbaseHistoricalCandleData: vi.fn(),
  getCoinbaseOrderBook: vi.fn(),
  getCoinbaseRecentTrades: vi.fn(),
}));

import { getCandleData, getHistoricalCandleData, getOrderBook, getRecentTrades, getTickerData } from "./binanceApi";
import { getCoinbaseCandleData, getCoinbaseHistoricalCandleData, getCoinbaseOrderBook, getCoinbaseRecentTrades, getCoinbaseTickerData } from "./coinbaseApi";
import { getLiveActiveCandle, getLiveCandles, getLiveHistoricalCandlePage, getLiveOrderBook, getLiveQuote, getLiveTrades, MarketDataError, mapCoinGeckoMarket, mapExchangeCandle, mapExchangeQuote, mapExchangeTrade, mapOrderBookLevels, providerHistoryPageLimit, serializeMarketDataError } from "./marketData";

const mockGetTickerData = vi.mocked(getTickerData);
const mockGetCandleData = vi.mocked(getCandleData);
const mockGetHistoricalCandleData = vi.mocked(getHistoricalCandleData);
const mockGetOrderBook = vi.mocked(getOrderBook);
const mockGetRecentTrades = vi.mocked(getRecentTrades);
const mockGetCoinbaseTickerData = vi.mocked(getCoinbaseTickerData);
const mockGetCoinbaseCandleData = vi.mocked(getCoinbaseCandleData);
const mockGetCoinbaseHistoricalCandleData = vi.mocked(getCoinbaseHistoricalCandleData);
const mockGetCoinbaseOrderBook = vi.mocked(getCoinbaseOrderBook);
const mockGetCoinbaseRecentTrades = vi.mocked(getCoinbaseRecentTrades);

describe("CoinGecko market normalization", () => {
  it("maps provider fields into the stable live-market contract", () => {
    const market = mapCoinGeckoMarket({
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "btc",
      image: "https://cdn.example.test/bitcoin.png",
      market_cap_rank: 1,
      current_price: 62000.12,
      price_change_percentage_24h: -2.5,
      total_volume: 31_000_000_000,
      market_cap: 1_220_000_000_000,
      high_24h: 64000,
      low_24h: 61000,
      circulating_supply: 19_700_000,
      total_supply: 21_000_000,
      max_supply: 21_000_000,
      last_updated: "2026-07-28T09:30:00.000Z",
      sparkline_in_7d: { price: [60000, Number.NaN, 62000] },
    });

    expect(market).toMatchObject({
      id: "bitcoin",
      symbol: "BTC",
      priceUsd: 62000.12,
      marketCapRank: 1,
      marketCapUsd: 1_220_000_000_000,
      sparkline7d: [60000, 62000],
    });
    expect(market.providerUpdatedAt).toBe(Date.parse("2026-07-28T09:30:00.000Z"));
    expect(market.providerTimestampOrigin).toBe("provider");
  });

  it("labels a missing provider timestamp as fetched rather than provider-supplied", () => {
    const market = mapCoinGeckoMarket({ id: "unknown-time", name: "Unknown Time", symbol: "utc" });

    expect(market.providerTimestampOrigin).toBe("fetched");
    expect(Number.isFinite(market.providerUpdatedAt)).toBe(true);
  });
});

describe("Exchange market normalization", () => {
  it("maps quote, candle, depth, and trade data into stable live contracts", () => {
    const quote = mapExchangeQuote({ symbol: "BTCUSDT", price: 62000, priceChange: 1200, priceChangePercent: 1.97, volume: 100, quoteVolume: 6_200_000, highPrice: 63100, lowPrice: 60500, providerUpdatedAt: 900 }, "BTC");
    const candle = mapExchangeCandle({ symbol: "BTCUSDT", timeframe: "1h", openTime: 100, open: 61000, high: 63000, low: 60500, close: 62000, volume: 10, closeTime: 200, quoteAssetVolume: 620000, numberOfTrades: 42, takerBuyBaseAssetVolume: 5, takerBuyQuoteAssetVolume: 310000 }, "1h");
    const depth = mapOrderBookLevels([["62000", "0.25"], ["invalid", "0.1"]]);
    const trade = mapExchangeTrade({ id: 7, symbol: "BTCUSDT", price: 62010, quantity: 0.15, time: 300, isBuyerMaker: true });

    expect(quote).toMatchObject({ source: "binance", baseSymbol: "BTC", priceUsd: 62000, quoteVolume24hUsd: 6_200_000, providerUpdatedAt: 900, providerTimestampOrigin: "provider" });
    expect(candle).toMatchObject({ source: "binance", interval: "1h", close: 62000, tradeCount: 42, openTime: 100, closeTime: 200 });
    expect(depth).toEqual([{ priceUsd: 62000, quantity: 0.25, totalUsd: 15500 }]);
    expect(trade).toEqual({ id: 7, symbol: "BTCUSDT", priceUsd: 62010, quantity: 0.15, occurredAt: 300, side: "sell" });
  });

  it("derives a finite quote-volume fallback when an upstream ticker omits the field", () => {
    const quote = mapExchangeQuote({ symbol: "BTCUSDT", price: 62000, priceChange: 0, priceChangePercent: 0, volume: 10, quoteVolume: Number.NaN, highPrice: 62000, lowPrice: 62000 }, "BTC");

    expect(quote.quoteVolume24hUsd).toBe(620000);
    expect(Number.isFinite(quote.quoteVolume24hUsd)).toBe(true);
  });

  it("serializes rate-limit failures into retryable client metadata", () => {
    expect(serializeMarketDataError(new MarketDataError("RATE_LIMITED", "retry later", 15))).toEqual({ code: "RATE_LIMITED", message: "retry later", retryAfterSeconds: 15 });
  });
});

describe("Exchange quote resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    mockGetTickerData.mockReset();
    mockGetCandleData.mockReset();
    mockGetHistoricalCandleData.mockReset();
    mockGetOrderBook.mockReset();
    mockGetRecentTrades.mockReset();
    mockGetCoinbaseTickerData.mockReset();
    mockGetCoinbaseCandleData.mockReset();
    mockGetCoinbaseHistoricalCandleData.mockReset();
    mockGetCoinbaseOrderBook.mockReset();
    mockGetCoinbaseRecentTrades.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a marked stale quote when a refreshed provider request fails", async () => {
    mockGetTickerData.mockResolvedValueOnce({ symbol: "BTCUSDT", price: 62000, priceChange: 1000, priceChangePercent: 1.64, volume: 10, quoteVolume: 620000, highPrice: 63000, lowPrice: 61000 });
    const fresh = await getLiveQuote("BTC");

    vi.setSystemTime(new Date("2026-07-28T12:00:11.000Z"));
    mockGetTickerData.mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, headers: {} } });
    const stale = await getLiveQuote("BTC");

    expect(fresh.isStale).toBe(false);
    expect(stale).toMatchObject({ isStale: true, cachedAt: fresh.cachedAt });
    expect(stale.quote.priceUsd).toBe(62000);
  });

  it("normalizes a new rate-limit failure into retryable metadata", async () => {
    mockGetTickerData.mockRejectedValueOnce({ isAxiosError: true, response: { status: 429, headers: { "retry-after": "7" } } });

    await expect(getLiveQuote("ETH")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 7,
    });
  });

  it("retains marked stale candles, depth, and trades when their refreshes fail", async () => {
    mockGetCandleData.mockResolvedValueOnce([{ symbol: "SOLUSDT", timeframe: "1h", openTime: 100, open: 100, high: 110, low: 90, close: 105, volume: 20, closeTime: 200, quoteAssetVolume: 2100, numberOfTrades: 12, takerBuyBaseAssetVolume: 11, takerBuyQuoteAssetVolume: 1155 }]);
    mockGetOrderBook.mockResolvedValueOnce({ symbol: "BNBUSDT", bids: [["500", "2"]], asks: [["501", "1"]] });
    mockGetRecentTrades.mockResolvedValueOnce([{ id: 3, symbol: "XRPUSDT", price: 0.5, quantity: 200, time: 300, isBuyerMaker: false }]);

    const [freshCandles, freshDepth, freshTrades] = await Promise.all([
      getLiveCandles({ symbol: "SOL", interval: "1h", limit: 20 }),
      getLiveOrderBook({ symbol: "BNB", limit: 20 }),
      getLiveTrades({ symbol: "XRP", limit: 10 }),
    ]);

    vi.setSystemTime(new Date("2026-07-28T12:00:21.000Z"));
    const outage = { isAxiosError: true, response: { status: 503, headers: {} } };
    mockGetCandleData.mockRejectedValueOnce(outage);
    mockGetOrderBook.mockRejectedValueOnce(outage);
    mockGetRecentTrades.mockRejectedValueOnce(outage);

    const [staleCandles, staleDepth, staleTrades] = await Promise.all([
      getLiveCandles({ symbol: "SOL", interval: "1h", limit: 20 }),
      getLiveOrderBook({ symbol: "BNB", limit: 20 }),
      getLiveTrades({ symbol: "XRP", limit: 10 }),
    ]);

    expect(freshCandles.candles).toHaveLength(1);
    expect(freshDepth.bids[0]?.totalUsd).toBe(1000);
    expect(freshTrades.trades[0]?.side).toBe("buy");
    expect(staleCandles).toMatchObject({ isStale: true, cachedAt: freshCandles.cachedAt });
    expect(staleDepth).toMatchObject({ isStale: true, cachedAt: freshDepth.cachedAt });
    expect(staleTrades).toMatchObject({ isStale: true, cachedAt: freshTrades.cachedAt });
  });

  it("falls back to Coinbase for every feed after a regional primary-exchange restriction", async () => {
    const restriction = { isAxiosError: true, response: { status: 451, data: { msg: "Service unavailable from a restricted location" }, headers: {} } };
    mockGetTickerData.mockRejectedValueOnce(restriction);
    mockGetCandleData.mockRejectedValueOnce(restriction);
    mockGetOrderBook.mockRejectedValueOnce(restriction);
    mockGetRecentTrades.mockRejectedValueOnce(restriction);
    mockGetCoinbaseTickerData.mockResolvedValueOnce({ symbol: "ADA-USD", price: 0.5, priceChange: 0.02, priceChangePercent: 4.17, volume: 5000, quoteVolume: 2500, highPrice: 0.51, lowPrice: 0.47, providerUpdatedAt: 1_000 });
    mockGetCoinbaseCandleData.mockResolvedValueOnce([{ symbol: "ADA-USD", timeframe: "1h", openTime: 100, open: 0.48, high: 0.51, low: 0.47, close: 0.5, volume: 1000, closeTime: 200, quoteAssetVolume: 500, numberOfTrades: 0, takerBuyBaseAssetVolume: 0, takerBuyQuoteAssetVolume: 0 }]);
    mockGetCoinbaseOrderBook.mockResolvedValueOnce({ symbol: "ADA-USD", bids: [["0.499", "100"]], asks: [["0.501", "120"]] });
    mockGetCoinbaseRecentTrades.mockResolvedValueOnce([{ id: 9, symbol: "ADA-USD", price: 0.5, quantity: 50, time: 300, isBuyerMaker: false }]);

    const [quote, candles, depth, trades] = await Promise.all([
      getLiveQuote("ADA"),
      getLiveCandles({ symbol: "ADA", interval: "1h", limit: 20 }),
      getLiveOrderBook({ symbol: "ADA", limit: 20 }),
      getLiveTrades({ symbol: "ADA", limit: 10 }),
    ]);

    expect(quote.quote).toMatchObject({ source: "coinbase", symbol: "ADA-USD", quoteSymbol: "USD", providerUpdatedAt: 1_000, providerTimestampOrigin: "provider" });
    expect(candles).toMatchObject({ source: "coinbase", symbol: "ADA-USD" });
    expect(candles.candles[0]).toMatchObject({ source: "coinbase", openTime: 100, closeTime: 200 });
    expect(depth).toMatchObject({ source: "coinbase", symbol: "ADA-USD", providerUpdatedAt: Date.parse("2026-07-28T12:00:00.000Z"), providerTimestampOrigin: "fetched" });
    expect(trades).toMatchObject({ source: "coinbase", symbol: "ADA-USD" });
    expect(trades.trades[0]?.occurredAt).toBe(300);
  });
});

const historical = (openTime: number, close = 100) => ({ symbol: "HISTUSDT", timeframe: "1h", openTime, open: close - 1, high: close + 2, low: close - 2, close, volume: 10, closeTime: openTime + 3_599_999, quoteAssetVolume: close * 10, numberOfTrades: 1, takerBuyBaseAssetVolume: 5, takerBuyQuoteAssetVolume: close * 5 });
describe("live historical candle pages", () => {
  const start = 1_725_000_000_000; const hour = 3_600_000;
  beforeEach(() => { mockGetHistoricalCandleData.mockReset(); mockGetCoinbaseHistoricalCandleData.mockReset(); });
  it("orders an overlapping provider page chronologically and reuses the exact page cache", async () => { const window = { symbol: "HIST", interval: "1h" as const, source: "binance" as const, startTime: start, endTime: start + (2 * hour), limit: 2 }; mockGetHistoricalCandleData.mockResolvedValue([historical(start + hour, 102), historical(start, 101)]); const first = await getLiveHistoricalCandlePage(window); const second = await getLiveHistoricalCandlePage(window); expect(first.candles.map((candle) => candle.openTime)).toEqual([start, start + hour]); expect(second.coverage.status).toBe("COMPLETE"); expect(mockGetHistoricalCandleData).toHaveBeenCalledTimes(1); });
  it("reports gaps and partial provider coverage without creating candles", async () => { mockGetHistoricalCandleData.mockResolvedValueOnce([historical(start, 101), historical(start + (2 * hour), 103)]); const gapped = await getLiveHistoricalCandlePage({ symbol: "GAP", interval: "1h", source: "binance", startTime: start, endTime: start + (3 * hour), limit: 3 }); expect(gapped.coverage.status).toBe("GAPPED"); expect(gapped.coverage.gaps).toHaveLength(1); expect(gapped.candles).toHaveLength(2); mockGetHistoricalCandleData.mockResolvedValueOnce([historical(start, 101)]); const partial = await getLiveHistoricalCandlePage({ symbol: "PART", interval: "1h", source: "binance", startTime: start, endTime: start + (2 * hour), limit: 2 }); expect(partial.coverage.status).toBe("PARTIAL"); });
  it("rejects duplicate provider timestamps and does not substitute an earlier cached page after a failed range", async () => { mockGetHistoricalCandleData.mockResolvedValueOnce([historical(start, 101), historical(start, 102)]); await expect(getLiveHistoricalCandlePage({ symbol: "DUP", interval: "1h", source: "binance", startTime: start, endTime: start + hour, limit: 2 })).rejects.toMatchObject({ code: "HISTORY_UNAVAILABLE" }); mockGetHistoricalCandleData.mockRejectedValueOnce(new Error("upstream unavailable")); await expect(getLiveHistoricalCandlePage({ symbol: "FAIL", interval: "1h", source: "binance", startTime: start, endTime: start + hour, limit: 2 })).rejects.toMatchObject({ code: "HISTORY_UNAVAILABLE" }); });
  it("enforces the documented Coinbase four-hour base-candle limit and keeps source-specific keys distinct", async () => { expect(providerHistoryPageLimit("coinbase", "4h")).toBe(75); mockGetCoinbaseHistoricalCandleData.mockResolvedValueOnce([historical(start, 101)]); const page = await getLiveHistoricalCandlePage({ symbol: "CB", interval: "4h", source: "coinbase", startTime: start, endTime: start + (4 * hour), limit: 300 }); expect(page.request.limit).toBe(75); expect(page.source).toBe("coinbase"); });
  it("classifies invalid or oversized UTC ranges separately from provider-history failures", async () => { await expect(getLiveHistoricalCandlePage({ symbol: "RANGE", interval: "1h", source: "binance", startTime: start + hour, endTime: start, limit: 20 })).rejects.toMatchObject({ code: "INVALID_HISTORY_RANGE" }); await expect(getLiveHistoricalCandlePage({ symbol: "RANGE", interval: "1h", source: "binance", startTime: start, endTime: start + (21 * hour), limit: 20 })).rejects.toMatchObject({ code: "INVALID_HISTORY_RANGE" }); });
});

describe("active live candle source isolation", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-28T13:00:00.000Z")); mockGetCandleData.mockReset(); mockGetCoinbaseCandleData.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });
  it("uses only the explicitly selected provider for an active candle", async () => {
    mockGetCandleData.mockResolvedValueOnce([historical(1_000, 101), historical(3_600_000, 103)]);
    mockGetCoinbaseCandleData.mockResolvedValueOnce([historical(3_600_000, 99)]);

    const active = await getLiveActiveCandle({ symbol: "ACTIVEBIN", interval: "1h", source: "binance" });

    expect(active).toMatchObject({ source: "binance", interval: "1h", candle: { openTime: 3_600_000, close: 103 } });
    expect(mockGetCandleData).toHaveBeenCalledWith("ACTIVEBIN", "1h", 2);
    expect(mockGetCoinbaseCandleData).not.toHaveBeenCalled();
  });
  it("rejects duplicate timestamps in the provider active-candle window", async () => {
    mockGetCandleData.mockResolvedValueOnce([historical(1_000, 101), historical(1_000, 102)]);

    await expect(getLiveActiveCandle({ symbol: "ACTIVEDUP", interval: "1h", source: "binance" })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
