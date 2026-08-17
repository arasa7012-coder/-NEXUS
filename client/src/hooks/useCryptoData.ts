import { useState, useEffect, useCallback } from "react";

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  high24h: number;
  low24h: number;
  marketCap?: number;
}

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface UseCryptoDataReturn {
  prices: Record<string, CryptoPrice>;
  candles: CandleData[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const BINANCE_API = "https://api.binance.com/api/v3";

/**
 * Hook to fetch real cryptocurrency data from Binance API
 */
export function useCryptoData(symbols: string[] = ["BTC", "ETH", "BNB", "SOL"]): UseCryptoDataReturn {
  const [prices, setPrices] = useState<Record<string, CryptoPrice>>({});
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const priceData: Record<string, CryptoPrice> = {};

      for (const symbol of symbols) {
        try {
          const response = await fetch(
            `${BINANCE_API}/ticker/24hr?symbol=${symbol}USDT`
          );
          const data = await response.json();

          priceData[symbol] = {
            symbol,
            price: parseFloat(data.lastPrice),
            change24h: parseFloat(data.priceChangePercent),
            volume: parseFloat(data.quoteAssetVolume),
            high24h: parseFloat(data.highPrice),
            low24h: parseFloat(data.lowPrice),
            marketCap: undefined,
          };
        } catch (err) {
          console.error(`Failed to fetch ${symbol} price:`, err);
        }
      }

      setPrices(priceData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch prices";
      setError(message);
      console.error("Error fetching prices:", err);
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  const fetchCandles = useCallback(
    async (symbol: string = "BTC", interval: string = "1h", limit: number = 100) => {
      try {
        const response = await fetch(
          `${BINANCE_API}/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`
        );
        const data = await response.json();

        const candleData: CandleData[] = data.map((candle: any[]) => ({
          timestamp: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[7]),
        }));

        setCandles(candleData);
      } catch (err) {
        console.error("Error fetching candles:", err);
        setError("Failed to fetch candle data");
      }
    },
    []
  );

  // Fetch prices on mount and set up interval
  useEffect(() => {
    fetchPrices();

    // Refresh prices every 10 seconds
    const interval = setInterval(fetchPrices, 10000);

    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Fetch initial candles
  useEffect(() => {
    fetchCandles("BTC", "1h", 100);
  }, [fetchCandles]);

  return {
    prices,
    candles,
    loading,
    error,
    refetch: fetchPrices,
  };
}
