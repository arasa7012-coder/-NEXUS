import { describe, expect, it } from "vitest";
import { calculateStop, StopCalculationError } from "./stops";
import { calculateRewardRisk, deriveMinimumTargetPrice, RewardRiskCalculationError } from "./rewardRisk";

const stopBase = {
  entryPriceUsd: 100,
  fixedStopPercent: 2,
  atrUsd: 1.5,
  atrMultiplier: 2,
  confirmedSupportUsd: 96,
  structureBufferBps: 10,
  timeframe: "1h",
  source: "Coinbase Exchange",
  providerUpdatedAt: 1_723_000_000_000,
};

describe("stop-loss engine", () => {
  it("calculates a fixed-percentage stop with traceable evidence", () => {
    const stop = calculateStop({ ...stopBase, method: "fixed" });
    expect(stop.stopPriceUsd).toBe(98);
    expect(stop.distancePercent).toBeCloseTo(2, 10);
    expect(stop.explanation).toContain("not a guaranteed loss cap");
  });

  it("calculates an ATR-based stop", () => {
    const stop = calculateStop({ ...stopBase, method: "atr" });
    expect(stop.stopPriceUsd).toBe(97);
    expect(stop.timeframe).toBe("1h");
    expect(stop.explanation).toContain("2.00×");
  });

  it("calculates a buffered market-structure stop", () => {
    const stop = calculateStop({ ...stopBase, method: "structure" });
    expect(stop.stopPriceUsd).toBeCloseTo(95.904, 8);
    expect(stop.explanation).toContain("confirmed support");
  });

  it("does not invent missing ATR or structure evidence", () => {
    expect(() => calculateStop({ ...stopBase, method: "atr", atrUsd: null })).toThrowError(StopCalculationError);
    expect(() => calculateStop({ ...stopBase, method: "structure", confirmedSupportUsd: null })).toThrowError(/confirmed support/);
  });

  it("rejects a structure level at or above entry and an ATR stop below zero", () => {
    expect(() => calculateStop({ ...stopBase, method: "structure", confirmedSupportUsd: 101 })).toThrowError(/below the planned/);
    expect(() => calculateStop({ ...stopBase, method: "atr", atrUsd: 60 })).toThrowError(/positive long-position stop/);
  });
});

describe("reward/risk engine", () => {
  it("derives a target that meets the configured net reward/risk after friction", () => {
    const target = deriveMinimumTargetPrice({
      quantity: 10,
      entryPriceUsd: 100,
      plannedLossUsd: 52,
      minimumRewardRisk: 2,
      feeBps: 10,
      slippageBps: 5,
    });
    const result = calculateRewardRisk({
      quantity: 10,
      entryPriceUsd: 100,
      targetPriceUsd: target,
      plannedLossUsd: 52,
      feeBps: 10,
      slippageBps: 5,
    });
    expect(result.rewardRiskRatio).toBeCloseTo(2, 10);
    expect(result.potentialRewardUsd).toBeCloseTo(104, 8);
  });

  it("reports the net reward/risk for a user-supplied higher target", () => {
    const result = calculateRewardRisk({
      quantity: 5,
      entryPriceUsd: 100,
      targetPriceUsd: 115,
      plannedLossUsd: 30,
      feeBps: 10,
      slippageBps: 5,
    });
    expect(result.rewardRiskRatio).toBeGreaterThan(2);
  });

  it("rejects a target whose friction-adjusted reward is not positive", () => {
    expect(() => calculateRewardRisk({
      quantity: 1,
      entryPriceUsd: 100,
      targetPriceUsd: 100,
      plannedLossUsd: 5,
      feeBps: 10,
      slippageBps: 5,
    })).toThrowError(RewardRiskCalculationError);
  });
});
