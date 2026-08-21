import type { RiskSettings, RiskStopMethod } from "./types.ts";

export const DEFAULT_RISK_SETTINGS: RiskSettings = Object.freeze({
  riskPerTradePercent: 1,
  maxDailyLossPercent: 3,
  maxDailyDrawdownPercent: 5,
  maxOpenPositions: 10,
  maxPortfolioExposurePercent: 80,
  maxAssetExposurePercent: 25,
  stopMethod: "atr",
  fixedStopPercent: 2,
  atrMultiplier: 2,
  structureBufferBps: 10,
  minimumRewardRisk: 2,
  consecutiveLossLimit: 3,
  cooldownMinutes: 60,
  feeBps: 10,
  slippageBps: 5,
  blockHighVolatility: true,
});

export class RiskSettingsValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] ?? "Risk settings are invalid.");
    this.issues = issues;
    this.name = "RiskSettingsValidationError";
  }
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isStopMethod(value: unknown): value is RiskStopMethod {
  return value === "fixed" || value === "atr" || value === "structure";
}

export function validateRiskSettings(settings: RiskSettings): string[] {
  const issues: string[] = [];
  if (!inRange(settings.riskPerTradePercent, 0.1, 5)) issues.push("Risk per trade must be between 0.10% and 5.00%.");
  if (!inRange(settings.maxDailyLossPercent, 0.5, 20)) issues.push("Maximum daily loss must be between 0.50% and 20.00%.");
  if (!inRange(settings.maxDailyDrawdownPercent, 1, 30)) issues.push("Maximum daily drawdown must be between 1.00% and 30.00%.");
  if (!integerInRange(settings.maxOpenPositions, 1, 20)) issues.push("Maximum open positions must be a whole number from 1 to 20.");
  if (!inRange(settings.maxPortfolioExposurePercent, 10, 100)) issues.push("Maximum portfolio exposure must be between 10.00% and 100.00%.");
  if (!inRange(settings.maxAssetExposurePercent, 5, 100)) issues.push("Maximum per-asset exposure must be between 5.00% and 100.00%.");
  if (!isStopMethod(settings.stopMethod)) issues.push("Choose fixed, ATR, or market-structure stop placement.");
  if (!inRange(settings.fixedStopPercent, 0.25, 20)) issues.push("Fixed stop distance must be between 0.25% and 20.00%.");
  if (!inRange(settings.atrMultiplier, 0.5, 5)) issues.push("ATR multiplier must be between 0.50 and 5.00.");
  if (!integerInRange(settings.structureBufferBps, 0, 100)) issues.push("Structure buffer must be a whole number from 0 to 100 basis points.");
  if (!inRange(settings.minimumRewardRisk, 1, 10)) issues.push("Minimum reward/risk must be between 1.00 and 10.00.");
  if (!integerInRange(settings.consecutiveLossLimit, 1, 10)) issues.push("Consecutive-loss limit must be a whole number from 1 to 10.");
  if (!integerInRange(settings.cooldownMinutes, 5, 1_440)) issues.push("Cooldown must be a whole number from 5 to 1,440 minutes.");
  if (!integerInRange(settings.feeBps, 0, 100)) issues.push("Fee assumption must be a whole number from 0 to 100 basis points.");
  if (!integerInRange(settings.slippageBps, 0, 200)) issues.push("Slippage assumption must be a whole number from 0 to 200 basis points.");
  if (typeof settings.blockHighVolatility !== "boolean") issues.push("High-volatility protection must be enabled or disabled explicitly.");

  if (settings.riskPerTradePercent > settings.maxDailyLossPercent) {
    issues.push("Risk per trade cannot exceed the maximum daily loss limit.");
  }
  if (settings.maxDailyLossPercent > settings.maxDailyDrawdownPercent) {
    issues.push("Maximum daily loss cannot exceed the maximum daily drawdown.");
  }
  if (settings.maxAssetExposurePercent > settings.maxPortfolioExposurePercent) {
    issues.push("Per-asset exposure cannot exceed total portfolio exposure.");
  }
  return issues;
}

export function normalizeRiskSettings(input: Partial<RiskSettings>): RiskSettings {
  const settings: RiskSettings = { ...DEFAULT_RISK_SETTINGS, ...input };
  const issues = validateRiskSettings(settings);
  if (issues.length > 0) throw new RiskSettingsValidationError(issues);
  return settings;
}
