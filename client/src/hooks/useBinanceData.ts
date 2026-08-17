import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

export interface CryptoPrice {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  highPrice: number;
  lowPrice: number;
}

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

/**
 * Hook to fetch ticker data for a cryptocurrency
 */
export function useBinanceTicker(symbol: string) {
  const { data, isLoading, error, refetch } = trpc.binance.getTicker.useQuery(
    { symbol },
    {
      refetchInterval: 5000, // Refetch every 5 seconds
      staleTime: 4000, // Consider data stale after 4 seconds
    }
  );

  return {
    ticker: data?.data,
    isLoading,
    error: error?.message,
    refetch,
  };
}

/**
 * Hook to fetch candlestick data
 */
export function useBinanceCandles(
  symbol: string,
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h',
  limit: number = 100
) {
  const { data, isLoading, error, refetch } = trpc.binance.getCandles.useQuery(
    { symbol, interval, limit },
    {
      refetchInterval: 10000, // Refetch every 10 seconds
      staleTime: 9000,
    }
  );

  return {
    candles: data?.data || [],
    isLoading,
    error: error?.message,
    refetch,
  };
}

/**
 * Hook to fetch order book data
 */
export function useBinanceOrderBook(symbol: string, limit: number = 20) {
  const { data, isLoading, error, refetch } = trpc.binance.getOrderBook.useQuery(
    { symbol, limit },
    {
      refetchInterval: 3000, // Refetch every 3 seconds
      staleTime: 2000,
    }
  );

  return {
    orderBook: data?.data,
    isLoading,
    error: error?.message,
    refetch,
  };
}

/**
 * Hook to fetch recent trades
 */
export function useBinanceRecentTrades(symbol: string, limit: number = 20) {
  const { data, isLoading, error, refetch } = trpc.binance.getRecentTrades.useQuery(
    { symbol, limit },
    {
      refetchInterval: 2000, // Refetch every 2 seconds
      staleTime: 1000,
    }
  );

  return {
    trades: data?.data || [],
    isLoading,
    error: error?.message,
    refetch,
  };
}

/**
 * Hook to fetch top cryptocurrencies
 */
export function useBinanceTopCryptos(limit: number = 10) {
  const { data, isLoading, error, refetch } = trpc.binance.getTopCryptos.useQuery(
    { limit },
    {
      refetchInterval: 15000, // Refetch every 15 seconds
      staleTime: 14000,
    }
  );

  return {
    cryptos: data?.data || [],
    isLoading,
    error: error?.message,
    refetch,
  };
}

/**
 * Hook to fetch multiple tickers
 */
export function useBinanceMultipleTickers(symbols: string[]) {
  const { data, isLoading, error, refetch } = trpc.binance.getMultipleTickers.useQuery(
    { symbols },
    {
      refetchInterval: 5000,
      staleTime: 4000,
      enabled: symbols.length > 0,
    }
  );

  return {
    tickers: data?.data || [],
    isLoading,
    error: error?.message,
    refetch,
  };
}

/**
 * Hook to auto-refresh data with WebSocket simulation
 */
export function useBinanceAutoRefresh(symbol: string, interval: number = 5000) {
  const { refetch } = trpc.binance.getTicker.useQuery(
    { symbol },
    { enabled: false } // Don't fetch on mount
  );

  useEffect(() => {
    const timer = setInterval(() => {
      refetch();
    }, interval);

    return () => clearInterval(timer);
  }, [symbol, interval, refetch]);
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
 * Get price change color
 */
export function getPriceChangeColor(change: number): 'text-green-500' | 'text-red-500' {
  return change >= 0 ? 'text-green-500' : 'text-red-500';
}

/**
 * Format volume for display
 */
export function formatVolume(volume: number): string {
  if (volume >= 1e9) {
    return `$${(volume / 1e9).toFixed(2)}B`;
  }
  if (volume >= 1e6) {
    return `$${(volume / 1e6).toFixed(2)}M`;
  }
  if (volume >= 1e3) {
    return `$${(volume / 1e3).toFixed(2)}K`;
  }
  return `$${volume.toFixed(2)}`;
}
