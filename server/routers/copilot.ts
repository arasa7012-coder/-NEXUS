import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { copilotRequestKinds, smartAlertSeverities, smartAlertTypes } from "../copilot/contracts";
import { protectedProcedure, router } from "../_core/trpc";
import { CopilotError, askCopilot, generateDailyBriefing, getCopilotPreferences, updateCopilotPreferences } from "../services/copilotService";
import { evaluateSmartAlerts, listSmartAlerts, markSmartAlertRead } from "../services/smartAlertService";
import { consumeEntitlementUsage, EntitlementError, requireEntitlement } from "../services/entitlementService";

const requestKind = z.enum(copilotRequestKinds);
const preferenceInput = z.object({
  favoriteSymbols: z.array(z.enum(["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "LINK"])).max(8).optional(),
  preferredTimeframes: z.array(z.enum(["5m", "15m", "1h", "4h", "1d"])).max(5).optional(),
  riskTolerance: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).optional(),
  enabledAlertTypes: z.array(z.enum(smartAlertTypes)).max(smartAlertTypes.length).optional(),
  minimumAlertSeverity: z.enum(smartAlertSeverities).optional(),
  alertCooldownMinutes: z.number().int().min(5).max(1440).optional(),
  dailyBriefingEnabled: z.boolean().optional(),
});

function rethrow(error: unknown): never {
  if (error instanceof EntitlementError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message, cause: error.decision });
  if (error instanceof CopilotError) {
    throw new TRPCError({ code: error.code === "INVALID" ? "BAD_REQUEST" : error.code === "RATE_LIMITED" ? "TOO_MANY_REQUESTS" : "PRECONDITION_FAILED", message: error.message });
  }
  if (error instanceof Error && error.message === "Smart alert not found.") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  throw error;
}

export const copilotRouter = router({
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    try { return await getCopilotPreferences(ctx.user.id); } catch (error) { return rethrow(error); }
  }),
  updatePreferences: protectedProcedure.input(preferenceInput).mutation(async ({ ctx, input }) => {
    try { return await updateCopilotPreferences(ctx.user.id, input); } catch (error) { return rethrow(error); }
  }),
  ask: protectedProcedure.input(z.object({
    question: z.string().trim().min(2).max(1200),
    kind: requestKind.optional(),
    symbol: z.string().trim().min(2).max(15).nullable().optional(),
    decisionId: z.number().int().positive().nullable().optional(),
    runId: z.number().int().positive().nullable().optional(),
    walletId: z.number().int().positive().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    try { await requireEntitlement(ctx.user.id, "ai_copilot_basic"); if (input.walletId) await requireEntitlement(ctx.user.id, "smart_money_advanced"); const answer = await askCopilot({ userId: ctx.user.id, ...input }); await consumeEntitlementUsage(ctx.user.id, "ai_copilot_basic"); return answer; } catch (error) { return rethrow(error); }
  }),
  evaluateAlerts: protectedProcedure.mutation(async ({ ctx }) => {
    try { await requireEntitlement(ctx.user.id, "smart_alerts"); return await evaluateSmartAlerts(ctx.user.id); } catch (error) { return rethrow(error); }
  }),
  listAlerts: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ ctx, input }) => {
    try { return await listSmartAlerts(ctx.user.id, input?.limit ?? 50); } catch (error) { return rethrow(error); }
  }),
  markAlertRead: protectedProcedure.input(z.object({ alertId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await markSmartAlertRead(ctx.user.id, input.alertId); } catch (error) { return rethrow(error); }
  }),
  generateDailyBriefing: protectedProcedure.mutation(async ({ ctx }) => {
    try { await requireEntitlement(ctx.user.id, "daily_briefing"); const briefing = await generateDailyBriefing(ctx.user.id); await consumeEntitlementUsage(ctx.user.id, "daily_briefing"); return briefing; } catch (error) { return rethrow(error); }
  }),
});
