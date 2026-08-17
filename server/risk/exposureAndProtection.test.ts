import { describe, expect, it } from "vitest";
import { calculateExposure, ExposureCalculationError } from "./exposure";
import { calculateDailyProtection, calculateNextLossStreak, DailyProtectionError, utcRiskDay } from "./dailyProtection";

describe("portfolio exposure", () => {
  it("calculates current and projected total and per-asset exposure", () => {
    const result = calculateExposure({
      cashUsd: 50_000,
      targetSymbol: "BTC",
      projectedNotionalUsd: 5_000,
      positions: [
        { symbol: "BTC", quantity: 0.2, marketValueUsd: 20_000, costBasisUsd: 18_000, plannedRiskUsd: 500 },
        { symbol: "ETH", quantity: 2, marketValueUsd: 10_000, costBasisUsd: 9_500, plannedRiskUsd: 300 },
      ],
    });
    expect(result.equityUsd).toBe(80_000);
    expect(result.totalExposureUsd).toBe(30_000);
    expect(result.totalExposurePercent).toBe(37.5);
    expect(result.projectedTotalExposurePercent).toBe(43.75);
    expect(result.projectedAssetExposurePercent).toBe(31.25);
    expect(result.openPlannedRiskUsd).toBe(800);
    expect(result.positionCount).toBe(2);
    expect(result.dataComplete).toBe(true);
  });

  it("uses cost basis conservatively but marks unavailable market values incomplete", () => {
    const result = calculateExposure({
      cashUsd: 90_000,
      targetSymbol: "SOL",
      projectedNotionalUsd: 0,
      positions: [{ symbol: "SOL", quantity: 10, marketValueUsd: null, costBasisUsd: 10_000, plannedRiskUsd: null }],
    });
    expect(result.totalExposureUsd).toBe(10_000);
    expect(result.dataComplete).toBe(false);
    expect(result.unavailableSymbols).toEqual(["SOL"]);
  });

  it("rejects negative and invalid exposure inputs", () => {
    expect(() => calculateExposure({ cashUsd: -1, targetSymbol: "BTC", projectedNotionalUsd: 0, positions: [] })).toThrow(ExposureCalculationError);
    expect(() => calculateExposure({ cashUsd: 1, targetSymbol: "?", projectedNotionalUsd: 0, positions: [] })).toThrow(/symbol/);
  });
});

describe("daily and consecutive-loss protection", () => {
  const now = Date.UTC(2026, 7, 11, 12, 0, 0);

  it("computes UTC daily realized loss and peak-equity drawdown", () => {
    const result = calculateDailyProtection({
      now,
      storedRiskDayUtc: "2026-08-11",
      storedDayStartEquityUsd: 100_000,
      storedDayPeakEquityUsd: 105_000,
      currentEquityUsd: 99_000,
      realizedEvents: [
        { realizedPnlUsd: -2_500, occurredAt: Date.UTC(2026, 7, 11, 9) },
        { realizedPnlUsd: 500, occurredAt: Date.UTC(2026, 7, 11, 10) },
        { realizedPnlUsd: -10_000, occurredAt: Date.UTC(2026, 7, 10, 10) },
      ],
      consecutiveLosses: 2,
      cooldownUntil: now + 30_000,
      emergencyStopActive: false,
      emergencyStopReason: null,
    });
    expect(result.realizedPnlTodayUsd).toBe(-2_000);
    expect(result.dailyLossPercent).toBe(2);
    expect(result.dailyDrawdownPercent).toBeCloseTo((6_000 / 105_000) * 100, 10);
    expect(result.cooldownActive).toBe(true);
  });

  it("rolls the UTC day without erasing the cross-day loss streak", () => {
    const result = calculateDailyProtection({
      now,
      storedRiskDayUtc: "2026-08-10",
      storedDayStartEquityUsd: 100_000,
      storedDayPeakEquityUsd: 101_000,
      currentEquityUsd: 98_000,
      realizedEvents: [{ realizedPnlUsd: -5_000, occurredAt: Date.UTC(2026, 7, 10, 23) }],
      consecutiveLosses: 2,
      cooldownUntil: null,
      emergencyStopActive: true,
      emergencyStopReason: "Manual protection",
    });
    expect(result.riskDayUtc).toBe(utcRiskDay(now));
    expect(result.dayStartEquityUsd).toBe(98_000);
    expect(result.realizedPnlTodayUsd).toBe(0);
    expect(result.consecutiveLosses).toBe(2);
    expect(result.emergencyStopActive).toBe(true);
  });

  it("triggers cooldown on the configured consecutive loss and resets on a non-loss", () => {
    const loss = calculateNextLossStreak({
      previousConsecutiveLosses: 2,
      realizedPnlUsd: -50,
      occurredAt: now,
      consecutiveLossLimit: 3,
      cooldownMinutes: 60,
    });
    expect(loss).toEqual({ consecutiveLosses: 3, cooldownTriggered: true, cooldownUntil: now + 3_600_000 });

    const win = calculateNextLossStreak({
      previousConsecutiveLosses: 3,
      realizedPnlUsd: 0,
      occurredAt: now,
      consecutiveLossLimit: 3,
      cooldownMinutes: 60,
    });
    expect(win).toEqual({ consecutiveLosses: 0, cooldownTriggered: false, cooldownUntil: null });
  });

  it("rejects invalid protection state", () => {
    expect(() => calculateDailyProtection({
      now,
      storedRiskDayUtc: "2026-08-11",
      storedDayStartEquityUsd: 100_000,
      storedDayPeakEquityUsd: 100_000,
      currentEquityUsd: Number.NaN,
      realizedEvents: [],
      consecutiveLosses: 0,
      cooldownUntil: null,
      emergencyStopActive: false,
      emergencyStopReason: null,
    })).toThrow(DailyProtectionError);
  });
});
