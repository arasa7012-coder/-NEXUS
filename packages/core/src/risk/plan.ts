import { calculatePositionSize } from "./calculations.ts";
import { calculateDailyProtection } from "./dailyProtection.ts";
import { calculateExposure, type ExposurePositionInput } from "./exposure.ts";
import { evaluateTradeSafetyGate } from "./gate.ts";
import { calculateRiskLevel } from "./riskLevel.ts";
import { calculateRewardRisk, deriveMinimumTargetPrice } from "./rewardRisk.ts";
import { calculateStop } from "./stops.ts";
import type { DailyProtectionSnapshot, IntelligenceRiskContext, RiskSettings, TradePlanPreview, TradePlanRequest } from "./types.ts";

export interface RiskPlanBuildInput {
  now: number;
  expiresInMs: number;
  request: TradePlanRequest;
  settings: RiskSettings;
  cashUsd: number;
  positions: ExposurePositionInput[];
  dailyProtection: DailyProtectionSnapshot;
  intelligence: IntelligenceRiskContext;
  referencePriceUsd: number;
}

export class RiskPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskPlanError";
  }
}

export function buildRiskPlan(input: RiskPlanBuildInput): TradePlanPreview {
  if (!Number.isFinite(input.now) || !Number.isFinite(input.expiresInMs) || input.expiresInMs <= 0) {
    throw new RiskPlanError("Plan timing must be finite and positive.");
  }
  if (!Number.isFinite(input.referencePriceUsd) || input.referencePriceUsd <= 0) {
    throw new RiskPlanError("A finite live reference price is required for a paper plan.");
  }

  const isBuy = input.request.side === "buy";
  const rawExposure = calculateExposure({
    cashUsd: input.cashUsd,
    positions: input.positions,
    targetSymbol: input.request.symbol,
    projectedNotionalUsd: isBuy ? input.request.requestedQuantity * input.referencePriceUsd : 0,
  });
  const riskLevel = calculateRiskLevel({
    dataQuality: input.intelligence.dataQuality,
    atrPercent: input.intelligence.atrUsd && input.referencePriceUsd > 0
      ? (input.intelligence.atrUsd / input.referencePriceUsd) * 100
      : null,
    timeframeConflict: input.intelligence.timeframeConflict,
    intelligenceRiskScore: input.intelligence.intelligenceRiskScore,
    signalStrength: input.intelligence.signalStrength,
    dailyDrawdownPercent: input.dailyProtection.dailyDrawdownPercent,
  });

  if (!isBuy) {
    const gate = evaluateTradeSafetyGate({
      side: "sell",
      referencePriceUsd: input.referencePriceUsd,
      stop: null,
      sizing: null,
      rewardRisk: null,
      exposure: rawExposure,
      dailyProtection: input.dailyProtection,
      riskLevel,
      intelligence: input.intelligence,
      settings: input.settings,
    });
    return {
      simulation: true,
      expiresAt: input.now + input.expiresInMs,
      request: input.request,
      referencePriceUsd: input.referencePriceUsd,
      stop: null,
      sizing: null,
      rewardRisk: null,
      exposure: rawExposure,
      dailyProtection: input.dailyProtection,
      riskLevel,
      intelligence: input.intelligence,
      gate,
      disclaimer: "This is a paper-trading exit review using public reference data; it never submits an external order.",
    };
  }

  let stop = null;
  let sizing = null;
  let rewardRisk = null;
  try {
    stop = calculateStop({
      method: input.request.stopMethod,
      entryPriceUsd: input.referencePriceUsd,
      fixedStopPercent: input.settings.fixedStopPercent,
      atrUsd: input.intelligence.atrUsd,
      atrMultiplier: input.settings.atrMultiplier,
      confirmedSupportUsd: input.intelligence.confirmedSupportUsd,
      structureBufferBps: input.settings.structureBufferBps,
      timeframe: input.intelligence.primaryTimeframe,
      source: input.intelligence.source,
      providerUpdatedAt: input.intelligence.providerUpdatedAt,
    });
    const remainingTotalExposureUsd = Math.max(0, (rawExposure.equityUsd * input.settings.maxPortfolioExposurePercent / 100) - rawExposure.totalExposureUsd);
    const remainingAssetExposureUsd = Math.max(0, (rawExposure.equityUsd * input.settings.maxAssetExposurePercent / 100) - rawExposure.assetExposureUsd);
    sizing = calculatePositionSize({
      accountEquityUsd: rawExposure.equityUsd,
      availableCashUsd: input.cashUsd,
      entryPriceUsd: input.referencePriceUsd,
      stopPriceUsd: stop.stopPriceUsd,
      requestedQuantity: input.request.requestedQuantity,
      riskPerTradePercent: input.settings.riskPerTradePercent,
      feeBps: input.settings.feeBps,
      slippageBps: input.settings.slippageBps,
      remainingTotalExposureUsd,
      remainingAssetExposureUsd,
    });
    const targetPriceUsd = input.request.targetPriceOverrideUsd ?? deriveMinimumTargetPrice({
      quantity: sizing.approvedQuantity,
      entryPriceUsd: input.referencePriceUsd,
      plannedLossUsd: sizing.plannedLossUsd,
      minimumRewardRisk: input.settings.minimumRewardRisk,
      feeBps: input.settings.feeBps,
      slippageBps: input.settings.slippageBps,
    });
    rewardRisk = calculateRewardRisk({
      quantity: sizing.approvedQuantity,
      entryPriceUsd: input.referencePriceUsd,
      targetPriceUsd,
      plannedLossUsd: sizing.plannedLossUsd,
      feeBps: input.settings.feeBps,
      slippageBps: input.settings.slippageBps,
    });
  } catch {
    // The gate below turns unavailable protective evidence into an auditable rejection.
  }
  const exposure = calculateExposure({
    cashUsd: input.cashUsd,
    positions: input.positions,
    targetSymbol: input.request.symbol,
    projectedNotionalUsd: sizing?.notionalUsd ?? 0,
  });
  const gate = evaluateTradeSafetyGate({
    side: "buy",
    referencePriceUsd: input.referencePriceUsd,
    stop,
    sizing,
    rewardRisk,
    exposure,
    dailyProtection: input.dailyProtection,
    riskLevel,
    intelligence: input.intelligence,
    settings: input.settings,
  });
  return {
    simulation: true,
    expiresAt: input.now + input.expiresInMs,
    request: input.request,
    referencePriceUsd: input.referencePriceUsd,
    stop,
    sizing,
    rewardRisk,
    exposure,
    dailyProtection: input.dailyProtection,
    riskLevel,
    intelligence: input.intelligence,
    gate,
    disclaimer: "This is an explainable paper-trading protection plan using public reference data. It is not financial advice and never submits an external order.",
  };
}

export function dailySnapshotFromStored(input: {
  now: number;
  storedRiskDayUtc: string;
  storedDayStartEquityUsd: number;
  storedDayPeakEquityUsd: number;
  currentEquityUsd: number;
  realizedEvents: Array<{ realizedPnlUsd: number; occurredAt: number }>;
  consecutiveLosses: number;
  cooldownUntil: number | null;
  emergencyStopActive: boolean;
  emergencyStopReason: string | null;
}): DailyProtectionSnapshot {
  return calculateDailyProtection(input);
}
