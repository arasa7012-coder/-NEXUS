import { describe, expect, it } from "vitest";
import { DEFAULT_RISK_SETTINGS, RiskSettingsValidationError, normalizeRiskSettings, validateRiskSettings } from "./settings";

describe("risk settings", () => {
  it("provides conservative, internally consistent defaults", () => {
    expect(DEFAULT_RISK_SETTINGS).toMatchObject({
      riskPerTradePercent: 1,
      maxDailyLossPercent: 3,
      maxDailyDrawdownPercent: 5,
      maxOpenPositions: 10,
      maxPortfolioExposurePercent: 80,
      maxAssetExposurePercent: 25,
      stopMethod: "atr",
      minimumRewardRisk: 2,
      blockHighVolatility: true,
    });
    expect(validateRiskSettings(DEFAULT_RISK_SETTINGS)).toEqual([]);
  });

  it("accepts a bounded user override while preserving omitted defaults", () => {
    const settings = normalizeRiskSettings({ riskPerTradePercent: 0.5, stopMethod: "fixed", fixedStopPercent: 1.5 });
    expect(settings.riskPerTradePercent).toBe(0.5);
    expect(settings.stopMethod).toBe("fixed");
    expect(settings.fixedStopPercent).toBe(1.5);
    expect(settings.maxOpenPositions).toBe(10);
  });

  it("rejects non-finite and out-of-range values", () => {
    expect(() => normalizeRiskSettings({ riskPerTradePercent: Number.NaN, feeBps: 101 })).toThrow(RiskSettingsValidationError);
    try {
      normalizeRiskSettings({ riskPerTradePercent: Number.NaN, feeBps: 101 });
    } catch (error) {
      expect(error).toBeInstanceOf(RiskSettingsValidationError);
      expect((error as RiskSettingsValidationError).issues).toEqual(expect.arrayContaining([
        "Risk per trade must be between 0.10% and 5.00%.",
        "Fee assumption must be a whole number from 0 to 100 basis points.",
      ]));
    }
  });

  it("rejects contradictory loss and exposure settings", () => {
    expect(() => normalizeRiskSettings({
      riskPerTradePercent: 4,
      maxDailyLossPercent: 3,
      maxDailyDrawdownPercent: 2,
      maxAssetExposurePercent: 90,
      maxPortfolioExposurePercent: 80,
    })).toThrowError(/Risk per trade cannot exceed/);
  });

  it("requires integer counts, durations, and basis-point assumptions", () => {
    const issues = validateRiskSettings({
      ...DEFAULT_RISK_SETTINGS,
      maxOpenPositions: 2.5,
      cooldownMinutes: 30.2,
      slippageBps: 5.5,
    });
    expect(issues).toEqual(expect.arrayContaining([
      "Maximum open positions must be a whole number from 1 to 20.",
      "Cooldown must be a whole number from 5 to 1,440 minutes.",
      "Slippage assumption must be a whole number from 0 to 200 basis points.",
    ]));
  });
});
