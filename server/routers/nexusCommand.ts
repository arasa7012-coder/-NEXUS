import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createActionPreview,
  evaluateShield,
  getActivityTimeline,
  getCommandOverview,
  getMonitoringHealth,
  resolveSecurityModeApproval,
} from "../services/nexusCommandService";

export const nexusCommandRouter = router({
  overview: protectedProcedure.query(({ ctx }) => getCommandOverview(ctx.user.id)),
  timeline: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) })).query(({ ctx, input }) => getActivityTimeline(ctx.user.id, input.limit)),
  monitoringHealth: protectedProcedure.query(() => getMonitoringHealth()),
  evaluateShield: protectedProcedure.mutation(({ ctx }) => evaluateShield(ctx.user.id)),
  previewAction: protectedProcedure.input(z.object({ actionType: z.enum(["ENABLE_SECURITY_MODE", "DISABLE_SECURITY_MODE"]) })).mutation(({ ctx, input }) => createActionPreview(ctx.user.id, input.actionType)),
  resolveApproval: protectedProcedure.input(z.object({ approvalId: z.number().int().positive(), decision: z.enum(["APPROVE", "REJECT", "CANCEL", "ESCALATE"]) })).mutation(({ ctx, input }) => resolveSecurityModeApproval(ctx.user.id, input.approvalId, input.decision)),
});
