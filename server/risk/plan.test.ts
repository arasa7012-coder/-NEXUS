import { describe, expect, it } from "vitest";
import { buildRiskPlan } from "./plan";
import type { RiskPlanBuildInput } from "./plan";

function baseInput(): RiskPlanBuildInput {
  return {
    now: 1_723_000_000_000,
    expiresInMs: 60_000,
    request: { requestKey: "plan-1", symbol: "BTC", side: "buy", orderType: "market", requestedQuantity: 1, triggerPriceUsd: null, stopMethod: "fixed", stopPriceOverrideUsd: null, targetPriceOverrideUsd: null },
    settings: { riskPerTradePercent: 1, maxDailyLossPercent: 3, maxDailyDrawdownPercent: 5, maxOpenPositions: 5, maxPortfolioExposurePercent: 80, maxAssetExposurePercent: 25, stopMethod: "fixed", fixedStopPercent: 2, atrMultiplier: 2, structureBufferBps: 10, minimumRewardRisk: 2, consecutiveLossLimit: 3, cooldownMinutes: 60, feeBps: 10, slippageBps: 5, blockHighVolatility: false },
    cashUsd: 100_000,
    positions: [],
    dailyProtection: { riskDayUtc: "2024-08-01", dayStartEquityUsd: 100_000, dayPeakEquityUsd: 100_000, currentEquityUsd: 100_000, realizedPnlTodayUsd: 0, dailyLossPercent: 0, dailyDrawdownPercent: 0, consecutiveLosses: 0, cooldownUntil: null, cooldownActive: false, emergencyStopActive: false, emergencyStopReason: null },
    intelligence: { assetId: "bitcoin", symbol: "BTC", primaryTimeframe: "4h", dataQuality: "LIVE", source: "coinbase", providerUpdatedAt: 1_723_000_000_000, generatedAt: 1_723_000_000_000, opportunityScore: 55, intelligenceRiskScore: 15, signalStrength: 65, regime: "RANGE_CONSOLIDATION", atrUsd: 1000, confirmedSupportUsd: 94_000, timeframeConflict: false },
    referencePriceUsd: 100_000,
  };
}

describe("Risk plan builder", () => {
  it("builds an accepted fresh paper-buy plan with derived stop, bounded sizing, and target", () => {
    const plan = buildRiskPlan(baseInput());
    expect(plan.stop?.stopPriceUsd).toBe(98_000);
    expect(plan.sizing?.approvedQuantity).toBeGreaterThan(0);
    expect(plan.rewardRisk?.rewardRiskRatio).toBeGreaterThanOrEqual(2);
    expect(plan.gate.decision).toBe("ACCEPTED");
  });

  it("rejects a plan when daily protection reports Emergency Stop", () => {
    const input = baseInput();
    input.dailyProtection.emergencyStopActive = true;
    input.dailyProtection.emergencyStopReason = "Manual protection review";
    const plan = buildRiskPlan(input);
    expect(plan.gate.decision).toBe("REJECTED");
    expect(plan.gate.reasons).toContain("Manual protection review");
  });

  it("keeps paper sell planning explicit without inventing a new long stop or target", () => {
    const input = baseInput();
    input.request = { ...input.request, side: "sell" };
    const plan = buildRiskPlan(input);
    expect(plan.stop).toBeNull();
    expect(plan.sizing).toBeNull();
    expect(plan.rewardRisk).toBeNull();
  });
});
