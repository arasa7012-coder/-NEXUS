import { describe, expect, it } from "vitest";
import { evaluatePositionRisk } from "./monitor";
import type { PositionMonitoringInput } from "./monitor";

function baseInput(): PositionMonitoringInput {
  return {
    positionId: 4,
    symbol: "BTC",
    quantity: 0.25,
    averageCostUsd: 100_000,
    stopPriceUsd: 96_000,
    targetPriceUsd: 110_000,
    plannedRiskUsd: 1_000,
    openingRegime: "TRENDING_BULLISH",
    quote: { priceUsd: 102_000, source: "coinbase", providerUpdatedAt: 1_723_000_000_000, isStale: false },
    intelligence: { assetId: "bitcoin", symbol: "BTC", primaryTimeframe: "4h", dataQuality: "LIVE", source: "coinbase", providerUpdatedAt: 1_723_000_000_000, generatedAt: 1_723_000_000_000, opportunityScore: 60, intelligenceRiskScore: 10, signalStrength: 65, regime: "TRENDING_BULLISH", atrUsd: 2_000, confirmedSupportUsd: 98_000, timeframeConflict: false },
    now: 1_723_000_030_000,
  };
}

describe("session-scoped position monitoring", () => {
  it("records stop observation without placing a protective order", () => {
    const input = baseInput();
    input.quote = { ...input.quote!, priceUsd: 96_000 };
    const result = evaluatePositionRisk(input);
    expect(result.protectionStatus).toBe("STOP_OBSERVED");
    expect(result.unrealizedPnlUsd).toBe(-1_000);
  });

  it("records target observation from a fresh reference quote", () => {
    const input = baseInput();
    input.quote = { ...input.quote!, priceUsd: 110_000 };
    const result = evaluatePositionRisk(input);
    expect(result.protectionStatus).toBe("TARGET_OBSERVED");
    expect(result.distanceToTargetPercent).toBe(0);
  });

  it("reports a current-regime change without inferring a forecast or action", () => {
    const input = baseInput();
    input.intelligence = { ...input.intelligence, regime: "HIGH_VOLATILITY" };
    const result = evaluatePositionRisk(input);
    expect(result.protectionStatus).toBe("MONITORED");
    expect(result.regimeChanged).toBe(true);
    expect(result.currentRegime).toBe("HIGH_VOLATILITY");
  });

  it("surfaces unavailable data instead of reusing an old price", () => {
    const input = baseInput();
    input.quote = null;
    const result = evaluatePositionRisk(input);
    expect(result.protectionStatus).toBe("DATA_UNAVAILABLE");
    expect(result.currentPriceUsd).toBeNull();
    expect(result.unrealizedPnlUsd).toBeNull();
  });
});
