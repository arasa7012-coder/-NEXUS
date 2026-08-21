import type { RewardRiskResult } from "./types.ts";

export class RewardRiskCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardRiskCalculationError";
  }
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RewardRiskCalculationError(`${label} must be a finite value greater than zero.`);
}

function requireNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RewardRiskCalculationError(`${label} must be a finite value of zero or greater.`);
}

export interface RewardRiskInput {
  quantity: number;
  entryPriceUsd: number;
  targetPriceUsd: number;
  plannedLossUsd: number;
  feeBps: number;
  slippageBps: number;
}

export interface MinimumTargetInput {
  quantity: number;
  entryPriceUsd: number;
  plannedLossUsd: number;
  minimumRewardRisk: number;
  feeBps: number;
  slippageBps: number;
}

export function calculateRewardRisk(input: RewardRiskInput): RewardRiskResult {
  requirePositive(input.quantity, "Quantity");
  requirePositive(input.entryPriceUsd, "Entry price");
  requirePositive(input.targetPriceUsd, "Target price");
  requirePositive(input.plannedLossUsd, "Planned loss");
  requireNonNegative(input.feeBps, "Fee basis points");
  requireNonNegative(input.slippageBps, "Slippage basis points");

  const feeRate = input.feeBps / 10_000;
  const slippageRate = input.slippageBps / 10_000;
  const estimatedEntryFillUsd = input.entryPriceUsd * (1 + slippageRate);
  const estimatedTargetFillUsd = input.targetPriceUsd * (1 - slippageRate);
  const entryFeePerUnitUsd = estimatedEntryFillUsd * feeRate;
  const targetFeePerUnitUsd = estimatedTargetFillUsd * feeRate;
  const rewardPerUnitUsd = estimatedTargetFillUsd - estimatedEntryFillUsd - entryFeePerUnitUsd - targetFeePerUnitUsd;
  const potentialRewardUsd = input.quantity * rewardPerUnitUsd;

  if (!Number.isFinite(potentialRewardUsd) || potentialRewardUsd <= 0) {
    throw new RewardRiskCalculationError("Target, fees, and slippage do not produce a positive net paper reward.");
  }

  return {
    targetPriceUsd: input.targetPriceUsd,
    estimatedTargetFillUsd,
    potentialRewardUsd,
    plannedLossUsd: input.plannedLossUsd,
    rewardRiskRatio: potentialRewardUsd / input.plannedLossUsd,
  };
}

export function deriveMinimumTargetPrice(input: MinimumTargetInput): number {
  requirePositive(input.quantity, "Quantity");
  requirePositive(input.entryPriceUsd, "Entry price");
  requirePositive(input.plannedLossUsd, "Planned loss");
  requirePositive(input.minimumRewardRisk, "Minimum reward/risk");
  requireNonNegative(input.feeBps, "Fee basis points");
  requireNonNegative(input.slippageBps, "Slippage basis points");

  const feeRate = input.feeBps / 10_000;
  const slippageRate = input.slippageBps / 10_000;
  const estimatedEntryFillUsd = input.entryPriceUsd * (1 + slippageRate);
  const requiredRewardPerUnitUsd = (input.plannedLossUsd * input.minimumRewardRisk) / input.quantity;
  const denominator = (1 - slippageRate) * (1 - feeRate);

  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new RewardRiskCalculationError("Fee and slippage assumptions do not allow a finite target calculation.");
  }

  const targetPriceUsd = (requiredRewardPerUnitUsd + estimatedEntryFillUsd * (1 + feeRate)) / denominator;
  if (!Number.isFinite(targetPriceUsd) || targetPriceUsd <= input.entryPriceUsd) {
    throw new RewardRiskCalculationError("The configured inputs do not produce a valid target above entry.");
  }
  return targetPriceUsd;
}
