import axios from "axios";
import { ENV } from "../_core/env";
import {
  getCandleData,
  getHistoricalCandleData,
  getOrderBook,
  getRecentTrades,
  getTickerData,
  type CandleData,
  type TickerData,
  type TradeData,
} from "./binanceApi";
import {
  getCoinbaseCandleData,
  getCoinbaseHistoricalCandleData,
  getCoinbaseOrderBook,
  getCoinbaseRecentTrades,
  getCoinbaseTickerData,
} from "./coinbaseApi";

const COINGECKO_DEMO_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_URL = "https://pro-api.coingecko.com/api/v3";
const DEFAULT_DIRECTORY_TTL_MS = 60_000;
const DETAIL_TTL_MS = 60_000;
const SEARCH_TTL_MS = 10 * 60_000;
const QUOTE_TTL_MS = 10_000;
const CANDLE_TTL_MS = 20_000;
const ACTIVE_CANDLE_TTL_MS = 3_000;
const HISTORICAL_PAGE_TTL_MS = 30_000;
const ORDER_BOOK_TTL_MS = 4_000;
const TRADE_TTL_MS = 4_000;
const MAX_CACHE_ENTRIES = 80;

export const marketOrders = [
  "market_cap_desc",
  "market_cap_asc",
  "volume_desc",
  "volume_asc",
  "id_asc",
  "id_desc",
] as const;

export type MarketOrder = (typeof marketOrders)[number];
export const exchangeIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type ExchangeInterval = (typeof exchangeIntervals)[number];
export type ExchangeSource = "binance" | "coinbase";
export type TimestampOrigin = "provider" | "fetched";
type CoinGeckoMode = "demo" | "pro";

export type MarketDataErrorCode = "CONFIGURATION" | "RATE_LIMITED" | "UNAVAILABLE" | "HISTORY_UNAVAILABLE" | "INVALID_HISTORY_RANGE";

export class MarketDataError extends Error {
  constructor(
    public readonly code: MarketDataErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

export interface LiveMarketAsset {
  id: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  marketCapRank: number | null;
  priceUsd: number | null;
  priceChange24hPercent: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  high24hUsd: number | null;
  low24hUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  providerUpdatedAt: number;
  providerTimestampOrigin: TimestampOrigin;
  sparkline7d: number[];
}

export interface MarketDirectory {
  assets: LiveMarketAsset[];
  page: number;
  perPage: number;
  hasMore: boolean;
  cachedAt: number;
  isStale: boolean;
  source: "coingecko";
}

export interface AssetMarketDetail extends LiveMarketAsset {
  description: string | null;
  homepage: string | null;
  categories: string[];
  priceChange1hPercent: number | null;
  priceChange7dPercent: number | null;
}

export interface LiveAssetDetail {
  asset: AssetMarketDetail;
  cachedAt: number;
  isStale: boolean;
  source: "coingecko";
}

export interface LiveQuote {
  source: ExchangeSource;
  symbol: string;
  baseSymbol: string;
  quoteSymbol: "USDT" | "USD";
  priceUsd: number;
  priceChange24hUsd: number;
  priceChange24hPercent: number;
  high24hUsd: number;
  low24hUsd: number;
  baseVolume24h: number;
  quoteVolume24hUsd: number;
  providerUpdatedAt: number;
  providerTimestampOrigin: TimestampOrigin;
}

export interface LiveQuoteResult {
  quote: LiveQuote;
  cachedAt: number;
  isStale: boolean;
}

export interface LiveCandle {
  source: ExchangeSource;
  symbol: string;
  interval: ExchangeInterval;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolumeUsd: number;
  tradeCount: number;
}

export interface LiveCandleResult {
  symbol: string;
  baseSymbol: string;
  interval: ExchangeInterval;
  candles: LiveCandle[];
  cachedAt: number;
  isStale: boolean;
  source: ExchangeSource;
}

export interface LiveActiveCandleResult {
  symbol: string;
  baseSymbol: string;
  interval: ExchangeInterval;
  source: ExchangeSource;
  candle: LiveCandle;
  cachedAt: number;
  isStale: boolean;
}

export interface HistoricalCandleRequest {
  symbol: string;
  interval: ExchangeInterval;
  startTime: number;
  endTime: number;
  limit: number;
}
export interface LiveHistoryGap { afterOpenTime: number; beforeOpenTime: number; expectedOpenTime: number; observedOpenTime: number; }
export type LiveHistoryCoverage = "COMPLETE" | "PARTIAL" | "GAPPED" | "EMPTY";
export interface LiveHistoricalCandlePage extends LiveCandleResult { request: { startTime: number; endTime: number; limit: number; source: ExchangeSource }; coverage: { status: LiveHistoryCoverage; providerPageLimit: number; returnedCount: number; gaps: LiveHistoryGap[]; coverageStart: number | null; coverageEndExclusive: number | null; }; }

export interface LiveOrderBookLevel {
  priceUsd: number;
  quantity: number;
  totalUsd: number;
}

export interface LiveOrderBookResult {
  symbol: string;
  baseSymbol: string;
  bids: LiveOrderBookLevel[];
  asks: LiveOrderBookLevel[];
  providerUpdatedAt: number;
  providerTimestampOrigin: TimestampOrigin;
  cachedAt: number;
  isStale: boolean;
  source: ExchangeSource;
}

export interface LiveTrade {
  id: number;
  symbol: string;
  priceUsd: number;
  quantity: number;
  occurredAt: number;
  side: "buy" | "sell";
}

export interface LiveTradeResult {
  symbol: string;
  baseSymbol: string;
  trades: LiveTrade[];
  cachedAt: number;
  isStale: boolean;
  source: ExchangeSource;
}

export interface LiveTradingContext {
  symbol: string;
  baseSymbol: string;
  quote: LiveQuoteResult;
  candles: LiveCandleResult;
  orderBook: LiveOrderBookResult;
  trades: LiveTradeResult;
  cachedAt: number;
  isStale: boolean;
  source: ExchangeSource | "mixed";
}

interface CachedValue<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}

interface CacheResult<T> {
  value: T;
  cachedAt: number;
  isStale: boolean;
}

interface CoinMarketResponse {
  id: string;
  name: string;
  symbol: string;
  image?: string | null;
  market_cap_rank?: number | null;
  current_price?: number | null;
  price_change_percentage_24h?: number | null;
  total_volume?: number | null;
  market_cap?: number | null;
  high_24h?: number | null;
  low_24h?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  last_updated?: string | null;
  sparkline_in_7d?: { price?: number[] | null } | null;
}

interface CoinDetailResponse {
  id: string;
  name: string;
  symbol: string;
  image?: { large?: string | null; small?: string | null } | null;
  market_cap_rank?: number | null;
  last_updated?: string | null;
  description?: { en?: string | null } | null;
  links?: { homepage?: Array<string | null> } | null;
  categories?: string[] | null;
  market_data?: {
    current_price?: Record<string, number | null | undefined>;
    price_change_percentage_1h_in_currency?: Record<string, number | null | undefined>;
    price_change_percentage_24h?: number | null;
    price_change_percentage_7d?: number | null;
    total_volume?: Record<string, number | null | undefined>;
    market_cap?: Record<string, number | null | undefined>;
    high_24h?: Record<string, number | null | undefined>;
    low_24h?: Record<string, number | null | undefined>;
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
    sparkline_7d?: { price?: number[] | null } | null;
    last_updated?: string | null;
  } | null;
}

interface CoinSearchResponse {
  coins?: Array<{ id?: string | null }>;
}

const responseCache = new Map<string, CachedValue<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();
let selectedCoinGeckoMode: CoinGeckoMode | null = null;

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTimestampWithOrigin(value: string | null | undefined): { value: number; origin: TimestampOrigin } {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed)
    ? { value: parsed, origin: "provider" }
    : { value: Date.now(), origin: "fetched" };
}

function sanitizeSparkline(values: number[] | null | undefined): number[] {
  return (values ?? []).map(toFiniteNumber).filter((value): value is number => value !== null);
}

function trimCache() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKeys = Array.from(responseCache.entries())
    .sort(([, left], [, right]) => left.cachedAt - right.cachedAt)
    .slice(0, responseCache.size - MAX_CACHE_ENTRIES)
    .map(([key]) => key);
  oldestKeys.forEach((key) => responseCache.delete(key));
}

async function fromCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<CacheResult<T>> {
  const now = Date.now();
  const current = responseCache.get(key) as CachedValue<T> | undefined;
  if (current && current.expiresAt > now) {
    return { value: current.value, cachedAt: current.cachedAt, isStale: false };
  }

  const pending = inFlightRequests.get(key) as Promise<T> | undefined;
  if (pending) {
    const value = await pending;
    const resolved = responseCache.get(key) as CachedValue<T> | undefined;
    return { value, cachedAt: resolved?.cachedAt ?? Date.now(), isStale: false };
  }

  const request = loader()
    .then((value) => {
      responseCache.set(key, { value, cachedAt: Date.now(), expiresAt: Date.now() + ttlMs });
      trimCache();
      return value;
    })
    .finally(() => inFlightRequests.delete(key));
  inFlightRequests.set(key, request);

  try {
    const value = await request;
    const resolved = responseCache.get(key) as CachedValue<T> | undefined;
    return { value, cachedAt: resolved?.cachedAt ?? Date.now(), isStale: false };
  } catch (error) {
    if (current) {
      return { value: current.value, cachedAt: current.cachedAt, isStale: true };
    }
    throw error;
  }
}

async function fromStrictRangeCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<CacheResult<T>> {
  const now = Date.now();
  const current = responseCache.get(key) as CachedValue<T> | undefined;
  if (current && current.expiresAt > now) return { value: current.value, cachedAt: current.cachedAt, isStale: false };
  const pending = inFlightRequests.get(key) as Promise<T> | undefined;
  if (pending) {
    const value = await pending;
    const resolved = responseCache.get(key) as CachedValue<T> | undefined;
    return { value, cachedAt: resolved?.cachedAt ?? Date.now(), isStale: false };
  }
  const request = loader().then((value) => {
    responseCache.set(key, { value, cachedAt: Date.now(), expiresAt: Date.now() + ttlMs });
    trimCache();
    return value;
  }).finally(() => inFlightRequests.delete(key));
  inFlightRequests.set(key, request);
  const value = await request;
  const resolved = responseCache.get(key) as CachedValue<T> | undefined;
  return { value, cachedAt: resolved?.cachedAt ?? Date.now(), isStale: false };
}

function retryAfterSeconds(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : undefined;
}

function normalizeProviderError(error: unknown): MarketDataError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 429) {
      return new MarketDataError(
        "RATE_LIMITED",
        "Live market data is temporarily rate limited. Please retry shortly.",
        retryAfterSeconds(error.response?.headers?.["retry-after"]),
      );
    }
    if (status === 401 || status === 403) {
      return new MarketDataError("CONFIGURATION", "The live market-data credential was rejected by the provider.");
    }
  }
  return new MarketDataError("UNAVAILABLE", "Live market data is temporarily unavailable. Please retry shortly.");
}

function normalizeExchangeError(error: unknown): MarketDataError {
  if (error instanceof MarketDataError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 429) {
      return new MarketDataError(
        "RATE_LIMITED",
        "Live exchange context is temporarily rate limited. Please retry shortly.",
        retryAfterSeconds(error.response?.headers?.["retry-after"]),
      );
    }
    if (status === 400 || status === 404) {
      return new MarketDataError("UNAVAILABLE", "This exchange pair is not currently available in the live market feed.");
    }
  }
  return new MarketDataError("UNAVAILABLE", "Live exchange context is temporarily unavailable. Please retry shortly.");
}

function isRegionalExchangeRestriction(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const responseText = typeof error.response?.data === "string"
    ? error.response.data
    : typeof error.response?.data?.msg === "string"
      ? error.response.data.msg
      : typeof error.response?.data?.message === "string"
        ? error.response.data.message
        : "";
  return error.response?.status === 451 || /restricted location|eligibility/i.test(responseText);
}

async function withRegionalExchangeFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<{ value: T; source: ExchangeSource }> {
  try {
    return { value: await primary(), source: "binance" };
  } catch (error) {
    if (!isRegionalExchangeRestriction(error)) throw error;
    return { value: await fallback(), source: "coinbase" };
  }
}

function normalizeBaseSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(normalized)) {
    throw new MarketDataError("UNAVAILABLE", "The requested exchange symbol is not supported.");
  }
  return normalized;
}

export function exchangeIntervalMs(interval: ExchangeInterval): number { return ({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 })[interval]; }
export function providerHistoryPageLimit(source: ExchangeSource, interval: ExchangeInterval): number { return source === "coinbase" && interval === "4h" ? 75 : 300; }
function validLiveCandle(candle: LiveCandle) { return Number.isFinite(candle.openTime) && Number.isFinite(candle.closeTime) && Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low) && Number.isFinite(candle.close) && Number.isFinite(candle.volume) && candle.low <= candle.open && candle.low <= candle.close && candle.high >= candle.open && candle.high >= candle.close && candle.volume >= 0; }
function analyzeLiveHistoryPage(candles: LiveCandle[], input: { startTime: number; endTime: number; interval: ExchangeInterval; source: ExchangeSource; limit: number }) {
  const ordered = [...candles].sort((left, right) => left.openTime - right.openTime);
  const gaps: LiveHistoryGap[] = []; const expectedMs = exchangeIntervalMs(input.interval);
  for (let index = 0; index < ordered.length; index += 1) {
    const candle = ordered[index]!;
    if (!validLiveCandle(candle)) throw new MarketDataError("HISTORY_UNAVAILABLE", "The provider returned an invalid historical OHLCV candle.");
    if (index > 0) {
      const previous = ordered[index - 1]!;
      if (candle.openTime === previous.openTime) throw new MarketDataError("HISTORY_UNAVAILABLE", "The provider returned duplicate historical candle timestamps.");
      if (candle.openTime <= previous.openTime) throw new MarketDataError("HISTORY_UNAVAILABLE", "The provider returned historical candles out of chronological order.");
      const expectedOpenTime = previous.openTime + expectedMs;
      if (candle.openTime !== expectedOpenTime) gaps.push({ afterOpenTime: previous.openTime, beforeOpenTime: candle.openTime, expectedOpenTime, observedOpenTime: candle.openTime });
    }
  }
  const coverageStart = ordered[0]?.openTime ?? null; const coverageEndExclusive = ordered.length ? ordered.at(-1)!.closeTime + 1 : null;
  const status: LiveHistoryCoverage = !ordered.length ? "EMPTY" : gaps.length ? "GAPPED" : coverageStart! > input.startTime || coverageEndExclusive! < input.endTime ? "PARTIAL" : "COMPLETE";
  return { candles: ordered, coverage: { status, providerPageLimit: providerHistoryPageLimit(input.source, input.interval), returnedCount: ordered.length, gaps, coverageStart, coverageEndExclusive } };
}

function requestConfig(mode: CoinGeckoMode) {
  if (!ENV.coinGeckoApiKey) {
    throw new MarketDataError("CONFIGURATION", "Live market data is not configured.");
  }
  return {
    baseURL: mode === "pro" ? COINGECKO_PRO_URL : COINGECKO_DEMO_URL,
    headers: mode === "pro"
      ? { "x-cg-pro-api-key": ENV.coinGeckoApiKey, accept: "application/json" }
      : { "x-cg-demo-api-key": ENV.coinGeckoApiKey, accept: "application/json" },
    timeout: 8_000,
  };
}

async function coinGeckoGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const modes: CoinGeckoMode[] = selectedCoinGeckoMode ? [selectedCoinGeckoMode] : ["demo", "pro"];
  let lastError: unknown;

  for (const mode of modes) {
    try {
      const response = await axios.get<T>(path, { ...requestConfig(mode), params });
      selectedCoinGeckoMode = mode;
      return response.data;
    } catch (error) {
      lastError = error;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (!selectedCoinGeckoMode && (status === 401 || status === 403)) continue;
      throw normalizeProviderError(error);
    }
  }

  throw normalizeProviderError(lastError);
}

export function mapCoinGeckoMarket(raw: CoinMarketResponse): LiveMarketAsset {
  const timestamp = toTimestampWithOrigin(raw.last_updated);
  return {
    id: raw.id,
    name: raw.name,
    symbol: raw.symbol.toUpperCase(),
    imageUrl: raw.image ?? null,
    marketCapRank: toFiniteNumber(raw.market_cap_rank),
    priceUsd: toFiniteNumber(raw.current_price),
    priceChange24hPercent: toFiniteNumber(raw.price_change_percentage_24h),
    volume24hUsd: toFiniteNumber(raw.total_volume),
    marketCapUsd: toFiniteNumber(raw.market_cap),
    high24hUsd: toFiniteNumber(raw.high_24h),
    low24hUsd: toFiniteNumber(raw.low_24h),
    circulatingSupply: toFiniteNumber(raw.circulating_supply),
    totalSupply: toFiniteNumber(raw.total_supply),
    maxSupply: toFiniteNumber(raw.max_supply),
    providerUpdatedAt: timestamp.value,
    providerTimestampOrigin: timestamp.origin,
    sparkline7d: sanitizeSparkline(raw.sparkline_in_7d?.price),
  };
}

export async function getMarketDirectory(input: {
  page: number;
  perPage: number;
  order: MarketOrder;
  ids?: string[];
}): Promise<MarketDirectory> {
  const ids = input.ids?.filter(Boolean).slice(0, 50) ?? [];
  const cacheKey = `directory:${input.order}:${input.page}:${input.perPage}:${ids.join(",")}`;
  const result = await fromCache(cacheKey, DEFAULT_DIRECTORY_TTL_MS, async () => {
    const raw = await coinGeckoGet<CoinMarketResponse[]>("/coins/markets", {
      vs_currency: "usd",
      order: input.order,
      per_page: input.perPage,
      page: input.page,
      ids: ids.length ? ids.join(",") : undefined,
      sparkline: true,
      price_change_percentage: "1h,24h,7d",
    });

    return {
      assets: raw.map(mapCoinGeckoMarket),
      page: input.page,
      perPage: input.perPage,
      hasMore: ids.length ? false : raw.length === input.perPage,
    };
  });

  return { ...result.value, cachedAt: result.cachedAt, isStale: result.isStale, source: "coingecko" };
}

export async function searchMarketDirectory(query: string): Promise<MarketDirectory & { query: string; matchCount: number }> {
  const normalizedQuery = query.trim().toLowerCase();
  const search = await fromCache(`search:${normalizedQuery}`, SEARCH_TTL_MS, async () => {
    const raw = await coinGeckoGet<CoinSearchResponse>("/search", { query: normalizedQuery });
    return (raw.coins ?? []).map((coin) => coin.id).filter((id): id is string => Boolean(id)).slice(0, 25);
  });

  if (!search.value.length) {
    return {
      assets: [],
      page: 1,
      perPage: 25,
      hasMore: false,
      cachedAt: search.cachedAt,
      isStale: search.isStale,
      source: "coingecko",
      query,
      matchCount: 0,
    };
  }

  const markets = await getMarketDirectory({
    page: 1,
    perPage: search.value.length,
    order: "market_cap_desc",
    ids: search.value,
  });
  return { ...markets, query, matchCount: search.value.length, isStale: markets.isStale || search.isStale };
}

export async function getAssetMarketDetail(id: string): Promise<LiveAssetDetail> {
  const result = await fromCache(`detail:${id}`, DETAIL_TTL_MS, async () => {
    const raw = await coinGeckoGet<CoinDetailResponse>(`/coins/${encodeURIComponent(id)}`, {
      localization: false,
      tickers: false,
      market_data: true,
      community_data: false,
      developer_data: false,
      sparkline: true,
    });
    const market = raw.market_data;
    const timestamp = toTimestampWithOrigin(raw.last_updated ?? market?.last_updated);
    const asset: AssetMarketDetail = {
      id: raw.id,
      name: raw.name,
      symbol: raw.symbol.toUpperCase(),
      imageUrl: raw.image?.large ?? raw.image?.small ?? null,
      marketCapRank: toFiniteNumber(raw.market_cap_rank),
      priceUsd: toFiniteNumber(market?.current_price?.usd),
      priceChange24hPercent: toFiniteNumber(market?.price_change_percentage_24h),
      volume24hUsd: toFiniteNumber(market?.total_volume?.usd),
      marketCapUsd: toFiniteNumber(market?.market_cap?.usd),
      high24hUsd: toFiniteNumber(market?.high_24h?.usd),
      low24hUsd: toFiniteNumber(market?.low_24h?.usd),
      circulatingSupply: toFiniteNumber(market?.circulating_supply),
      totalSupply: toFiniteNumber(market?.total_supply),
      maxSupply: toFiniteNumber(market?.max_supply),
      providerUpdatedAt: timestamp.value,
      providerTimestampOrigin: timestamp.origin,
      sparkline7d: sanitizeSparkline(market?.sparkline_7d?.price),
      description: raw.description?.en?.trim() || null,
      homepage: raw.links?.homepage?.find((url): url is string => Boolean(url)) ?? null,
      categories: raw.categories?.slice(0, 5) ?? [],
      priceChange1hPercent: toFiniteNumber(market?.price_change_percentage_1h_in_currency?.usd),
      priceChange7dPercent: toFiniteNumber(market?.price_change_percentage_7d),
    };
    return asset;
  });

  return { asset: result.value, cachedAt: result.cachedAt, isStale: result.isStale, source: "coingecko" };
}

export function mapExchangeQuote(raw: TickerData, baseSymbol: string, source: ExchangeSource = "binance"): LiveQuote {
  const derivedQuoteVolume = raw.price * raw.volume;
  const quoteVolume24hUsd = Number.isFinite(raw.quoteVolume) && raw.quoteVolume >= 0
    ? raw.quoteVolume
    : Number.isFinite(derivedQuoteVolume) && derivedQuoteVolume >= 0
      ? derivedQuoteVolume
      : 0;
  const providerTimestamp = typeof raw.providerUpdatedAt === "number" && Number.isFinite(raw.providerUpdatedAt)
    ? raw.providerUpdatedAt
    : null;
  return {
    source,
    symbol: raw.symbol,
    baseSymbol,
    quoteSymbol: source === "coinbase" ? "USD" : "USDT",
    priceUsd: raw.price,
    priceChange24hUsd: raw.priceChange,
    priceChange24hPercent: raw.priceChangePercent,
    high24hUsd: raw.highPrice,
    low24hUsd: raw.lowPrice,
    baseVolume24h: raw.volume,
    quoteVolume24hUsd,
    providerUpdatedAt: providerTimestamp ?? Date.now(),
    providerTimestampOrigin: providerTimestamp === null ? "fetched" : "provider",
  };
}

export function mapExchangeCandle(raw: CandleData, interval: ExchangeInterval, source: ExchangeSource = "binance"): LiveCandle {
  return {
    source,
    symbol: raw.symbol,
    interval,
    openTime: raw.openTime,
    closeTime: raw.closeTime,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume,
    quoteVolumeUsd: raw.quoteAssetVolume,
    tradeCount: raw.numberOfTrades,
  };
}

export function mapOrderBookLevels(levels: Array<[string, string]>): LiveOrderBookLevel[] {
  return levels
    .map(([price, quantity]) => ({ priceUsd: toFiniteNumber(price), quantity: toFiniteNumber(quantity) }))
    .filter((level): level is { priceUsd: number; quantity: number } => level.priceUsd !== null && level.quantity !== null)
    .map((level) => ({ ...level, totalUsd: level.priceUsd * level.quantity }));
}

export function mapExchangeTrade(raw: TradeData): LiveTrade {
  return {
    id: raw.id,
    symbol: raw.symbol,
    priceUsd: raw.price,
    quantity: raw.quantity,
    occurredAt: raw.time,
    side: raw.isBuyerMaker ? "sell" : "buy",
  };
}

export async function getLiveQuote(symbol: string): Promise<LiveQuoteResult> {
  const baseSymbol = normalizeBaseSymbol(symbol);
  try {
    const result = await fromCache(`quote:${baseSymbol}`, QUOTE_TTL_MS, async () => {
      const resolved = await withRegionalExchangeFallback(
        () => getTickerData(baseSymbol),
        () => getCoinbaseTickerData(baseSymbol),
      );
      return mapExchangeQuote(resolved.value, baseSymbol, resolved.source);
    });
    return { quote: result.value, cachedAt: result.cachedAt, isStale: result.isStale };
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

export async function getLiveCandles(input: { symbol: string; interval: ExchangeInterval; limit: number }): Promise<LiveCandleResult> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  const limit = Math.min(Math.max(Math.floor(input.limit), 20), 200);
  try {
    const result = await fromCache(`candles:${baseSymbol}:${input.interval}:${limit}`, CANDLE_TTL_MS, async () => {
      const resolved = await withRegionalExchangeFallback(
        () => getCandleData(baseSymbol, input.interval, limit),
        () => getCoinbaseCandleData(baseSymbol, input.interval, limit),
      );
      return { source: resolved.source, candles: resolved.value.map((candle) => mapExchangeCandle(candle, input.interval, resolved.source)) };
    });
    return { symbol: result.value.candles[0]?.symbol ?? `${baseSymbol}${result.value.source === "coinbase" ? "-USD" : "USDT"}`, baseSymbol, interval: input.interval, candles: result.value.candles, cachedAt: result.cachedAt, isStale: result.isStale, source: result.value.source };
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

/** Retrieves a bounded candle window from one explicitly selected provider. No fallback is permitted. */
export async function getLiveCandlesFromSource(input: { symbol: string; interval: ExchangeInterval; limit: number; source: ExchangeSource; cacheTtlMs?: number }): Promise<LiveCandleResult> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  const limit = Math.min(Math.max(Math.floor(input.limit), 20), 200);
  const cacheTtlMs = Math.max(ACTIVE_CANDLE_TTL_MS, Math.min(CANDLE_TTL_MS, Math.floor(input.cacheTtlMs ?? CANDLE_TTL_MS)));
  try {
    const result = await fromCache(`candles-source:${input.source}:${baseSymbol}:${input.interval}:${limit}:${cacheTtlMs}`, cacheTtlMs, async () => {
      const raw = input.source === "binance"
        ? await getCandleData(baseSymbol, input.interval, limit)
        : await getCoinbaseCandleData(baseSymbol, input.interval, limit);
      const candles = raw.map((candle) => mapExchangeCandle(candle, input.interval, input.source)).sort((left, right) => left.openTime - right.openTime);
      for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index]!;
        if (!validLiveCandle(candle)) throw new MarketDataError("UNAVAILABLE", "The selected provider returned invalid live OHLCV data.");
        if (index > 0 && candle.openTime <= candles[index - 1]!.openTime) throw new MarketDataError("UNAVAILABLE", "The selected provider returned duplicate or unordered live candle timestamps.");
      }
      return candles;
    });
    return { symbol: result.value[0]?.symbol ?? `${baseSymbol}${input.source === "coinbase" ? "-USD" : "USDT"}`, baseSymbol, interval: input.interval, candles: result.value, cachedAt: result.cachedAt, isStale: result.isStale, source: input.source };
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

/** Retrieves only the provider's latest published candle for a previously selected source. */
export async function getLiveActiveCandle(input: { symbol: string; interval: ExchangeInterval; source: ExchangeSource }): Promise<LiveActiveCandleResult> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  try {
    const result = await fromCache(`active-candle:${input.source}:${baseSymbol}:${input.interval}`, ACTIVE_CANDLE_TTL_MS, async () => {
      const raw = input.source === "binance"
        ? await getCandleData(baseSymbol, input.interval, 2)
        : await getCoinbaseCandleData(baseSymbol, input.interval, 2);
      const candles = raw.map((candle) => mapExchangeCandle(candle, input.interval, input.source)).sort((left, right) => left.openTime - right.openTime);
      for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index]!;
        if (!validLiveCandle(candle)) throw new MarketDataError("UNAVAILABLE", "The selected provider returned invalid active OHLCV data.");
        if (index > 0 && candle.openTime <= candles[index - 1]!.openTime) throw new MarketDataError("UNAVAILABLE", "The selected provider returned duplicate or unordered active candle timestamps.");
      }
      const candle = candles.at(-1);
      if (!candle || !validLiveCandle(candle)) throw new MarketDataError("UNAVAILABLE", "The selected provider did not return a valid active candle.");
      return candle;
    });
    return { symbol: result.value.symbol, baseSymbol, interval: input.interval, source: input.source, candle: result.value, cachedAt: result.cachedAt, isStale: result.isStale };
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

/** Retrieves one real public candle window for a persisted historical simulation dataset; it is intentionally not cached as live data. */
export async function getHistoricalCandles(input: HistoricalCandleRequest): Promise<LiveCandleResult> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  const limit = Math.min(Math.max(Math.floor(input.limit), 60), 300);
  if (!Number.isFinite(input.startTime) || !Number.isFinite(input.endTime) || input.startTime >= input.endTime) {
    throw new MarketDataError("UNAVAILABLE", "A finite ordered historical UTC range is required.");
  }
  try {
    const resolved = await withRegionalExchangeFallback(
      () => getHistoricalCandleData(baseSymbol, input.interval, input.startTime, input.endTime, limit),
      () => getCoinbaseHistoricalCandleData(baseSymbol, input.interval, input.startTime, input.endTime, limit),
    );
    const candles = resolved.value.map((candle) => mapExchangeCandle(candle, input.interval, resolved.source))
      .filter((candle) => candle.openTime >= input.startTime && candle.closeTime < input.endTime)
      .sort((left, right) => left.openTime - right.openTime);
    return { symbol: candles[0]?.symbol ?? `${baseSymbol}${resolved.source === "coinbase" ? "-USD" : "USDT"}`, baseSymbol, interval: input.interval, candles, cachedAt: Date.now(), isStale: false, source: resolved.source };
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

export async function getLiveHistoricalCandlePage(input: HistoricalCandleRequest & { source: ExchangeSource }): Promise<LiveHistoricalCandlePage> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  const providerLimit = providerHistoryPageLimit(input.source, input.interval);
  const limit = Math.min(Math.max(Math.floor(input.limit), 20), providerLimit);
  if (!Number.isFinite(input.startTime) || !Number.isFinite(input.endTime) || input.startTime >= input.endTime) throw new MarketDataError("INVALID_HISTORY_RANGE", "A finite ordered UTC history range is required.");
  if (input.endTime - input.startTime > exchangeIntervalMs(input.interval) * limit) throw new MarketDataError("INVALID_HISTORY_RANGE", `This ${input.source} historical request exceeds the supported ${limit}-candle page range.`);
  const key = `history-page:${input.source}:${baseSymbol}:${input.interval}:${input.startTime}:${input.endTime}:${limit}`;
  try {
    const cached = await fromStrictRangeCache(key, HISTORICAL_PAGE_TTL_MS, async () => {
      const raw = input.source === "binance"
        ? await getHistoricalCandleData(baseSymbol, input.interval, input.startTime, input.endTime, limit)
        : await getCoinbaseHistoricalCandleData(baseSymbol, input.interval, input.startTime, input.endTime, limit);
      const mapped = raw.map((candle) => mapExchangeCandle(candle, input.interval, input.source)).filter((candle) => candle.openTime >= input.startTime && candle.closeTime < input.endTime);
      return analyzeLiveHistoryPage(mapped, { ...input, limit });
    });
    const value = cached.value;
    return { symbol: value.candles[0]?.symbol ?? `${baseSymbol}${input.source === "coinbase" ? "-USD" : "USDT"}`, baseSymbol, interval: input.interval, candles: value.candles, cachedAt: cached.cachedAt, isStale: false, source: input.source, request: { startTime: input.startTime, endTime: input.endTime, limit, source: input.source }, coverage: value.coverage };
  } catch (error) {
    if (error instanceof MarketDataError) throw error;
    throw new MarketDataError("HISTORY_UNAVAILABLE", `Historical ${input.source} candles are unavailable for this requested range.`);
  }
}

export async function getLiveOrderBook(input: { symbol: string; limit: number }): Promise<LiveOrderBookResult> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  try {
    const result = await fromCache(`depth:${baseSymbol}:${input.limit}`, ORDER_BOOK_TTL_MS, async () => {
      const resolved = await withRegionalExchangeFallback(
        () => getOrderBook(baseSymbol, input.limit),
        () => getCoinbaseOrderBook(baseSymbol, input.limit),
      );
      return { source: resolved.source, symbol: resolved.value.symbol, bids: mapOrderBookLevels(resolved.value.bids), asks: mapOrderBookLevels(resolved.value.asks), providerUpdatedAt: Date.now(), providerTimestampOrigin: "fetched" as const };
    });
    return { ...result.value, baseSymbol, cachedAt: result.cachedAt, isStale: result.isStale };
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

export async function getLiveTrades(input: { symbol: string; limit: number }): Promise<LiveTradeResult> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  const limit = Math.min(Math.max(Math.floor(input.limit), 1), 100);
  try {
    const result = await fromCache(`trades:${baseSymbol}:${limit}`, TRADE_TTL_MS, async () => {
      const resolved = await withRegionalExchangeFallback(
        () => getRecentTrades(baseSymbol, limit),
        () => getCoinbaseRecentTrades(baseSymbol, limit),
      );
      return { source: resolved.source, symbol: resolved.value[0]?.symbol ?? `${baseSymbol}${resolved.source === "coinbase" ? "-USD" : "USDT"}`, trades: resolved.value.map(mapExchangeTrade) };
    });
    return { ...result.value, baseSymbol, cachedAt: result.cachedAt, isStale: result.isStale };
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

export async function getLiveTradingContext(input: { symbol: string; interval: ExchangeInterval; candleLimit: number; depthLimit: number; tradeLimit: number }): Promise<LiveTradingContext> {
  const baseSymbol = normalizeBaseSymbol(input.symbol);
  const [quote, candles, orderBook, trades] = await Promise.all([
    getLiveQuote(baseSymbol),
    getLiveCandles({ symbol: baseSymbol, interval: input.interval, limit: input.candleLimit }),
    getLiveOrderBook({ symbol: baseSymbol, limit: input.depthLimit }),
    getLiveTrades({ symbol: baseSymbol, limit: input.tradeLimit }),
  ]);
  return {
    symbol: quote.quote.symbol,
    baseSymbol,
    quote,
    candles,
    orderBook,
    trades,
    cachedAt: Math.min(quote.cachedAt, candles.cachedAt, orderBook.cachedAt, trades.cachedAt),
    isStale: quote.isStale || candles.isStale || orderBook.isStale || trades.isStale,
    source: quote.quote.source === candles.source && candles.source === orderBook.source && orderBook.source === trades.source ? quote.quote.source : "mixed",
  };
}

export function serializeMarketDataError(error: unknown) {
  if (error instanceof MarketDataError) {
    return { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds ?? null };
  }
  return { code: "UNAVAILABLE" as const, message: "Live market data is temporarily unavailable. Please retry shortly.", retryAfterSeconds: null };
}
