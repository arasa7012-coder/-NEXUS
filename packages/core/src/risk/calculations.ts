import type { PositionSizeResult } from "./types.ts";

const QUANTITY_DECIMALS = 12;

export class RiskCalculationError extends Error {
  readonly code: "INVALID_INPUT" | "INVALID_STOP" | "NO_CAPACITY";

  constructor(
    code: "INVALID_INPUT" | "INVALID_STOP" | "NO_CAPACITY",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "RiskCalculationError";
  }
}

function requireFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RiskCalculationError("INVALID_INPUT", `${label} must be a finite value greater than zero.`);
  }
}

function requireFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RiskCalculationError("INVALID_INPUT", `${label} must be a finite value of zero or greater.`);
  }
}

function roundDown(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor((value + Number.EPSILON) * factor) / factor;
}

export interface PositionSizeInput {
  accountEquityUsd: number;
  availableCashUsd: number;
  entryPriceUsd: number;
  stopPriceUsd: number;
  requestedQuantity: number;
  riskPerTradePercent: number;
  feeBps: number;
  slippageBps: number;
  remainingTotalExposureUsd: number;
  remainingAssetExposureUsd: number;
}

export interface PlannedRiskInput {
  quantity: number;
  accountEquityUsd: number;
  entryPriceUsd: number;
  stopPriceUsd: number;
  feeBps: number;
  slippageBps: number;
}

export function calculatePlannedRisk(input: PlannedRiskInput) {
  requireFinitePositive(input.quantity, "Quantity");
  requireFinitePositive(input.accountEquityUsd, "Account equity");
  requireFinitePositive(input.entryPriceUsd, "Entry price");
  requireFinitePositive(input.stopPriceUsd, "Stop price");
  requireFiniteNonNegative(input.feeBps, "Fee basis points");
  requireFiniteNonNegative(input.slippageBps, "Slippage basis points");

  if (input.stopPriceUsd >= input.entryPriceUsd) {
    throw new RiskCalculationError("INVALID_STOP", "A long-position stop must be below the entry price.");
  }

  const feeRate = input.feeBps / 10_000;
  const slippageRate = input.slippageBps / 10_000;
  const estimatedEntryFillUsd = input.entryPriceUsd * (1 + slippageRate);
  const estimatedStopFillUsd = input.stopPriceUsd * (1 - slippageRate);
  const entryFeePerUnitUsd = estimatedEntryFillUsd * feeRate;
  const stopFeePerUnitUsd = estimatedStopFillUsd * feeRate;
  const lossPerUnitUsd = estimatedEntryFillUsd - estimatedStopFillUsd + entryFeePerUnitUsd + stopFeePerUnitUsd;

  if (!Number.isFinite(lossPerUnitUsd) || lossPerUnitUsd <= 0) {
    throw new RiskCalculationError("INVALID_STOP", "Entry, stop, fee, and slippage inputs do not produce a positive planned loss per unit.");
  }

  const estimatedEntryFeeUsd = input.quantity * entryFeePerUnitUsd;
  const estimatedExitFeeUsd = input.quantity * stopFeePerUnitUsd;
  const plannedLossUsd = input.quantity * lossPerUnitUsd;
  const plannedRiskPercent = (plannedLossUsd / input.accountEquityUsd) * 100;

  return {
    estimatedEntryFillUsd,
    estimatedStopFillUsd,
    entryFeePerUnitUsd,
    stopFeePerUnitUsd,
    lossPerUnitUsd,
    estimatedEntryFeeUsd,
    estimatedExitFeeUsd,
    estimatedFeesUsd: estimatedEntryFeeUsd + estimatedExitFeeUsd,
    plannedLossUsd,
    plannedRiskPercent,
  };
}

export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  requireFinitePositive(input.accountEquityUsd, "Account equity");
  requireFiniteNonNegative(input.availableCashUsd, "Available cash");
  requireFinitePositive(input.entryPriceUsd, "Entry price");
  requireFinitePositive(input.stopPriceUsd, "Stop price");
  requireFinitePositive(input.requestedQuantity, "Requested quantity");
  requireFinitePositive(input.riskPerTradePercent, "Risk per trade");
  requireFiniteNonNegative(input.feeBps, "Fee basis points");
  requireFiniteNonNegative(input.slippageBps, "Slippage basis points");
  requireFiniteNonNegative(input.remainingTotalExposureUsd, "Remaining total exposure");
  requireFiniteNonNegative(input.remainingAssetExposureUsd, "Remaining asset exposure");

  const oneUnitRisk = calculatePlannedRisk({
    quantity: 1,
    accountEquityUsd: input.accountEquityUsd,
    entryPriceUsd: input.entryPriceUsd,
    stopPriceUsd: input.stopPriceUsd,
    feeBps: input.feeBps,
    slippageBps: input.slippageBps,
  });

  const maximumPlannedLossUsd = input.accountEquityUsd * (input.riskPerTradePercent / 100);
  const riskLimitedQuantity = maximumPlannedLossUsd / oneUnitRisk.lossPerUnitUsd;
  const cashCostPerUnitUsd = oneUnitRisk.estimatedEntryFillUsd + oneUnitRisk.entryFeePerUnitUsd;
  const cashLimitedQuantity = input.availableCashUsd / cashCostPerUnitUsd;
  const totalExposureLimitedQuantity = input.remainingTotalExposureUsd / oneUnitRisk.estimatedEntryFillUsd;
  const assetExposureLimitedQuantity = input.remainingAssetExposureUsd / oneUnitRisk.estimatedEntryFillUsd;

  const candidates = [
    { factor: "REQUESTED_QUANTITY" as const, value: input.requestedQuantity },
    { factor: "RISK" as const, value: riskLimitedQuantity },
    { factor: "CASH" as const, value: cashLimitedQuantity },
    { factor: "TOTAL_EXPOSURE" as const, value: totalExposureLimitedQuantity },
    { factor: "ASSET_EXPOSURE" as const, value: assetExposureLimitedQuantity },
  ];
  const limiting = candidates.reduce((current, candidate) => candidate.value < current.value ? candidate : current);
  const recommendedQuantity = roundDown(
    Math.min(riskLimitedQuantity, cashLimitedQuantity, totalExposureLimitedQuantity, assetExposureLimitedQuantity),
    QUANTITY_DECIMALS,
  );
  const approvedQuantity = roundDown(limiting.value, QUANTITY_DECIMALS);

  if (!Number.isFinite(approvedQuantity) || approvedQuantity <= 0) {
    throw new RiskCalculationError("NO_CAPACITY", "The configured risk, cash, and exposure limits do not permit a positive paper position.");
  }

  const approvedRisk = calculatePlannedRisk({
    quantity: approvedQuantity,
    accountEquityUsd: input.accountEquityUsd,
    entryPriceUsd: input.entryPriceUsd,
    stopPriceUsd: input.stopPriceUsd,
    feeBps: input.feeBps,
    slippageBps: input.slippageBps,
  });
  const notionalUsd = approvedQuantity * approvedRisk.estimatedEntryFillUsd;
  const remainingCashUsd = Math.max(0, input.availableCashUsd - notionalUsd - approvedRisk.estimatedEntryFeeUsd);

  return {
    recommendedQuantity,
    requestedQuantity: input.requestedQuantity,
    approvedQuantity,
    estimatedEntryFillUsd: approvedRisk.estimatedEntryFillUsd,
    estimatedStopFillUsd: approvedRisk.estimatedStopFillUsd,
    notionalUsd,
    estimatedEntryFeeUsd: approvedRisk.estimatedEntryFeeUsd,
    estimatedExitFeeUsd: approvedRisk.estimatedExitFeeUsd,
    estimatedFeesUsd: approvedRisk.estimatedFeesUsd,
    lossPerUnitUsd: approvedRisk.lossPerUnitUsd,
    maximumPlannedLossUsd,
    plannedLossUsd: approvedRisk.plannedLossUsd,
    plannedRiskPercent: approvedRisk.plannedRiskPercent,
    remainingCashUsd,
    limitingFactor: limiting.factor,
  };
}
