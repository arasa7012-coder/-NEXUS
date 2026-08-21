import type { DailyProtectionSnapshot } from "./types.ts";

export interface RealizedPnlEvent {
  realizedPnlUsd: number;
  occurredAt: number;
}

export interface DailyProtectionInput {
  now: number;
  storedRiskDayUtc: string;
  storedDayStartEquityUsd: number;
  storedDayPeakEquityUsd: number;
  currentEquityUsd: number;
  realizedEvents: RealizedPnlEvent[];
  consecutiveLosses: number;
  cooldownUntil: number | null;
  emergencyStopActive: boolean;
  emergencyStopReason: string | null;
}

export interface LossStreakInput {
  previousConsecutiveLosses: number;
  realizedPnlUsd: number;
  occurredAt: number;
  consecutiveLossLimit: number;
  cooldownMinutes: number;
}

export class DailyProtectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyProtectionError";
  }
}

export function utcRiskDay(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new DailyProtectionError("Risk timestamp must be finite.");
  return new Date(timestamp).toISOString().slice(0, 10);
}

function finiteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new DailyProtectionError(`${label} must be finite and non-negative.`);
}

export function calculateDailyProtection(input: DailyProtectionInput): DailyProtectionSnapshot {
  finiteNonNegative(input.storedDayStartEquityUsd, "Stored day-start equity");
  finiteNonNegative(input.storedDayPeakEquityUsd, "Stored day-peak equity");
  finiteNonNegative(input.currentEquityUsd, "Current equity");
  if (!Number.isInteger(input.consecutiveLosses) || input.consecutiveLosses < 0) {
    throw new DailyProtectionError("Consecutive losses must be a non-negative whole number.");
  }

  const riskDayUtc = utcRiskDay(input.now);
  const dayChanged = input.storedRiskDayUtc !== riskDayUtc;
  const dayStartEquityUsd = dayChanged ? input.currentEquityUsd : input.storedDayStartEquityUsd;
  const dayPeakEquityUsd = dayChanged
    ? input.currentEquityUsd
    : Math.max(input.storedDayPeakEquityUsd, input.currentEquityUsd);
  const realizedPnlTodayUsd = dayChanged
    ? 0
    : input.realizedEvents
      .filter((event) => utcRiskDay(event.occurredAt) === riskDayUtc)
      .reduce((sum, event) => {
        if (!Number.isFinite(event.realizedPnlUsd)) throw new DailyProtectionError("Realized P/L events must be finite.");
        return sum + event.realizedPnlUsd;
      }, 0);
  const dailyLossPercent = dayStartEquityUsd > 0
    ? (Math.max(0, -realizedPnlTodayUsd) / dayStartEquityUsd) * 100
    : 0;
  const dailyDrawdownPercent = dayPeakEquityUsd > 0
    ? (Math.max(0, dayPeakEquityUsd - input.currentEquityUsd) / dayPeakEquityUsd) * 100
    : 0;
  const cooldownActive = input.cooldownUntil !== null && input.cooldownUntil > input.now;

  return {
    riskDayUtc,
    dayStartEquityUsd,
    dayPeakEquityUsd,
    currentEquityUsd: input.currentEquityUsd,
    realizedPnlTodayUsd,
    dailyLossPercent,
    dailyDrawdownPercent,
    consecutiveLosses: input.consecutiveLosses,
    cooldownUntil: input.cooldownUntil,
    cooldownActive,
    emergencyStopActive: input.emergencyStopActive,
    emergencyStopReason: input.emergencyStopReason,
  };
}

export function calculateNextLossStreak(input: LossStreakInput) {
  if (!Number.isInteger(input.previousConsecutiveLosses) || input.previousConsecutiveLosses < 0) {
    throw new DailyProtectionError("Previous consecutive losses must be a non-negative whole number.");
  }
  if (!Number.isFinite(input.realizedPnlUsd)) throw new DailyProtectionError("Realized P/L must be finite.");
  if (!Number.isInteger(input.consecutiveLossLimit) || input.consecutiveLossLimit < 1) {
    throw new DailyProtectionError("Consecutive-loss limit must be a positive whole number.");
  }
  if (!Number.isInteger(input.cooldownMinutes) || input.cooldownMinutes < 1) {
    throw new DailyProtectionError("Cooldown duration must be a positive whole number.");
  }
  if (!Number.isFinite(input.occurredAt)) throw new DailyProtectionError("Loss event timestamp must be finite.");

  const consecutiveLosses = input.realizedPnlUsd < 0 ? input.previousConsecutiveLosses + 1 : 0;
  const cooldownTriggered = consecutiveLosses >= input.consecutiveLossLimit;
  return {
    consecutiveLosses,
    cooldownTriggered,
    cooldownUntil: cooldownTriggered ? input.occurredAt + input.cooldownMinutes * 60_000 : null,
  };
}
