import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { alerts, aiPredictions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const alertsRouter = router({
  // Create a new alert
  create: protectedProcedure
    .input(
      z.object({
        cryptoId: z.number(),
        type: z.enum(["price_level", "ta_signal", "ai_signal"]),
        condition: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(alerts).values({
        userId: ctx.user.id,
        cryptoId: input.cryptoId,
        type: input.type,
        condition: input.condition,
        isActive: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: true };
    }),

  // Get user's alerts
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return await db
      .select()
      .from(alerts)
      .where(eq(alerts.userId, ctx.user.id));
  }),

  // Update alert
  update: protectedProcedure
    .input(
      z.object({
        alertId: z.number(),
        isActive: z.number().optional(),
        condition: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: any = {};
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.condition !== undefined) updateData.condition = input.condition;
      updateData.updatedAt = new Date();

      await db
        .update(alerts)
        .set(updateData)
        .where(and(eq(alerts.id, input.alertId), eq(alerts.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete alert
  delete: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(alerts)
        .where(
          and(eq(alerts.id, input.alertId), eq(alerts.userId, ctx.user.id))
        );

      return { success: true };
    }),

  // Get recent AI predictions
  recentPredictions: publicProcedure
    .input(
      z.object({
        cryptoId: z.number(),
        limit: z.number().default(10),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return await db
        .select()
        .from(aiPredictions)
        .where(eq(aiPredictions.cryptoId, input.cryptoId))
        .limit(input.limit);
    }),

  // Store AI prediction.
  // SECURITY: was publicProcedure — an unauthenticated caller could insert
  // arbitrary "predictions" with unbounded strings, which recentPredictions
  // then served back to every user as if they were system-generated. This is a
  // write path and must require an authenticated session; string inputs are
  // now length-bounded to match the column widths in drizzle/schema.ts.
  storePrediction: protectedProcedure
    .input(
      z.object({
        cryptoId: z.number().int().positive(),
        timeframe: z.string().min(1).max(20),
        prediction: z.enum(["BUY", "SELL", "HOLD"]),
        explanation: z.string().min(1).max(2000),
        sentimentScore: z.string().max(20).optional(),
        newsSummary: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(aiPredictions).values({
        cryptoId: input.cryptoId,
        timeframe: input.timeframe,
        prediction: input.prediction,
        explanation: input.explanation,
        sentimentScore: input.sentimentScore,
        newsSummary: input.newsSummary,
        timestamp: new Date(),
        createdAt: new Date(),
      });

      return { success: true };
    }),
});
