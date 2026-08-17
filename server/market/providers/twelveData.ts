import { ENV } from "../../_core/env";
import { goldAsset, type MarketAssetDefinition } from "../assets";
import {
  type MarketCandle,
  type MarketCandles,
  type MarketDataProvider,
  type MarketDataTimeframe,
  MarketDataProviderFailure,
  type MarketProviderCapabilities,
  type MarketProviderError,
  type MarketProviderStatus,
  type MarketQuote,
} from "./types";

const API_ROOT = "https://api.twelvedata.com";
const REQUEST_LIMIT_PER_MINUTE = 8;
const QUOTE_TTL_MS = 60_000;
const CANDLE_TTL_MS = 60_000;
const FRESH_QUOTE_MAX_AGE_MS = 5 * 60_000;

const twelveIntervals: Record<MarketDataTimeframe, string> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day", "1w": "1week", "1mo": "1month",
};
const intervalMs: Record<MarketDataTimeframe, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000, "1mo": 2_592_000_000,
};

type TwelveResponse = {
  code?: number;
  status?: string;
  message?: string;
  datetime?: string;
  timestamp?: number | string;
  is_market_open?: boolean;
  close?: string | number;
  previous_close?: string | number;
  high?: string | number;
  low?: string | number;
  change?: string | number;
  percent_change?: string | number;
  bid?: string | number;
  ask?: string | number;
  values?: Array<{ datetime?: string; open?: string | number; high?: string | number; low?: string | number; close?: string | number; volume?: string | number }>;
};

type CacheEntry<T> = { value: T; expiresAt: number; cachedAt: number };
type ProviderFetch = typeof fetch;

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampOrNull(value: unknown): number | null {
  const numeric = numberOrNull(value);
  if (numeric !== null) return numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function providerFailure(payload: TwelveResponse, httpStatus: number): MarketDataProviderFailure | null {
  const message = payload.message?.trim() || "";
  const normalized = message.toLowerCase();
  if (httpStatus === 429 || payload.code === 429 || /rate limit|api credits|run out of api credits/i.test(message)) {
    return new MarketDataProviderFailure({ code: "RATE_LIMIT_REACHED", message: "RATE LIMIT REACHED", retryAfterSeconds: 60 });
  }
  if (/premium|subscription|plan|upgrade|not available for your/i.test(normalized)) {
    return new MarketDataProviderFailure({ code: "PLAN_UPGRADE_REQUIRED", message: "PLAN UPGRADE REQUIRED", retryAfterSeconds: null });
  }
  if (httpStatus === 401 || /api key is invalid|api key missing|unauthorized/i.test(normalized)) {
    return new MarketDataProviderFailure({ code: "DATA_UNAVAILABLE", message: "DATA UNAVAILABLE", retryAfterSeconds: null });
  }
  if (httpStatus >= 500 || payload.status === "error") {
    return new MarketDataProviderFailure({ code: "MARKET_DATA_TEMPORARILY_UNAVAILABLE", message: "MARKET DATA TEMPORARILY UNAVAILABLE", retryAfterSeconds: null });
  }
  return null;
}

export class TwelveDataMarketDataProvider implements MarketDataProvider {
  readonly id = "twelve_data" as const;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private recentRequestTimes: number[] = [];

  constructor(private readonly config: { apiKey?: string; fetchImpl?: ProviderFetch; now?: () => number } = {}) {}

  private get apiKey() { return this.config.apiKey ?? ENV.twelveDataApiKey; }
  private get fetchImpl() { return this.config.fetchImpl ?? fetch; }
  private get now() { return this.config.now ?? Date.now; }

  private ensureConfigured() {
    if (this.apiKey) return;
    throw new MarketDataProviderFailure({ code: "DATA_UNAVAILABLE", message: "DATA UNAVAILABLE", retryAfterSeconds: null });
  }

  private async cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<{ value: T; cachedAt: number; isStale: boolean }> {
    const current = this.cache.get(key) as CacheEntry<T> | undefined;
    if (current && current.expiresAt > this.now()) return { value: current.value, cachedAt: current.cachedAt, isStale: false };
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) {
      const value = await pending;
      return { value, cachedAt: this.cache.get(key)?.cachedAt ?? this.now(), isStale: false };
    }
    const request = loader().then((value) => {
      this.cache.set(key, { value, cachedAt: this.now(), expiresAt: this.now() + ttlMs });
      return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    try {
      const value = await request;
      return { value, cachedAt: this.cache.get(key)?.cachedAt ?? this.now(), isStale: false };
    } catch (error) {
      if (current) return { value: current.value, cachedAt: current.cachedAt, isStale: true };
      throw error;
    }
  }

  private async request(path: string): Promise<TwelveResponse> {
    this.ensureConfigured();
    const now = this.now();
    this.recentRequestTimes = this.recentRequestTimes.filter((time) => now - time < 60_000);
    if (this.recentRequestTimes.length >= REQUEST_LIMIT_PER_MINUTE) {
      const retryAfterSeconds = Math.max(1, Math.ceil((60_000 - (now - this.recentRequestTimes[0]!)) / 1_000));
      throw new MarketDataProviderFailure({ code: "RATE_LIMIT_REACHED", message: "RATE LIMIT REACHED", retryAfterSeconds });
    }
    this.recentRequestTimes.push(now);
    try {
      const separator = path.includes("?") ? "&" : "?";
      const response = await this.fetchImpl(`${API_ROOT}${path}${separator}apikey=${encodeURIComponent(this.apiKey)}`, { signal: AbortSignal.timeout(8_000) });
      const payload = await response.json() as TwelveResponse;
      const failure = providerFailure(payload, response.status);
      if (failure) throw failure;
      return payload;
    } catch (error) {
      if (error instanceof MarketDataProviderFailure) throw error;
      throw new MarketDataProviderFailure({ code: "MARKET_DATA_TEMPORARILY_UNAVAILABLE", message: "MARKET DATA TEMPORARILY UNAVAILABLE", retryAfterSeconds: null });
    }
  }

  async getCapabilities(asset: MarketAssetDefinition): Promise<MarketProviderCapabilities> {
    // Provider status must reflect an OBSERVED outcome, never the mere presence
    // of an API key. Previously this returned CONNECTED unconditionally once a
    // key string existed, which reported a healthy provider while every request
    // was failing (invalid key, exhausted credits, plan restriction, outage).
    //
    // The probe reuses getQuote(), so it shares the 60s quote cache and the
    // in-flight dedup — a capabilities call does not add a new upstream request
    // when a quote was already fetched inside the TTL.
    let providerStatus: MarketProviderStatus;
    if (!this.apiKey) {
      providerStatus = "NOT_CONFIGURED";
    } else {
      try {
        const quote = await this.getQuote(asset);
        // A served-from-stale-cache response is a degraded provider, not a
        // healthy one: the upstream call failed and older data was substituted.
        providerStatus = quote.isStale ? "MARKET_DATA_TEMPORARILY_UNAVAILABLE" : "CONNECTED";
      } catch (error) {
        providerStatus =
          error instanceof MarketDataProviderFailure
            ? error.error.code === "DATA_UNAVAILABLE"
              ? "NOT_CONFIGURED"
              : error.error.code
            : "MARKET_DATA_TEMPORARILY_UNAVAILABLE";
      }
    }

    return {
      asset,
      provider: this.id,
      providerStatus,
      supportedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"],
      bidAskAvailable: false,
      commercialDisplayVerified: false,
      commercialDisplayMessage: "Commercial public display is not verified for the configured Twelve Data subscription.",
    };
  }

  async getQuote(asset: MarketAssetDefinition = goldAsset): Promise<MarketQuote> {
    const result = await this.cached(`quote:${asset.symbol}`, QUOTE_TTL_MS, () => this.request(`/quote?symbol=${encodeURIComponent(asset.symbol)}`));
    const raw = result.value;
    const currentPrice = numberOrNull(raw.close);
    if (currentPrice === null) throw new MarketDataProviderFailure({ code: "MARKET_DATA_TEMPORARILY_UNAVAILABLE", message: "MARKET DATA TEMPORARILY UNAVAILABLE", retryAfterSeconds: null });
    const providerUpdatedAt = timestampOrNull(raw.timestamp) ?? timestampOrNull(raw.datetime);
    const age = providerUpdatedAt === null ? Number.POSITIVE_INFINITY : this.now() - providerUpdatedAt;
    const marketStatus = raw.is_market_open === false
      ? "MARKET_CLOSED" as const
      : providerUpdatedAt !== null && age >= 0 && age <= FRESH_QUOTE_MAX_AGE_MS
        ? "LIVE" as const
        : "DELAYED" as const;
    return {
      asset,
      provider: this.id,
      currentPrice,
      bid: numberOrNull(raw.bid),
      ask: numberOrNull(raw.ask),
      change24h: numberOrNull(raw.change),
      change24hPercent: numberOrNull(raw.percent_change),
      high24h: numberOrNull(raw.high),
      low24h: numberOrNull(raw.low),
      previousClose: numberOrNull(raw.previous_close),
      providerUpdatedAt,
      providerTimestampOrigin: providerUpdatedAt === null ? "unavailable" : "provider",
      fetchedAt: result.cachedAt,
      marketStatus,
      isStale: result.isStale,
    };
  }

  async getCandles(input: { asset: MarketAssetDefinition; timeframe: MarketDataTimeframe; limit: number; startDate?: string; endDate?: string }): Promise<MarketCandles> {
    if (!(input.timeframe in twelveIntervals)) {
      throw new MarketDataProviderFailure({ code: "DATA_UNAVAILABLE", message: "DATA UNAVAILABLE", retryAfterSeconds: null });
    }
    const limit = Math.min(Math.max(Math.floor(input.limit), 5), 200);
    const params = new URLSearchParams({ symbol: input.asset.symbol, interval: twelveIntervals[input.timeframe], outputsize: String(limit) });
    if (input.startDate) params.set("start_date", input.startDate);
    if (input.endDate) params.set("end_date", input.endDate);
    const result = await this.cached(`candles:${input.asset.symbol}:${input.timeframe}:${limit}:${input.startDate ?? ""}:${input.endDate ?? ""}`, CANDLE_TTL_MS, () => this.request(`/time_series?${params.toString()}`));
    const seen = new Set<number>();
    const candles: MarketCandle[] = [];
    for (const value of result.value.values ?? []) {
      const openTime = timestampOrNull(value.datetime);
      const open = numberOrNull(value.open); const high = numberOrNull(value.high); const low = numberOrNull(value.low); const close = numberOrNull(value.close);
      if (openTime === null || open === null || high === null || low === null || close === null || low > Math.min(open, close) || high < Math.max(open, close) || seen.has(openTime)) {
        throw new MarketDataProviderFailure({ code: "MARKET_DATA_TEMPORARILY_UNAVAILABLE", message: "MARKET DATA TEMPORARILY UNAVAILABLE", retryAfterSeconds: null });
      }
      seen.add(openTime);
      candles.push({ openTime, closeTime: openTime + intervalMs[input.timeframe] - 1, open, high, low, close, volume: numberOrNull(value.volume) });
    }
    candles.sort((left, right) => left.openTime - right.openTime);
    if (!candles.length) throw new MarketDataProviderFailure({ code: "MARKET_DATA_TEMPORARILY_UNAVAILABLE", message: "MARKET DATA TEMPORARILY UNAVAILABLE", retryAfterSeconds: null });
    return { asset: input.asset, provider: this.id, timeframe: input.timeframe, candles, providerUpdatedAt: candles.at(-1)?.closeTime ?? null, fetchedAt: result.cachedAt, isStale: result.isStale };
  }
}
