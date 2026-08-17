import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  createPortfolio,
  getUserPortfolios,
  getPortfolioAssets,
  addAssetToPortfolio,
  updatePortfolioAsset,
  deletePortfolioAsset,
  deletePortfolio,
} from "../db";

export const portfolioRouter = router({
  // Get all portfolios for current user
  getPortfolios: protectedProcedure.query(async ({ ctx }) => {
    return getUserPortfolios(ctx.user.id);
  }),

  // Create new portfolio
  createPortfolio: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createPortfolio(ctx.user.id, input.name, input.description);
    }),

  // Get portfolio assets
  getAssets: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .query(async ({ input }) => {
      return getPortfolioAssets(input.portfolioId);
    }),

  // Add asset to portfolio
  addAsset: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        cryptoId: z.number(),
        quantity: z.string(),
        purchasePrice: z.string(),
        purchaseDate: z.date(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return addAssetToPortfolio(
        input.portfolioId,
        input.cryptoId,
        input.quantity,
        input.purchasePrice,
        input.purchaseDate,
        input.notes
      );
    }),

  // Update asset
  updateAsset: protectedProcedure
    .input(
      z.object({
        assetId: z.number(),
        quantity: z.string().optional(),
        purchasePrice: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return updatePortfolioAsset(
        input.assetId,
        input.quantity,
        input.purchasePrice,
        input.notes
      );
    }),

  // Delete asset
  deleteAsset: protectedProcedure
    .input(z.object({ assetId: z.number() }))
    .mutation(async ({ input }) => {
      return deletePortfolioAsset(input.assetId);
    }),

  // Delete portfolio
  deletePortfolio: protectedProcedure
    .input(z.object({ portfolioId: z.number() }))
    .mutation(async ({ input }) => {
      return deletePortfolio(input.portfolioId);
    }),
});
