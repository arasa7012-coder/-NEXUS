import { publicProcedure, router } from '../_core/trpc';
import {
  getTickerData,
  getCandleData,
  getOrderBook,
  getRecentTrades,
  getTopCryptocurrencies,
} from '../services/binanceApi';
import { z } from 'zod';

export const binanceRouter = router({
  /**
   * Get ticker data for a specific cryptocurrency
   */
  getTicker: publicProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ input }) => {
      try {
        const data = await getTickerData(input.symbol);
        return { success: true, data };
      } catch (error) {
        console.error('Error in getTicker:', error);
        return {
          success: false,
          error: 'Failed to fetch ticker data',
          data: null,
        };
      }
    }),

  /**
   * Get candlestick data
   */
  getCandles: publicProcedure
    .input(
      z.object({
        symbol: z.string(),
        interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('1h'),
        limit: z.number().default(100),
      })
    )
    .query(async ({ input }) => {
      try {
        const data = await getCandleData(input.symbol, input.interval, input.limit);
        return { success: true, data };
      } catch (error) {
        console.error('Error in getCandles:', error);
        return {
          success: false,
          error: 'Failed to fetch candle data',
          data: null,
        };
      }
    }),

  /**
   * Get order book data
   */
  getOrderBook: publicProcedure
    .input(z.object({ symbol: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      try {
        const data = await getOrderBook(input.symbol, input.limit);
        return { success: true, data };
      } catch (error) {
        console.error('Error in getOrderBook:', error);
        return {
          success: false,
          error: 'Failed to fetch order book',
          data: null,
        };
      }
    }),

  /**
   * Get recent trades
   */
  getRecentTrades: publicProcedure
    .input(z.object({ symbol: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      try {
        const data = await getRecentTrades(input.symbol, input.limit);
        return { success: true, data };
      } catch (error) {
        console.error('Error in getRecentTrades:', error);
        return {
          success: false,
          error: 'Failed to fetch recent trades',
          data: null,
        };
      }
    }),

  /**
   * Get top cryptocurrencies
   */
  getTopCryptos: publicProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ input }) => {
      try {
        const data = await getTopCryptocurrencies(input.limit);
        return { success: true, data };
      } catch (error) {
        console.error('Error in getTopCryptos:', error);
        return {
          success: false,
          error: 'Failed to fetch top cryptocurrencies',
          data: null,
        };
      }
    }),

  /**
   * Get multiple tickers at once
   */
  getMultipleTickers: publicProcedure
    .input(z.object({ symbols: z.array(z.string()) }))
    .query(async ({ input }) => {
      try {
        const data = await Promise.all(
          input.symbols.map((symbol) => getTickerData(symbol))
        );
        return { success: true, data };
      } catch (error) {
        console.error('Error in getMultipleTickers:', error);
        return {
          success: false,
          error: 'Failed to fetch multiple tickers',
          data: null,
        };
      }
    }),
});
