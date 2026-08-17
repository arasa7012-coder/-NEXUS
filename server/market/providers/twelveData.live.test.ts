import { describe, expect, it } from "vitest";
import { goldAsset } from "../assets";
import { TwelveDataMarketDataProvider } from "./twelveData";

describe("Twelve Data XAU/USD live verification", () => {
  it("retrieves live data when configured and reports a missing server credential honestly otherwise", async () => {
    const provider = new TwelveDataMarketDataProvider();

    if (!process.env.TWELVE_DATA_API_KEY) {
      await expect(provider.getCapabilities(goldAsset)).resolves.toMatchObject({ providerStatus: "NOT_CONFIGURED" });
      await expect(provider.getQuote(goldAsset)).rejects.toMatchObject({ error: { code: "DATA_UNAVAILABLE" } });
      return;
    }

    const [quote, currentCandles, historicalCandles] = await Promise.all([
      provider.getQuote(goldAsset),
      provider.getCandles({ asset: goldAsset, timeframe: "1m", limit: 5 }),
      provider.getCandles({ asset: goldAsset, timeframe: "1w", limit: 5 }),
    ]);

    expect(quote.currentPrice).toBeGreaterThan(0);
    expect(currentCandles.candles.length).toBeGreaterThan(0);
    expect(historicalCandles.candles.length).toBeGreaterThan(0);
  }, 20_000);
});
