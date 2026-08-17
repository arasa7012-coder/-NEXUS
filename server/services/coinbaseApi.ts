import axios from "axios";
import type { CandleData, OrderBookData, TickerData, TradeData } from "./binanceApi";
import type { ExchangeInterval } from "./marketData";

const COINBASE_EXCHANGE_URL = "https://api.exchange.coinbase.com";
const REQUEST_CONFIG = {
  timeout: 8_000,
  headers: { accept: "application/json", "user-agent": "NexusTradingTerminal/1.2 (read-only market data)" },
};

interface CoinbaseTickerResponse {
  price?: string;
  time?: string;
  volume?: string;
}

interface CoinbaseStatsResponse {
  open?: string;
  high?: string;
  low?: string;
  volume?: string;
  last?: string;
}

interface CoinbaseBookResponse {
  bids?: Array<[string, string, string]>;
  asks?: Array<[string, string, string]>;
}

interface CoinbaseTradeResponse {
  trade_id?: number;
  price?: string;
  size?: string;
  time?: string;
  side?: "buy" | "sell";
}

type CoinbaseCandleResponse = [number, number | string, number | string, number | string, number | string, number | string];

function productId(symbol: string): string {
  return `${symbol.trim().toUpperCase()}-USD`;
}

function asFiniteNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Coinbase returned an invalid ${field} value.`);
  return parsed;
}

function candleGranularity(interval: ExchangeInterval): number {
  switch (interval) {
    case "1m": return 60;
    case "5m": return 300;
    case "15m": return 900;
    case "1h":
    case "4h": return 3600;
    case "1d": return 86400;
  }
}

function aggregateFourHourCandles(candles: CandleData[], limit: number): CandleData[] {
  const bucketMs = 4 * 60 * 60 * 1000;
  const buckets = new Map<number, CandleData>();
  for (const candle of candles) {
    const bucketStart = Math.floor(candle.openTime / bucketMs) * bucketMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, { ...candle, timeframe: "4h", openTime: bucketStart, closeTime: bucketStart + bucketMs - 1 });
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.closeTime = bucketStart + bucketMs - 1;
    existing.volume += candle.volume;
    existing.quoteAssetVolume += candle.quoteAssetVolume;
  }
  return Array.from(buckets.values()).sort((left, right) => left.openTime - right.openTime).slice(-limit);
}

export async function getCoinbaseTickerData(symbol: string): Promise<TickerData> {
  const product = productId(symbol);
  const [tickerResponse, statsResponse] = await Promise.all([
    axios.get<CoinbaseTickerResponse>(`${COINBASE_EXCHANGE_URL}/products/${product}/ticker`, REQUEST_CONFIG),
    axios.get<CoinbaseStatsResponse>(`${COINBASE_EXCHANGE_URL}/products/${product}/stats`, REQUEST_CONFIG),
  ]);
  const price = asFiniteNumber(tickerResponse.data.price ?? statsResponse.data.last, "price");
  const open = asFiniteNumber(statsResponse.data.open, "24-hour open");
  const volume = asFiniteNumber(statsResponse.data.volume ?? tickerResponse.data.volume, "24-hour volume");
  const providerUpdatedAt = Date.parse(tickerResponse.data.time ?? "");
  return {
    symbol: product,
    price,
    priceChange: price - open,
    priceChangePercent: open === 0 ? 0 : ((price - open) / open) * 100,
    volume,
    quoteVolume: volume * price,
    highPrice: asFiniteNumber(statsResponse.data.high, "24-hour high"),
    lowPrice: asFiniteNumber(statsResponse.data.low, "24-hour low"),
    providerUpdatedAt: Number.isFinite(providerUpdatedAt) ? providerUpdatedAt : undefined,
  };
}

export async function getCoinbaseCandleData(symbol: string, interval: ExchangeInterval, limit: number): Promise<CandleData[]> {
  const product = productId(symbol);
  const granularity = candleGranularity(interval);
  const requestedCount = Math.min(interval === "4h" ? limit * 4 : limit, 300);
  const end = Date.now();
  const start = end - requestedCount * granularity * 1_000;
  const response = await axios.get<CoinbaseCandleResponse[]>(`${COINBASE_EXCHANGE_URL}/products/${product}/candles`, {
    ...REQUEST_CONFIG,
    params: { granularity, start: new Date(start).toISOString(), end: new Date(end).toISOString() },
  });
  const candles = response.data
    .map(([time, low, high, open, close, volume]) => ({
      symbol: product,
      timeframe: interval === "4h" ? "1h" : interval,
      openTime: time * 1_000,
      open: asFiniteNumber(open, "candle open"),
      high: asFiniteNumber(high, "candle high"),
      low: asFiniteNumber(low, "candle low"),
      close: asFiniteNumber(close, "candle close"),
      volume: asFiniteNumber(volume, "candle volume"),
      closeTime: time * 1_000 + granularity * 1_000 - 1,
      quoteAssetVolume: asFiniteNumber(volume, "candle volume") * asFiniteNumber(close, "candle close"),
      numberOfTrades: 0,
      takerBuyBaseAssetVolume: 0,
      takerBuyQuoteAssetVolume: 0,
    }))
    .sort((left, right) => left.openTime - right.openTime);
  return interval === "4h" ? aggregateFourHourCandles(candles, limit) : candles.slice(-limit);
}

/** Coinbase public endpoint permits at most 300 base candles per bounded historical query. */
export async function getCoinbaseHistoricalCandleData(symbol: string, interval: ExchangeInterval, startTime: number, endTime: number, limit: number): Promise<CandleData[]> {
  if (limit > 300) throw new Error("Coinbase historical candle windows are limited to 300 candles.");
  const product = productId(symbol); const granularity = candleGranularity(interval);
  const response = await axios.get<CoinbaseCandleResponse[]>(`${COINBASE_EXCHANGE_URL}/products/${product}/candles`, { ...REQUEST_CONFIG, params: { granularity, start: new Date(startTime).toISOString(), end: new Date(endTime).toISOString() } });
  const candles = response.data.map(([time, low, high, open, close, volume]) => ({ symbol: product, timeframe: interval === "4h" ? "1h" : interval, openTime: time * 1_000, open: asFiniteNumber(open, "candle open"), high: asFiniteNumber(high, "candle high"), low: asFiniteNumber(low, "candle low"), close: asFiniteNumber(close, "candle close"), volume: asFiniteNumber(volume, "candle volume"), closeTime: time * 1_000 + granularity * 1_000 - 1, quoteAssetVolume: asFiniteNumber(volume, "candle volume") * asFiniteNumber(close, "candle close"), numberOfTrades: 0, takerBuyBaseAssetVolume: 0, takerBuyQuoteAssetVolume: 0 })).sort((left, right) => left.openTime - right.openTime).filter((candle) => candle.openTime >= startTime && candle.closeTime < endTime);
  return interval === "4h" ? aggregateFourHourCandles(candles, limit) : candles.slice(-limit);
}

export async function getCoinbaseOrderBook(symbol: string, limit: number): Promise<OrderBookData> {
  const product = productId(symbol);
  const response = await axios.get<CoinbaseBookResponse>(`${COINBASE_EXCHANGE_URL}/products/${product}/book`, {
    ...REQUEST_CONFIG,
    params: { level: 2 },
  });
  const normalize = (levels: Array<[string, string, string]> | undefined) => (levels ?? []).slice(0, limit).map(([price, size]) => [price, size] as [string, string]);
  return { symbol: product, bids: normalize(response.data.bids), asks: normalize(response.data.asks) };
}

export async function getCoinbaseRecentTrades(symbol: string, limit: number): Promise<TradeData[]> {
  const product = productId(symbol);
  const response = await axios.get<CoinbaseTradeResponse[]>(`${COINBASE_EXCHANGE_URL}/products/${product}/trades`, {
    ...REQUEST_CONFIG,
    params: { limit },
  });
  return response.data.slice(0, limit).map((trade) => ({
    id: asFiniteNumber(trade.trade_id, "trade id"),
    symbol: product,
    price: asFiniteNumber(trade.price, "trade price"),
    quantity: asFiniteNumber(trade.size, "trade size"),
    time: Date.parse(trade.time ?? "") || Date.now(),
    isBuyerMaker: trade.side === "buy",
  }));
}
