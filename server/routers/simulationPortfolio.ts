import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { MarketDataError } from "../services/marketData";
import {
  SimulationPortfolioError,
  getSimulationPortfolioState,
  recordSimulationOrder,
} from "../services/simulationPortfolio";

const orderInput = z.object({
  symbol: z.string().trim().min(2).max(15),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit", "stop"]),
  quantity: z.number().finite().positive().max(1_000_000_000),
});

function rethrowSimulationError(error: unknown): never {
  if (error instanceof SimulationPortfolioError) {
    const code = error.code === "UNAVAILABLE" ? "PRECONDITION_FAILED" : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message });
  }
  if (error instanceof MarketDataError) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
  }
  throw error;
}

export const simulationPortfolioRouter = router({
  getState: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getSimulationPortfolioState(ctx.user.id);
    } catch (error) {
      return rethrowSimulationError(error);
    }
  }),

  confirmOrder: protectedProcedure.input(orderInput).mutation(async ({ ctx, input }) => {
    try {
      return await recordSimulationOrder({ userId: ctx.user.id, ...input });
    } catch (error) {
      return rethrowSimulationError(error);
    }
  }),
});
