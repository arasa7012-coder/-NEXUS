import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  exchangeIntervals,
  getAssetMarketDetail,
  getLiveHistoricalCandlePage,
  getLiveActiveCandle,
  getLiveCandles,
  getLiveOrderBook,
  getLiveQuote,
  getLiveTrades,
  getLiveTradingContext,
  getMarketDirectory,
  marketOrders,
  searchMarketDirectory,
  serializeMarketDataError,
} from "../services/marketData";
import { getChartViewPreference, saveChartViewPreference } from "../services/chartViewPreferences";
import { z } from "zod";

const marketOrderSchema = z.enum(marketOrders);
const exchangeSymbolSchema = z.string().trim().regex(/^[a-z0-9]{2,15}$/i).max(15);
const orderBookLimitSchema = z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(20);
const chartViewKeySchema = z.object({ assetSymbol: exchangeSymbolSchema, source: z.enum(["binance", "coinbase"]), interval: z.enum(exchangeIntervals) });

export const marketDataRouter = router({
  markets: publicProcedure
    .input(z.object({
      page: z.number().int().min(1).max(1_000).default(1),
      perPage: z.number().int().min(10).max(100).default(50),
      order: marketOrderSchema.default("market_cap_desc"),
    }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getMarketDirectory(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  search: publicProcedure
    .input(z.object({ query: z.string().trim().min(2).max(80) }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await searchMarketDirectory(input.query), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  asset: publicProcedure
    .input(z.object({ id: z.string().trim().regex(/^[a-z0-9-]+$/i).max(120) }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getAssetMarketDetail(input.id), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  quote: publicProcedure
    .input(z.object({ symbol: exchangeSymbolSchema }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveQuote(input.symbol), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  candles: publicProcedure
    .input(z.object({ symbol: exchangeSymbolSchema, interval: z.enum(exchangeIntervals).default("1h"), limit: z.number().int().min(20).max(200).default(80) }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveCandles(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  activeCandle: publicProcedure
    .input(z.object({ symbol: exchangeSymbolSchema, interval: z.enum(exchangeIntervals), source: z.enum(["binance", "coinbase"]) }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveActiveCandle(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  liveHistoryPage: protectedProcedure
    .input(z.object({ symbol: exchangeSymbolSchema, interval: z.enum(exchangeIntervals), source: z.enum(["binance", "coinbase"]), startTime: z.number().int().positive(), endTime: z.number().int().positive(), limit: z.number().int().min(20).max(300).default(120) }).refine((input) => input.startTime < input.endTime, { message: "Historical end time must be after start time.", path: ["endTime"] }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveHistoricalCandlePage(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  getChartViewPreference: protectedProcedure
    .input(chartViewKeySchema)
    .query(({ ctx, input }) => getChartViewPreference(ctx.user.id, input)),

  saveChartViewPreference: protectedProcedure
    .input(chartViewKeySchema.extend({ requestedStart: z.number().int().positive(), requestedEnd: z.number().int().positive(), visibleCandles: z.number().int().min(8).max(300) }).refine((input) => input.requestedStart < input.requestedEnd, { message: "Saved chart end must be after its start.", path: ["requestedEnd"] }))
    .mutation(({ ctx, input }) => saveChartViewPreference(ctx.user.id, input)),

  orderBook: publicProcedure
    .input(z.object({ symbol: exchangeSymbolSchema, limit: orderBookLimitSchema }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveOrderBook(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  trades: publicProcedure
    .input(z.object({ symbol: exchangeSymbolSchema, limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveTrades(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  tradingContext: publicProcedure
    .input(z.object({
      symbol: exchangeSymbolSchema,
      interval: z.enum(exchangeIntervals).default("1h"),
      candleLimit: z.number().int().min(20).max(200).default(80),
      depthLimit: orderBookLimitSchema,
      tradeLimit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveTradingContext(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),
});
