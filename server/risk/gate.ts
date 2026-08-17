import type {
  DailyProtectionSnapshot,
  ExposureSnapshot,
  IntelligenceRiskContext,
  PositionSizeResult,
  RewardRiskResult,
  RiskLevelResult,
  RiskSettings,
  SafetyCheck,
  SafetyGateResult,
  StopEvidence,
  TradeSide,
} from "./types";

export interface TradeSafetyGateInput {
  side: TradeSide;
  referencePriceUsd: number;
  stop: StopEvidence | null;
  sizing: PositionSizeResult | null;
  rewardRisk: RewardRiskResult | null;
  exposure: ExposureSnapshot;
  dailyProtection: DailyProtectionSnapshot;
  riskLevel: RiskLevelResult;
  intelligence: IntelligenceRiskContext;
  settings: RiskSettings;
}

function check(id: string, label: string, critical: boolean, passed: boolean, passReason: string, blockReason: string): SafetyCheck {
  return { id, label, critical, status: passed ? "PASS" : "BLOCK", reason: passed ? passReason : blockReason };
}

function warning(id: string, label: string, reason: string): SafetyCheck {
  return { id, label, critical: false, status: "NOT_APPLICABLE", reason };
}

export function evaluateTradeSafetyGate(input: TradeSafetyGateInput): SafetyGateResult {
  const checks: SafetyCheck[] = [];
  const usableMarketBasis = input.intelligence.dataQuality === "LIVE" || input.intelligence.dataQuality === "HISTORICAL";
  checks.push(check("freshness", "Validated market-data basis", true, usableMarketBasis, input.intelligence.dataQuality === "HISTORICAL" ? "Closed historical dataset is available." : "Live market data is available.", "Fresh live market data is required before a paper trade can be confirmed."));

  const entryValid = Number.isFinite(input.referencePriceUsd) && input.referencePriceUsd > 0;
  checks.push(check("entry", "Reference entry", true, entryValid, "A finite live reference entry is available.", "A finite live reference entry is required."));

  if (input.side === "sell") {
    checks.push(warning("exit-side", "Sell-side plan", "A sell is treated as a paper position reduction; no new long-position stop/target plan is inferred."));
  } else {
    const validStop = input.stop !== null && Number.isFinite(input.stop.stopPriceUsd) && input.stop.stopPriceUsd > 0 && input.stop.stopPriceUsd < input.referencePriceUsd;
    checks.push(check("stop", "Protective stop", true, validStop, "A side-aware protective stop is available below entry.", "A valid protective stop below entry is required."));
    const sizingValid = input.sizing !== null && input.sizing.approvedQuantity > 0 && input.sizing.plannedLossUsd <= input.sizing.maximumPlannedLossUsd + 1e-8;
    checks.push(check("size", "Risk-bounded size", true, sizingValid, "Requested paper size is bounded by risk, cash, and exposure.", "No positive paper size remains within configured risk, cash, or exposure limits."));
    const rewardRiskValid = input.rewardRisk !== null && input.rewardRisk.rewardRiskRatio + 1e-8 >= input.settings.minimumRewardRisk;
    checks.push(check("reward-risk", "Minimum reward/risk", true, rewardRiskValid, `Reward/risk meets the ${input.settings.minimumRewardRisk.toFixed(2)} minimum.`, `Reward/risk is below the configured ${input.settings.minimumRewardRisk.toFixed(2)} minimum.`));
  }

  const exposureValid = input.exposure.dataComplete
    && input.exposure.projectedTotalExposurePercent <= input.settings.maxPortfolioExposurePercent + 1e-8
    && input.exposure.projectedAssetExposurePercent <= input.settings.maxAssetExposurePercent + 1e-8
    && input.exposure.positionCount < input.settings.maxOpenPositions;
  checks.push(check("exposure", "Portfolio exposure", true, exposureValid, "Projected exposure and position count remain within configured limits.", "Projected portfolio or asset exposure, position count, or price completeness violates a configured limit."));

  const dailyLossValid = input.dailyProtection.dailyLossPercent <= input.settings.maxDailyLossPercent + 1e-8;
  checks.push(check("daily-loss", "Daily loss limit", true, dailyLossValid, "Measured daily loss remains within the configured limit.", "Measured daily loss has reached the configured limit."));
  const drawdownValid = input.dailyProtection.dailyDrawdownPercent <= input.settings.maxDailyDrawdownPercent + 1e-8;
  checks.push(check("drawdown", "Daily drawdown limit", true, drawdownValid, "Measured daily drawdown remains within the configured limit.", "Measured daily drawdown has reached the configured limit."));
  checks.push(check("cooldown", "Cooldown", true, !input.dailyProtection.cooldownActive, "No cooldown is active.", "A protection cooldown is active after recent paper-trade losses."));
  checks.push(check("emergency-stop", "Emergency Stop", true, !input.dailyProtection.emergencyStopActive, "Emergency Stop is inactive.", input.dailyProtection.emergencyStopReason ?? "Emergency Stop is active."));

  const riskKnown = input.riskLevel.level !== null && input.riskLevel.score !== null;
  const riskAcceptable = riskKnown && input.riskLevel.level !== "EXTREME";
  checks.push(check("risk-level", "Measured risk level", true, riskAcceptable, `Measured risk level is ${input.riskLevel.level}.`, input.riskLevel.unavailableReason ?? "Measured risk is extreme and blocks a new paper trade."));
  if (input.settings.blockHighVolatility) {
    const volatilityAcceptable = input.riskLevel.level !== "HIGH" && input.riskLevel.level !== "EXTREME";
    checks.push(check("volatility", "High-volatility protection", true, volatilityAcceptable, "High-volatility protection permits this measured risk level.", "Configured high-volatility protection blocks this paper trade."));
  }
  if (input.intelligence.timeframeConflict) {
    checks.push(warning("timeframes", "Timeframe conflict", "Available intelligence timeframes are mixed; this is recorded as a caution, not a forecast."));
  }

  const blocked = checks.filter((item) => item.critical && item.status === "BLOCK");
  const reasons = blocked.map((item) => item.reason);
  return {
    decision: blocked.length === 0 ? "ACCEPTED" : "REJECTED",
    checks,
    reasons,
    primaryReason: reasons[0] ?? null,
  };
}
