import type { MarketAssetDefinition } from "../assets";

export const marketDataTimeframes = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"] as const;
export type MarketDataTimeframe = (typeof marketDataTimeframes)[number];

export type MarketStatus = "LIVE" | "DELAYED" | "MARKET_CLOSED" | "DATA_UNAVAILABLE";
export type MarketProviderStatus = "CONNECTED" | "NOT_CONFIGURED" | "RATE_LIMIT_REACHED" | "PLAN_UPGRADE_REQUIRED" | "MARKET_DATA_TEMPORARILY_UNAVAILABLE";
export type MarketProviderErrorCode = "DATA_UNAVAILABLE" | "RATE_LIMIT_REACHED" | "PLAN_UPGRADE_REQUIRED" | "MARKET_DATA_TEMPORARILY_UNAVAILABLE";

export type MarketProviderError = {
  code: MarketProviderErrorCode;
  message: string;
  retryAfterSeconds: number | null;
};

export class MarketDataProviderFailure extends Error {
  constructor(public readonly error: MarketProviderError) {
    super(error.message);
    this.name = "MarketDataProviderFailure";
  }
}

export type MarketQuote = {
  asset: MarketAssetDefinition;
  provider: "twelve_data";
  currentPrice: number;
  bid: number | null;
  ask: number | null;
  change24h: number | null;
  change24hPercent: number | null;
  high24h: number | null;
  low24h: number | null;
  previousClose: number | null;
  providerUpdatedAt: number | null;
  providerTimestampOrigin: "provider" | "unavailable";
  fetchedAt: number;
  marketStatus: MarketStatus;
  isStale: boolean;
};

export type MarketCandle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type MarketCandles = {
  asset: MarketAssetDefinition;
  provider: "twelve_data";
  timeframe: MarketDataTimeframe;
  candles: MarketCandle[];
  providerUpdatedAt: number | null;
  fetchedAt: number;
  isStale: boolean;
};

export type MarketProviderCapabilities = {
  asset: MarketAssetDefinition;
  provider: "twelve_data";
  providerStatus: MarketProviderStatus;
  supportedTimeframes: MarketDataTimeframe[];
  bidAskAvailable: false;
  commercialDisplayVerified: false;
  commercialDisplayMessage: string;
};

export interface MarketDataProvider {
  readonly id: "twelve_data";
  getCapabilities(asset: MarketAssetDefinition): Promise<MarketProviderCapabilities>;
  getQuote(asset: MarketAssetDefinition): Promise<MarketQuote>;
  getCandles(input: { asset: MarketAssetDefinition; timeframe: MarketDataTimeframe; limit: number; startDate?: string; endDate?: string }): Promise<MarketCandles>;
}

export function serializeMarketProviderError(error: unknown): MarketProviderError {
  if (error instanceof MarketDataProviderFailure) return error.error;
  return {
    code: "MARKET_DATA_TEMPORARILY_UNAVAILABLE",
    message: "MARKET DATA TEMPORARILY UNAVAILABLE",
    retryAfterSeconds: null,
  };
}
