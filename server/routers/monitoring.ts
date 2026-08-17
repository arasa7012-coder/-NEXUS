import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { evaluatePaperPositionMonitoring, listPaperPositionMonitoring } from "../services/paperPositionMonitoringService";
import { getNotificationReadiness, registerDeviceReadiness, revokeDeviceReadiness, updateNotificationReadiness } from "../services/notificationReadinessService";
import { consumeEntitlementUsage, EntitlementError, requireEntitlement } from "../services/entitlementService";

const deviceInput = z.object({
  devicePublicId: z.string().trim().min(12).max(80),
  platform: z.enum(["WEB", "IOS", "ANDROID", "UNKNOWN"]),
  permissionState: z.enum(["DEFAULT", "GRANTED", "DENIED", "UNSUPPORTED", "REVOKED"]),
});

function rethrow(error: unknown): never {
  if (error instanceof EntitlementError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message, cause: error.decision });
  if (error instanceof Error && (error.message.includes("not found") || error.message.includes("not found."))) throw new TRPCError({ code: "NOT_FOUND", message: error.message });
  throw error;
}

export const monitoringRouter = router({
  evaluate: protectedProcedure.mutation(async ({ ctx }) => {
    try { await requireEntitlement(ctx.user.id, "continuous_monitoring"); const result = await evaluatePaperPositionMonitoring(ctx.user.id); await consumeEntitlementUsage(ctx.user.id, "continuous_monitoring"); return result; } catch (error) { return rethrow(error); }
  }),
  liveSnapshot: protectedProcedure.query(async ({ ctx }) => {
    try { return await evaluatePaperPositionMonitoring(ctx.user.id); } catch (error) { return rethrow(error); }
  }),
  list: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ ctx, input }) => {
    try { return await listPaperPositionMonitoring(ctx.user.id, input?.limit ?? 50); } catch (error) { return rethrow(error); }
  }),
  notificationReadiness: protectedProcedure.query(async ({ ctx }) => {
    try { return await getNotificationReadiness(ctx.user.id); } catch (error) { return rethrow(error); }
  }),
  updateNotificationPreferences: protectedProcedure.input(z.object({
    inAppConsent: z.boolean().optional(), emailConsent: z.boolean().optional(), pushConsent: z.boolean().optional(), dailyBriefingScheduleIntent: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    try { return await updateNotificationReadiness(ctx.user.id, input); } catch (error) { return rethrow(error); }
  }),
  registerDeviceReadiness: protectedProcedure.input(deviceInput).mutation(async ({ ctx, input }) => {
    try { return await registerDeviceReadiness(ctx.user.id, input); } catch (error) { return rethrow(error); }
  }),
  revokeDevice: protectedProcedure.input(z.object({ devicePublicId: z.string().trim().min(12).max(80) })).mutation(async ({ ctx, input }) => {
    try { return await revokeDeviceReadiness(ctx.user.id, input.devicePublicId); } catch (error) { return rethrow(error); }
  }),
});
