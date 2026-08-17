import { describe, expect, it } from "vitest";
import { evaluateTradeSafetyGate } from "./gate";
import { calculateRiskLevel } from "./riskLevel";
import type { TradeSafetyGateInput } from "./gate";

function createGateInput(): TradeSafetyGateInput {
  return {
    side: "buy",
    referencePriceUsd: 100,
    stop: { method: "fixed", entryPriceUsd: 100, stopPriceUsd: 95, distanceUsd: 5, distancePercent: 5, timeframe: null, source: "settings", providerUpdatedAt: 1, explanation: "Fixed protective stop." },
    sizing: { recommendedQuantity: 10, requestedQuantity: 10, approvedQuantity: 10, estimatedEntryFillUsd: 100, estimatedStopFillUsd: 95, notionalUsd: 1000, estimatedEntryFeeUsd: 1, estimatedExitFeeUsd: 1, estimatedFeesUsd: 2, lossPerUnitUsd: 5.2, maximumPlannedLossUsd: 60, plannedLossUsd: 52, plannedRiskPercent: 0.52, remainingCashUsd: 99_000, limitingFactor: "REQUESTED_QUANTITY" },
    rewardRisk: { targetPriceUsd: 112, estimatedTargetFillUsd: 112, potentialRewardUsd: 118, plannedLossUsd: 52, rewardRiskRatio: 2.26 },
    exposure: { equityUsd: 100_000, cashUsd: 100_000, positionCount: 0, totalExposureUsd: 0, totalExposurePercent: 0, assetExposureUsd: 0, assetExposurePercent: 0, openPlannedRiskUsd: 0, projectedTotalExposureUsd: 1000, projectedTotalExposurePercent: 1, projectedAssetExposureUsd: 1000, projectedAssetExposurePercent: 1, dataComplete: true, unavailableSymbols: [] },
    dailyProtection: { riskDayUtc: "2026-08-12", dayStartEquityUsd: 100_000, dayPeakEquityUsd: 100_000, currentEquityUsd: 100_000, realizedPnlTodayUsd: 0, dailyLossPercent: 0, dailyDrawdownPercent: 0, consecutiveLosses: 0, cooldownUntil: null, cooldownActive: false, emergencyStopActive: false, emergencyStopReason: null },
    riskLevel: { level: "LOW", score: 12, factors: [], unavailableReason: null },
    intelligence: { assetId: "bitcoin", symbol: "BTC", primaryTimeframe: "1h", dataQuality: "LIVE", source: "coinbase", providerUpdatedAt: 1, generatedAt: 1, opportunityScore: 60, intelligenceRiskScore: 20, signalStrength: 65, regime: "RANGE", atrUsd: 2, confirmedSupportUsd: 95, timeframeConflict: false },
    settings: { riskPerTradePercent: 1, maxDailyLossPercent: 3, maxDailyDrawdownPercent: 5, maxOpenPositions: 5, maxPortfolioExposurePercent: 70, maxAssetExposurePercent: 25, stopMethod: "fixed", fixedStopPercent: 5, atrMultiplier: 2, structureBufferBps: 25, minimumRewardRisk: 1.5, consecutiveLossLimit: 3, cooldownMinutes: 30, feeBps: 10, slippageBps: 10, blockHighVolatility: true },
  };
}

describe("Risk level", () => {
  it("grades measurable conflicting high-volatility evidence as high or extreme", () => {
    const result = calculateRiskLevel({ dataQuality: "LIVE", atrPercent: 6.5, timeframeConflict: true, intelligenceRiskScore: 80, signalStrength: 25, dailyDrawdownPercent: 5 });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.level).toBe("EXTREME");
  });

  it("does not invent a level when market data is unavailable", () => {
    const result = calculateRiskLevel({ dataQuality: "UNAVAILABLE", atrPercent: null, timeframeConflict: false, intelligenceRiskScore: null, signalStrength: null, dailyDrawdownPercent: 0 });
    expect(result.level).toBeNull();
    expect(result.unavailableReason).toMatch(/unavailable/i);
  });
});

describe("Trade Safety Gate", () => {
  it("accepts a fresh, bounded, low-risk paper trade plan", () => {
    const result = evaluateTradeSafetyGate(createGateInput());
    expect(result.decision).toBe("ACCEPTED");
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks stale data, emergency stop, and insufficient reward/risk with exact reasons", () => {
    const input = createGateInput();
    input.intelligence.dataQuality = "STALE";
    input.dailyProtection.emergencyStopActive = true;
    input.dailyProtection.emergencyStopReason = "Manual protection review";
    input.rewardRisk!.rewardRiskRatio = 1;
    const result = evaluateTradeSafetyGate(input);
    expect(result.decision).toBe("REJECTED");
    expect(result.reasons).toContain("Fresh live market data is required before a paper trade can be confirmed.");
    expect(result.reasons).toContain("Manual protection review");
    expect(result.reasons.some((reason) => reason.includes("Reward/risk"))).toBe(true);
  });

  it("blocks high or extreme risk when high-volatility protection is enabled", () => {
    const input = createGateInput();
    input.riskLevel = { level: "HIGH", score: 61, factors: [], unavailableReason: null };
    const result = evaluateTradeSafetyGate(input);
    expect(result.decision).toBe("REJECTED");
    expect(result.reasons).toContain("Configured high-volatility protection blocks this paper trade.");
  });
});
