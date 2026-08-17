import { TwelveDataMarketDataProvider } from "./twelveData";
import type { MarketDataProvider } from "./types";

const providers: Record<"twelve_data", MarketDataProvider> = {
  twelve_data: new TwelveDataMarketDataProvider(),
};

export function getMarketDataProvider(provider: "twelve_data" = "twelve_data") {
  return providers[provider];
}
