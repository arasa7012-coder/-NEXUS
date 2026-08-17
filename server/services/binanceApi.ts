import axios from 'axios';

const BINANCE_API_URL = 'https://api.binance.com/api/v3';
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';

export interface CandleData {
  symbol: string;
  timeframe: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteAssetVolume: number;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: number;
  takerBuyQuoteAssetVolume: number;
}

export interface TickerData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
  providerUpdatedAt?: number;
}

export interface OrderBookData {
  symbol: string;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

export interface TradeData {
  id: number;
  symbol: string;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

function isRegionalAvailabilityRestriction(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const payload = error.response?.data;
  const message = typeof payload === "string"
    ? payload
    : typeof payload?.msg === "string"
      ? payload.msg
      : typeof payload?.message === "string"
        ? payload.message
        : "";
  return error.response?.status === 451 || /restricted location|eligibility/i.test(message);
}

export function shouldReportExchangeFailure(error: unknown): boolean {
  return !isRegionalAvailabilityRestriction(error);
}

function reportExchangeFailure(message: string, error: unknown) {
  // A verified regional restriction is expected to be handled by the unified
  // market-data adapter's Coinbase fallback. Logging it as an application error
  // would create a false operational alert after the fallback succeeds.
  if (shouldReportExchangeFailure(error)) console.error(message, error);
}

/**
 * Fetch ticker data for a cryptocurrency pair
 */
export async function getTickerData(symbol: string): Promise<TickerData> {
  try {
    const response = await axios.get(`${BINANCE_API_URL}/ticker/24hr`, {
      params: { symbol: `${symbol}USDT` },
    });

    return {
      symbol: response.data.symbol,
      price: parseFloat(response.data.lastPrice),
      priceChange: parseFloat(response.data.priceChange),
      priceChangePercent: parseFloat(response.data.priceChangePercent),
      volume: parseFloat(response.data.volume),
      quoteVolume: parseFloat(response.data.quoteAssetVolume),
      highPrice: parseFloat(response.data.highPrice),
      lowPrice: parseFloat(response.data.lowPrice),
      providerUpdatedAt: Number.isFinite(Number(response.data.closeTime)) ? Number(response.data.closeTime) : undefined,
    };
  } catch (error) {
    reportExchangeFailure(`Error fetching ticker for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Fetch candlestick data
 */
export async function getCandleData(
  symbol: string,
  interval: string = '1h',
  limit: number = 100
): Promise<CandleData[]> {
  try {
    const response = await axios.get(`${BINANCE_API_URL}/klines`, {
      params: {
        symbol: `${symbol}USDT`,
        interval,
        limit,
      },
    });

    return response.data.map((candle: any[]) => ({
      symbol: `${symbol}USDT`,
      timeframe: interval,
      openTime: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: candle[6],
      quoteAssetVolume: parseFloat(candle[7]),
      numberOfTrades: candle[8],
      takerBuyBaseAssetVolume: parseFloat(candle[9]),
      takerBuyQuoteAssetVolume: parseFloat(candle[10]),
    }));
  } catch (error) {
    reportExchangeFailure(`Error fetching candles for ${symbol}:`, error);
    throw error;
  }
}

/** Fetches a bounded UTC candle window for historical paper simulation. */
export async function getHistoricalCandleData(symbol: string, interval: string, startTime: number, endTime: number, limit: number): Promise<CandleData[]> {
  try {
    const response = await axios.get(`${BINANCE_API_URL}/klines`, { params: { symbol: `${symbol}USDT`, interval, startTime, endTime, limit } });
    return response.data.map((candle: any[]) => ({ symbol: `${symbol}USDT`, timeframe: interval, openTime: candle[0], open: parseFloat(candle[1]), high: parseFloat(candle[2]), low: parseFloat(candle[3]), close: parseFloat(candle[4]), volume: parseFloat(candle[5]), closeTime: candle[6], quoteAssetVolume: parseFloat(candle[7]), numberOfTrades: candle[8], takerBuyBaseAssetVolume: parseFloat(candle[9]), takerBuyQuoteAssetVolume: parseFloat(candle[10]) }));
  } catch (error) {
    reportExchangeFailure(`Error fetching historical candles for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Fetch order book data
 */
export async function getOrderBook(symbol: string, limit: number = 20): Promise<OrderBookData> {
  try {
    const response = await axios.get(`${BINANCE_API_URL}/depth`, {
      params: {
        symbol: `${symbol}USDT`,
        limit,
      },
    });

    return {
      symbol: response.data.symbol,
      bids: response.data.bids,
      asks: response.data.asks,
    };
  } catch (error) {
    reportExchangeFailure(`Error fetching order book for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Fetch recent trades
 */
export async function getRecentTrades(symbol: string, limit: number = 20): Promise<TradeData[]> {
  try {
    const response = await axios.get(`${BINANCE_API_URL}/trades`, {
      params: {
        symbol: `${symbol}USDT`,
        limit,
      },
    });

    return response.data.map((trade: any) => ({
      id: trade.id,
      symbol: `${symbol}USDT`,
      price: parseFloat(trade.price),
      quantity: parseFloat(trade.qty),
      time: trade.time,
      isBuyerMaker: trade.isBuyerMaker,
    }));
  } catch (error) {
    reportExchangeFailure(`Error fetching recent trades for ${symbol}:`, error);
    throw error;
  }
}

/**
 * Get top cryptocurrencies by market cap
 */
export async function getTopCryptocurrencies(limit: number = 10): Promise<TickerData[]> {
  try {
    const topSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC'];
    const data = await Promise.all(
      topSymbols.slice(0, limit).map((symbol) => getTickerData(symbol))
    );
    return data;
  } catch (error) {
    console.error('Error fetching top cryptocurrencies:', error);
    throw error;
  }
}

/**
 * Calculate 24h price change
 */
export function calculatePriceChange(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}

/**
 * Format price for display
 */
export function formatPrice(price: number, decimals: number = 2): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Get price change color (for UI)
 */
export function getPriceChangeColor(change: number): 'green' | 'red' {
  return change >= 0 ? 'green' : 'red';
}
