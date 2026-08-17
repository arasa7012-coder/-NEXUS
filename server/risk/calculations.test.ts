import { describe, expect, it } from "vitest";
import { RiskCalculationError, calculatePlannedRisk, calculatePositionSize } from "./calculations";

const base = {
  accountEquityUsd: 100_000,
  availableCashUsd: 100_000,
  entryPriceUsd: 100,
  stopPriceUsd: 95,
  requestedQuantity: 1_000,
  riskPerTradePercent: 1,
  feeBps: 10,
  slippageBps: 5,
  remainingTotalExposureUsd: 80_000,
  remainingAssetExposureUsd: 25_000,
};

describe("risk and position sizing", () => {
  it("sizes down to the configured planned-loss budget including fees and slippage", () => {
    const result = calculatePositionSize(base);
    expect(result.limitingFactor).toBe("RISK");
    expect(result.maximumPlannedLossUsd).toBe(1_000);
    expect(result.plannedLossUsd).toBeLessThanOrEqual(1_000);
    expect(result.plannedRiskPercent).toBeLessThanOrEqual(1);
    expect(result.estimatedEntryFillUsd).toBeGreaterThan(base.entryPriceUsd);
    expect(result.estimatedStopFillUsd).toBeLessThan(base.stopPriceUsd);
    expect(result.estimatedFeesUsd).toBeGreaterThan(0);
  });

  it("allows the requested quantity when it is below every protective limit", () => {
    const result = calculatePositionSize({ ...base, requestedQuantity: 1 });
    expect(result.limitingFactor).toBe("REQUESTED_QUANTITY");
    expect(result.approvedQuantity).toBe(1);
    expect(result.recommendedQuantity).toBeGreaterThan(1);
  });

  it("identifies cash as the limiting factor", () => {
    const result = calculatePositionSize({
      ...base,
      accountEquityUsd: 100_000,
      availableCashUsd: 1_000,
      stopPriceUsd: 99,
      riskPerTradePercent: 5,
      remainingTotalExposureUsd: 100_000,
      remainingAssetExposureUsd: 100_000,
    });
    expect(result.limitingFactor).toBe("CASH");
    expect(result.remainingCashUsd).toBeGreaterThanOrEqual(0);
  });

  it("identifies total and per-asset exposure capacity independently", () => {
    const totalLimited = calculatePositionSize({ ...base, remainingTotalExposureUsd: 500, remainingAssetExposureUsd: 10_000 });
    expect(totalLimited.limitingFactor).toBe("TOTAL_EXPOSURE");

    const assetLimited = calculatePositionSize({ ...base, remainingTotalExposureUsd: 10_000, remainingAssetExposureUsd: 400 });
    expect(assetLimited.limitingFactor).toBe("ASSET_EXPOSURE");
  });

  it("reports planned risk for a chosen quantity", () => {
    const result = calculatePlannedRisk({
      quantity: 2,
      accountEquityUsd: 10_000,
      entryPriceUsd: 200,
      stopPriceUsd: 190,
      feeBps: 10,
      slippageBps: 5,
    });
    expect(result.plannedLossUsd).toBeGreaterThan(20);
    expect(result.plannedRiskPercent).toBeCloseTo((result.plannedLossUsd / 10_000) * 100, 10);
  });

  it("rejects a stop at or above a long entry", () => {
    expect(() => calculatePositionSize({ ...base, stopPriceUsd: 100 })).toThrowError(RiskCalculationError);
    expect(() => calculatePositionSize({ ...base, stopPriceUsd: 101 })).toThrowError(/stop must be below/);
  });

  it("rejects non-finite inputs and zero capacity", () => {
    expect(() => calculatePositionSize({ ...base, requestedQuantity: Number.NaN })).toThrowError(/Requested quantity/);
    expect(() => calculatePositionSize({ ...base, remainingAssetExposureUsd: 0 })).toThrowError(/do not permit a positive/);
  });
});
