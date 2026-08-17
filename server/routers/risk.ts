import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  simulationRiskEvents,
  simulationRiskSettings,
  simulationTradeDecisions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getEmergencyStopState, resetEmergencyStop, setEmergencyStop } from "../risk/safety";
import { DEFAULT_RISK_SETTINGS, normalizeRiskSettings, RiskSettingsValidationError } from "../risk/settings";
import type { RiskSettings } from "../risk/types";
import {
  SimulationPortfolioError,
  getSimulationPortfolioProtection,
  getSimulationPortfolioState,
  monitorSimulationPositions,
  previewSimulationOrder,
  recordSimulationOrder,
} from "../services/simulationPortfolio";
import { MarketDataError } from "../services/marketData";

const orderInput = z.object({
  requestKey: z.string().trim().min(1).max(64),
  symbol: z.string().trim().min(2).max(15),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit", "stop"]),
  quantity: z.number().finite().positive().max(1_000_000_000),
  stopMethod: z.enum(["fixed", "atr", "structure"]).optional(),
  targetPriceOverrideUsd: z.number().finite().positive().nullable().optional(),
  triggerPriceUsd: z.number().finite().positive().nullable().optional(),
});

const riskSettingsInput = z.object({
  riskPerTradePercent: z.number().finite().optional(),
  maxDailyLossPercent: z.number().finite().optional(),
  maxDailyDrawdownPercent: z.number().finite().optional(),
  maxOpenPositions: z.number().int().optional(),
  maxPortfolioExposurePercent: z.number().finite().optional(),
  maxAssetExposurePercent: z.number().finite().optional(),
  stopMethod: z.enum(["fixed", "atr", "structure"]).optional(),
  fixedStopPercent: z.number().finite().optional(),
  atrMultiplier: z.number().finite().optional(),
  structureBufferBps: z.number().int().optional(),
  minimumRewardRisk: z.number().finite().optional(),
  consecutiveLossLimit: z.number().int().optional(),
  cooldownMinutes: z.number().int().optional(),
  feeBps: z.number().int().optional(),
  slippageBps: z.number().int().optional(),
  blockHighVolatility: z.boolean().optional(),
});

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStoredSettings(row: typeof simulationRiskSettings.$inferSelect | undefined): RiskSettings {
  if (!row) return { ...DEFAULT_RISK_SETTINGS };
  return {
    riskPerTradePercent: numberValue(row.riskPerTradePercent),
    maxDailyLossPercent: numberValue(row.maxDailyLossPercent),
    maxDailyDrawdownPercent: numberValue(row.maxDailyDrawdownPercent),
    maxOpenPositions: row.maxOpenPositions,
    maxPortfolioExposurePercent: numberValue(row.maxPortfolioExposurePercent),
    maxAssetExposurePercent: numberValue(row.maxAssetExposurePercent),
    stopMethod: row.stopMethod,
    fixedStopPercent: numberValue(row.fixedStopPercent),
    atrMultiplier: numberValue(row.atrMultiplier),
    structureBufferBps: row.structureBufferBps,
    minimumRewardRisk: numberValue(row.minimumRewardRisk),
    consecutiveLossLimit: row.consecutiveLossLimit,
    cooldownMinutes: row.cooldownMinutes,
    feeBps: row.feeBps,
    slippageBps: row.slippageBps,
    blockHighVolatility: row.blockHighVolatility === 1,
  };
}

function settingsValues(userId: number, settings: RiskSettings) {
  return {
    userId,
    riskPerTradePercent: settings.riskPerTradePercent.toFixed(4),
    maxDailyLossPercent: settings.maxDailyLossPercent.toFixed(4),
    maxDailyDrawdownPercent: settings.maxDailyDrawdownPercent.toFixed(4),
    maxOpenPositions: settings.maxOpenPositions,
    maxPortfolioExposurePercent: settings.maxPortfolioExposurePercent.toFixed(4),
    maxAssetExposurePercent: settings.maxAssetExposurePercent.toFixed(4),
    stopMethod: settings.stopMethod,
    fixedStopPercent: settings.fixedStopPercent.toFixed(4),
    atrMultiplier: settings.atrMultiplier.toFixed(4),
    structureBufferBps: settings.structureBufferBps,
    minimumRewardRisk: settings.minimumRewardRisk.toFixed(4),
    consecutiveLossLimit: settings.consecutiveLossLimit,
    cooldownMinutes: settings.cooldownMinutes,
    feeBps: settings.feeBps,
    slippageBps: settings.slippageBps,
    blockHighVolatility: settings.blockHighVolatility ? 1 : 0,
  };
}

async function getSettings(userId: number): Promise<{ settings: RiskSettings; exists: boolean }> {
  const db = await getDb();
  if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Risk settings storage is temporarily unavailable.");
  const rows = await db.select().from(simulationRiskSettings).where(eq(simulationRiskSettings.userId, userId)).limit(1);
  return { settings: toStoredSettings(rows[0]), exists: Boolean(rows[0]) };
}

function rethrow(error: unknown): never {
  if (error instanceof RiskSettingsValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error.issues });
  if (error instanceof SimulationPortfolioError || error instanceof MarketDataError) {
    throw new TRPCError({ code: error instanceof SimulationPortfolioError && error.code === "UNAVAILABLE" ? "PRECONDITION_FAILED" : "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const riskRouter = router({
  getRiskSettings: protectedProcedure.query(async ({ ctx }) => {
    try {
      return (await getSettings(ctx.user.id)).settings;
    } catch (error) {
      return rethrow(error);
    }
  }),

  updateRiskSettings: protectedProcedure.input(riskSettingsInput).mutation(async ({ ctx, input }) => {
    try {
      const db = await getDb();
      if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Risk settings storage is temporarily unavailable.");
      const current = await getSettings(ctx.user.id);
      const settings = normalizeRiskSettings({ ...current.settings, ...input });
      if (current.exists) {
        await db.update(simulationRiskSettings).set(settingsValues(ctx.user.id, settings)).where(eq(simulationRiskSettings.userId, ctx.user.id));
      } else {
        try {
          await db.insert(simulationRiskSettings).values(settingsValues(ctx.user.id, settings));
        } catch {
          await db.update(simulationRiskSettings).set(settingsValues(ctx.user.id, settings)).where(eq(simulationRiskSettings.userId, ctx.user.id));
        }
      }
      return settings;
    } catch (error) {
      return rethrow(error);
    }
  }),

  getTradePlanPreview: protectedProcedure.input(orderInput).query(async ({ ctx, input }) => {
    try {
      return await previewSimulationOrder({ userId: ctx.user.id, ...input });
    } catch (error) {
      return rethrow(error);
    }
  }),

  confirmGuardedOrder: protectedProcedure.input(orderInput).mutation(async ({ ctx, input }) => {
    try {
      return await recordSimulationOrder({ userId: ctx.user.id, ...input });
    } catch (error) {
      return rethrow(error);
    }
  }),

  getEmergencyStopStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      const state = await getSimulationPortfolioState(ctx.user.id);
      return await getEmergencyStopState(ctx.user.id, state.portfolio.totalValueUsd);
    } catch (error) {
      return rethrow(error);
    }
  }),

  getPortfolioProtection: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getSimulationPortfolioProtection(ctx.user.id);
    } catch (error) {
      return rethrow(error);
    }
  }),

  activateEmergencyStop: protectedProcedure.input(z.object({ reason: z.string().trim().min(3).max(500) })).mutation(async ({ ctx, input }) => {
    try {
      const state = await getSimulationPortfolioState(ctx.user.id);
      return await setEmergencyStop({
        userId: ctx.user.id,
        simulationPortfolioId: state.portfolio.id,
        currentEquityUsd: state.portfolio.totalValueUsd,
        reason: input.reason,
      });
    } catch (error) {
      return rethrow(error);
    }
  }),

  resetEmergencyStop: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const state = await getSimulationPortfolioState(ctx.user.id);
      return await resetEmergencyStop({ userId: ctx.user.id, simulationPortfolioId: state.portfolio.id, currentEquityUsd: state.portfolio.totalValueUsd });
    } catch (error) {
      return rethrow(error);
    }
  }),

  monitorPositions: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await monitorSimulationPositions(ctx.user.id);
    } catch (error) {
      return rethrow(error);
    }
  }),

  getAuditHistory: protectedProcedure.input(z.object({ page: z.number().int().min(0).optional(), pageSize: z.number().int().min(1).max(50).optional() }).optional()).query(async ({ ctx, input }) => {
    try {
      const db = await getDb();
      if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Risk audit storage is temporarily unavailable.");
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 20;
      const take = (page + 1) * pageSize;
      const [decisions, events] = await Promise.all([
        db.select().from(simulationTradeDecisions).where(eq(simulationTradeDecisions.userId, ctx.user.id)).orderBy(desc(simulationTradeDecisions.createdAt)).limit(take),
        db.select().from(simulationRiskEvents).where(eq(simulationRiskEvents.userId, ctx.user.id)).orderBy(desc(simulationRiskEvents.createdAt)).limit(take),
      ]);
      return {
        page,
        pageSize,
        decisions: decisions.slice(page * pageSize, take),
        events: events.slice(page * pageSize, take),
        hasMore: decisions.length === take || events.length === take,
      };
    } catch (error) {
      return rethrow(error);
    }
  }),
});
