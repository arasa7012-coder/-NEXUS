import { describe, expect, it } from "vitest";
import { goldAsset } from "../assets";
import { TwelveDataMarketDataProvider } from "./twelveData";
import { MarketDataProviderFailure } from "./types";

const now = 1_786_734_800_000;
const quotePayload = { close: "4350.25", previous_close: "4340.00", high: "4360", low: "4330", timestamp: Math.floor(now / 1_000), is_market_open: true };
const candlePayload = { values: [{ datetime: "2026-08-14 12:00:00", open: "4340", high: "4360", low: "4330", close: "4350", volume: "0" }] };

function providerWith(payload: unknown, status = 200) {
  return new TwelveDataMarketDataProvider({
    apiKey: "server-only-test-key",
    now: () => now,
    fetchImpl: async () => new Response(JSON.stringify(payload), { status }),
  });
}

describe("TwelveDataMarketDataProvider", () => {
  it("reports a missing server-side key without requesting or fabricating market data", async () => {
    const provider = new TwelveDataMarketDataProvider({ apiKey: "" });
    await expect(provider.getCapabilities(goldAsset)).resolves.toMatchObject({ providerStatus: "NOT_CONFIGURED" });
    await expect(provider.getQuote(goldAsset)).rejects.toMatchObject({ error: { code: "DATA_UNAVAILABLE" } });
  });

  it("does not fabricate bid or ask when Twelve Data does not return them", async () => {
    const quote = await providerWith(quotePayload).getQuote(goldAsset);
    expect(quote.currentPrice).toBe(4350.25);
    expect(quote.bid).toBeNull();
    expect(quote.ask).toBeNull();
    expect(quote.marketStatus).toBe("LIVE");
  });

  it("deduplicates identical quote requests in the server cache", async () => {
    let calls = 0;
    const provider = new TwelveDataMarketDataProvider({ apiKey: "server-only-test-key", now: () => now, fetchImpl: async () => { calls += 1; return new Response(JSON.stringify(quotePayload)); } });
    await Promise.all([provider.getQuote(goldAsset), provider.getQuote(goldAsset)]);
    expect(calls).toBe(1);
  });

  it("maps provider 429 to RATE LIMIT REACHED", async () => {
    const provider = providerWith({ code: 429, status: "error", message: "You have run out of API credits" }, 429);
    await expect(provider.getQuote(goldAsset)).rejects.toMatchObject({ error: { code: "RATE_LIMIT_REACHED", message: "RATE LIMIT REACHED" } });
  });

  it("maps entitlement denial to PLAN UPGRADE REQUIRED", async () => {
    const provider = providerWith({ code: 403, status: "error", message: "This endpoint requires a premium subscription plan" }, 403);
    await expect(provider.getQuote(goldAsset)).rejects.toMatchObject({ error: { code: "PLAN_UPGRADE_REQUIRED", message: "PLAN UPGRADE REQUIRED" } });
  });

  it("rejects an invalid provider OHLC response instead of inventing a candle", async () => {
    const provider = providerWith({ values: [{ datetime: "2026-08-14 12:00:00", open: "1", high: "0.5", low: "2", close: "1" }] });
    await expect(provider.getCandles({ asset: goldAsset, timeframe: "1m", limit: 5 })).rejects.toBeInstanceOf(MarketDataProviderFailure);
  });

  it("rejects unsupported timeframes before it requests provider data", async () => {
    const provider = providerWith(candlePayload);
    await expect(provider.getCandles({ asset: goldAsset, timeframe: "30m" as never, limit: 5 })).rejects.toMatchObject({ error: { code: "DATA_UNAVAILABLE" } });
  });
});
