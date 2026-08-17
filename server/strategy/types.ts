import type { RiskSettings, RiskStopMethod } from "../risk/types";

export const strategyIntervals = ["5m", "15m", "1h", "4h", "1d"] as const;
export type StrategyInterval = (typeof strategyIntervals)[number];
export type StrategyEntryRule =
  | { type: "SMA_CROSSOVER"; fastPeriod: number; slowPeriod: number }
  | { type: "RSI_RECOVERY"; period: number; oversoldThreshold: number }
  | { type: "BREAKOUT"; lookback: number };
export type StrategyExitRule =
  | { type: "NONE" }
  | { type: "SMA_CROSSUNDER"; fastPeriod: number; slowPeriod: number }
  | { type: "RSI_OVERBOUGHT"; period: number; overboughtThreshold: number };

export interface StrategyRuleConfig {
  version: 1;
  entry: StrategyEntryRule;
  exit: StrategyExitRule;
  requestedQuantity: number;
}

export interface StrategyRiskConfig extends RiskSettings {
  initialEquityUsd: number;
  stopMethod: RiskStopMethod;
}

export interface HistoricalCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolumeUsd: number;
  tradeCount: number;
}

export interface BacktestRunInput {
  symbol: string;
  interval: StrategyInterval;
  source: "binance" | "coinbase";
  datasetFingerprint: string;
  candles: HistoricalCandle[];
  rules: StrategyRuleConfig;
  risk: StrategyRiskConfig;
}

export interface BacktestTradeResult {
  sequence: number;
  decision: "ACCEPTED" | "REJECTED";
  signalTime: number;
  entryTime: number | null;
  exitTime: number | null;
  entryPriceUsd: number | null;
  exitPriceUsd: number | null;
  quantity: number;
  stopPriceUsd: number | null;
  targetPriceUsd: number | null;
  plannedRiskUsd: number | null;
  plannedRiskPercent: number | null;
  grossPnlUsd: number | null;
  netPnlUsd: number | null;
  estimatedFeesUsd: number;
  maxExposureUsd: number | null;
  exitReason: "STOP" | "TARGET" | "RULE_EXIT" | "END_OF_DATA" | "REJECTED";
  gate: unknown;
  evidence: Record<string, unknown>;
  rejectionReason: string | null;
}

export interface BacktestEquityPoint {
  sequence: number;
  observedAt: number;
  cashUsd: number;
  positionValueUsd: number;
  equityUsd: number;
  drawdownPercent: number;
  exposurePercent: number;
}

export interface BacktestMetrics {
  initialEquityUsd: number;
  finalEquityUsd: number;
  netPnlUsd: number;
  netPnlPercent: number;
  tradeCount: number;
  acceptedDecisionCount: number;
  rejectedDecisionCount: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number | null;
  profitFactor: number | null;
  maxDrawdownPercent: number;
  maximumExposurePercent: number;
  averageExposurePercent: number | null;
  stopEventCount: number;
  targetEventCount: number;
  ruleExitCount: number;
  endOfDataExitCount: number;
}

export interface BacktestResult {
  engineVersion: "2.2.0";
  simulation: true;
  datasetFingerprint: string;
  symbol: string;
  interval: StrategyInterval;
  source: "binance" | "coinbase";
  startedAt: number;
  completedAt: number;
  trades: BacktestTradeResult[];
  equityCurve: BacktestEquityPoint[];
  metrics: BacktestMetrics;
  disclaimer: string;
}

export class StrategyValidationError extends Error {
  constructor(message: string) { super(message); this.name = "StrategyValidationError"; }
}
