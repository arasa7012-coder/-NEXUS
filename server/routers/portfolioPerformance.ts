import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  calculatePortfolioPerformance,
  getPortfolioHistory,
  getPortfolioAllocation,
  getPortfolioStats,
  createPortfolioSnapshot,
  PortfolioPerformance,
} from "../services/portfolioAnalysis";

export const portfolioPerformanceRouter = router({
  // Get portfolio performance
  getPerformance: protectedProcedure
    .input(z.object({ portfolioId: z.number(), currentPrices: z.record(z.string(), z.number()) }))
    .query(async ({ input }) => {
      return calculatePortfolioPerformance(input.portfolioId, input.currentPrices);
    }),

  // Get portfolio history
  getHistory: protectedProcedure
    .input(z.object({ portfolioId: z.number(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      return getPortfolioHistory(input.portfolioId, input.days);
    }),

  // Get portfolio allocation
  getAllocation: protectedProcedure
    .input(z.object({ portfolioId: z.number(), currentPrices: z.record(z.string(), z.number()) }))
    .query(async ({ input }) => {
      return getPortfolioAllocation(input.portfolioId, input.currentPrices);
    }),

  // Get complete portfolio stats
  getStats: protectedProcedure
    .input(z.object({ portfolioId: z.number(), currentPrices: z.record(z.string(), z.number()) }))
    .query(async ({ input }) => {
      return getPortfolioStats(input.portfolioId, input.currentPrices);
    }),

  // Create snapshot
  createSnapshot: protectedProcedure
    .input(
      z.object({
        portfolioId: z.number(),
        currentPrices: z.record(z.string(), z.number()),
      })
    )
    .mutation(async ({ input }) => {
      const performance = await calculatePortfolioPerformance(
        input.portfolioId,
        input.currentPrices
      );
      return createPortfolioSnapshot(input.portfolioId, performance);
    }),
});
