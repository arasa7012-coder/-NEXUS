import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { intelligenceTimeframes } from "../intelligence/types";
import {
  getAssetIntelligence,
  getLiveFrameIntelligence,
  getMarketIntelligenceOverview,
  getOpportunityScanner,
  supportedIntelligenceAssetIds,
} from "../services/marketIntelligence";
import { serializeMarketDataError } from "../services/marketData";

const assetIdSchema = z.enum(supportedIntelligenceAssetIds);
const timeframeSchema = z.enum(intelligenceTimeframes);
const trendSchema = z.enum(["UPTREND", "DOWNTREND", "RANGE", "MIXED", "UNAVAILABLE"]);

export const intelligenceRouter = router({
  asset: publicProcedure
    .input(z.object({
      assetId: assetIdSchema,
      timeframes: z.array(timeframeSchema).min(1).max(5).optional(),
      preferredTimeframe: timeframeSchema.optional(),
    }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getAssetIntelligence(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  liveFrame: publicProcedure
    .input(z.object({ assetId: assetIdSchema, timeframe: timeframeSchema, source: z.enum(["binance", "coinbase"]) }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getLiveFrameIntelligence(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  scanner: publicProcedure
    .input(z.object({
      assetIds: z.array(assetIdSchema).min(1).max(supportedIntelligenceAssetIds.length).optional(),
      timeframe: timeframeSchema.default("4h"),
      minimumOpportunity: z.number().min(0).max(100).default(0),
      maximumRisk: z.number().min(0).max(100).default(100),
      minimumVolumeUsd: z.number().min(0).max(1_000_000_000_000).default(0),
      trend: trendSchema.optional(),
      limit: z.number().int().min(1).max(supportedIntelligenceAssetIds.length).default(supportedIntelligenceAssetIds.length),
    }))
    .query(async ({ input }) => {
      try {
        return { success: true as const, data: await getOpportunityScanner(input), error: null };
      } catch (error) {
        return { success: false as const, data: null, error: serializeMarketDataError(error) };
      }
    }),

  overview: publicProcedure.query(async () => {
    try {
      return { success: true as const, data: await getMarketIntelligenceOverview(), error: null };
    } catch (error) {
      return { success: false as const, data: null, error: serializeMarketDataError(error) };
    }
  }),
});
