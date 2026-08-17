import { z } from "zod";
import { goldAsset } from "../market/assets";
import { getMarketDataProvider } from "../market/providers/registry";
import { marketDataTimeframes, serializeMarketProviderError } from "../market/providers/types";
import { addGoldToMarketWatchlist, listMarketWatchlist, removeGoldFromMarketWatchlist } from "../services/marketWatchlist";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const goldInput = z.object({ assetId: z.literal("xau-usd").default("xau-usd") });

export const commodityMarketRouter = router({
  asset: publicProcedure.input(goldInput).query(() => ({ asset: goldAsset })),
  capabilities: publicProcedure.input(goldInput).query(async () => {
    try { return { success: true as const, data: await getMarketDataProvider().getCapabilities(goldAsset), error: null }; }
    catch (error) { return { success: false as const, data: null, error: serializeMarketProviderError(error) }; }
  }),
  quote: publicProcedure.input(goldInput).query(async () => {
    try { return { success: true as const, data: await getMarketDataProvider().getQuote(goldAsset), error: null }; }
    catch (error) { return { success: false as const, data: null, error: serializeMarketProviderError(error) }; }
  }),
  candles: publicProcedure.input(goldInput.extend({ timeframe: z.enum(marketDataTimeframes), limit: z.number().int().min(5).max(200).default(80) })).query(async ({ input }) => {
    try { return { success: true as const, data: await getMarketDataProvider().getCandles({ asset: goldAsset, timeframe: input.timeframe, limit: input.limit }), error: null }; }
    catch (error) { return { success: false as const, data: null, error: serializeMarketProviderError(error) }; }
  }),
  watchlist: protectedProcedure.query(({ ctx }) => listMarketWatchlist(ctx.user.id)),
  addGoldToWatchlist: protectedProcedure.mutation(({ ctx }) => addGoldToMarketWatchlist(ctx.user.id)),
  removeGoldFromWatchlist: protectedProcedure.mutation(({ ctx }) => removeGoldFromMarketWatchlist(ctx.user.id)),
});
