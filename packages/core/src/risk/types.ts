export type RiskStopMethod = "fixed" | "atr" | "structure";
export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "EXTREME";
export type RiskDataQuality = "LIVE" | "HISTORICAL" | "STALE" | "UNAVAILABLE" | "ERROR";
export type TradeSide = "buy" | "sell";
export type PaperOrderType = "market" | "limit" | "stop";
export type SafetyCheckStatus = "PASS" | "BLOCK" | "NOT_APPLICABLE";
export type TradeDecision = "ACCEPTED" | "REJECTED";

export interface RiskSettings {
  riskPerTradePercent: number;
  maxDailyLossPercent: number;
  maxDailyDrawdownPercent: number;
  maxOpenPositions: number;
  maxPortfolioExposurePercent: number;
  maxAssetExposurePercent: number;
  stopMethod: RiskStopMethod;
  fixedStopPercent: number;
  atrMultiplier: number;
  structureBufferBps: number;
  minimumRewardRisk: number;
  consecutiveLossLimit: number;
  cooldownMinutes: number;
  feeBps: number;
  slippageBps: number;
  blockHighVolatility: boolean;
}

export interface StopEvidence {
  method: RiskStopMethod;
  entryPriceUsd: number;
  stopPriceUsd: number;
  distanceUsd: number;
  distancePercent: number;
  timeframe: string | null;
  source: string;
  providerUpdatedAt: number | null;
  explanation: string;
}

export interface PositionSizeResult {
  recommendedQuantity: number;
  requestedQuantity: number;
  approvedQuantity: number;
  estimatedEntryFillUsd: number;
  estimatedStopFillUsd: number;
  notionalUsd: number;
  estimatedEntryFeeUsd: number;
  estimatedExitFeeUsd: number;
  estimatedFeesUsd: number;
  lossPerUnitUsd: number;
  maximumPlannedLossUsd: number;
  plannedLossUsd: number;
  plannedRiskPercent: number;
  remainingCashUsd: number;
  limitingFactor: "RISK" | "CASH" | "TOTAL_EXPOSURE" | "ASSET_EXPOSURE" | "REQUESTED_QUANTITY";
}

export interface RewardRiskResult {
  targetPriceUsd: number;
  estimatedTargetFillUsd: number;
  potentialRewardUsd: number;
  plannedLossUsd: number;
  rewardRiskRatio: number;
}

export interface ExposureSnapshot {
  equityUsd: number;
  cashUsd: number;
  positionCount: number;
  totalExposureUsd: number;
  totalExposurePercent: number;
  assetExposureUsd: number;
  assetExposurePercent: number;
  openPlannedRiskUsd: number;
  projectedTotalExposureUsd: number;
  projectedTotalExposurePercent: number;
  projectedAssetExposureUsd: number;
  projectedAssetExposurePercent: number;
  dataComplete: boolean;
  unavailableSymbols: string[];
}

export interface DailyProtectionSnapshot {
  riskDayUtc: string;
  dayStartEquityUsd: number;
  dayPeakEquityUsd: number;
  currentEquityUsd: number;
  realizedPnlTodayUsd: number;
  dailyLossPercent: number;
  dailyDrawdownPercent: number;
  consecutiveLosses: number;
  cooldownUntil: number | null;
  cooldownActive: boolean;
  emergencyStopActive: boolean;
  emergencyStopReason: string | null;
}

export interface RiskFactor {
  id: string;
  label: string;
  points: number;
  maxPoints: number;
  description: string;
}

export interface RiskLevelResult {
  level: RiskLevel | null;
  score: number | null;
  factors: RiskFactor[];
  unavailableReason: string | null;
}

export interface SafetyCheck {
  id: string;
  label: string;
  status: SafetyCheckStatus;
  critical: boolean;
  reason: string;
}

export interface SafetyGateResult {
  decision: TradeDecision;
  checks: SafetyCheck[];
  reasons: string[];
  primaryReason: string | null;
}

export interface IntelligenceRiskContext {
  assetId: string;
  symbol: string;
  primaryTimeframe: string | null;
  dataQuality: RiskDataQuality;
  source: string;
  providerUpdatedAt: number | null;
  generatedAt: number;
  opportunityScore: number | null;
  intelligenceRiskScore: number | null;
  signalStrength: number | null;
  regime: string | null;
  atrUsd: number | null;
  confirmedSupportUsd: number | null;
  timeframeConflict: boolean;
}

export interface TradePlanRequest {
  requestKey: string;
  symbol: string;
  side: TradeSide;
  orderType: PaperOrderType;
  requestedQuantity: number;
  triggerPriceUsd: number | null;
  stopMethod: RiskStopMethod;
  stopPriceOverrideUsd: number | null;
  targetPriceOverrideUsd: number | null;
}

export interface TradePlanPreview {
  simulation: true;
  expiresAt: number;
  request: TradePlanRequest;
  referencePriceUsd: number;
  stop: StopEvidence | null;
  sizing: PositionSizeResult | null;
  rewardRisk: RewardRiskResult | null;
  exposure: ExposureSnapshot;
  dailyProtection: DailyProtectionSnapshot;
  riskLevel: RiskLevelResult;
  intelligence: IntelligenceRiskContext;
  gate: SafetyGateResult;
  disclaimer: string;
}

export interface MonitoredPositionRisk {
  positionId: number;
  symbol: string;
  quantity: number;
  currentPriceUsd: number | null;
  unrealizedPnlUsd: number | null;
  stopPriceUsd: number | null;
  targetPriceUsd: number | null;
  distanceToStopPercent: number | null;
  distanceToTargetPercent: number | null;
  plannedRiskUsd: number | null;
  currentRiskLevel: RiskLevel | null;
  openingRegime: string | null;
  currentRegime: string | null;
  regimeChanged: boolean;
  dataQuality: RiskDataQuality;
  source: string | null;
  providerUpdatedAt: number | null;
  evaluatedAt: number;
  protectionStatus: "MONITORED" | "STOP_OBSERVED" | "TARGET_OBSERVED" | "DATA_UNAVAILABLE";
}
