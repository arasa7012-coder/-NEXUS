import { createHash } from "node:crypto";
import { composeAssetIntelligence } from "../intelligence/engine";
import { calculateDailyProtection, calculateNextLossStreak, utcRiskDay } from "../risk/dailyProtection";
import { buildRiskPlan } from "../risk/plan";
import type { ExposurePositionInput } from "../risk/exposure";
import type { IntelligenceRiskContext } from "../risk/types";
import { entryTriggered, exitTriggered, minimumWarmup, validateRuleConfig } from "./rules";
import type { BacktestEquityPoint, BacktestMetrics, BacktestResult, BacktestRunInput, BacktestTradeResult, HistoricalCandle, StrategyInterval } from "./types";
import { StrategyValidationError } from "./types";

const ENGINE_VERSION = "2.2.0" as const;
const intervalMs: Record<StrategyInterval, number> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

interface OpenPosition { tradeIndex: number; quantity: number; entryPriceUsd: number; entryFeeUsd: number; stopPriceUsd: number; targetPriceUsd: number; plannedRiskUsd: number; plannedRiskPercent: number; entryTime: number; maxExposureUsd: number; }
interface State { cashUsd: number; peakEquityUsd: number; storedRiskDayUtc: string; dayStartEquityUsd: number; dayPeakEquityUsd: number; consecutiveLosses: number; cooldownUntil: number | null; realizedEvents: Array<{ realizedPnlUsd: number; occurredAt: number }>; position: OpenPosition | null; }

function finite(value: number, label: string): void { if (!Number.isFinite(value)) throw new StrategyValidationError(`${label} must be finite.`); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`; }
  return JSON.stringify(value);
}
export function fingerprintHistoricalCandles(input: { symbol: string; interval: StrategyInterval; source: string; candles: HistoricalCandle[] }): string { return createHash("sha256").update(stableJson(input)).digest("hex"); }

export function validateHistoricalCandles(candles: HistoricalCandle[], interval: StrategyInterval, minimumCount: number): void {
  if (!Array.isArray(candles) || candles.length < minimumCount) throw new StrategyValidationError(`At least ${minimumCount} closed historical candles are required for this configuration.`);
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    [candle.openTime, candle.closeTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.quoteVolumeUsd, candle.tradeCount].forEach((value) => finite(value, "Historical candle value"));
    if (candle.openTime >= candle.closeTime || candle.low > Math.min(candle.open, candle.close) || candle.high < Math.max(candle.open, candle.close) || candle.low <= 0 || candle.open <= 0 || candle.high <= 0 || candle.close <= 0 || candle.volume < 0 || candle.quoteVolumeUsd < 0 || candle.tradeCount < 0) throw new StrategyValidationError("Historical candles contain an invalid OHLCV value.");
    const prior = candles[index - 1];
    if (prior) {
      if (prior.openTime >= candle.openTime || prior.closeTime >= candle.closeTime) throw new StrategyValidationError("Historical candles must be strictly ordered without duplicate timestamps.");
      if (candle.openTime - prior.openTime !== intervalMs[interval]) throw new StrategyValidationError("Historical candles contain a gap or an interval mismatch; the test cannot be reproduced safely.");
    }
  }
}

function historicalIntelligence(input: BacktestRunInput, candles: HistoricalCandle[], asOf: HistoricalCandle): IntelligenceRiskContext {
  const analysis = composeAssetIntelligence({ assetId: input.symbol.toLowerCase(), name: input.symbol, symbol: input.symbol, preferredTimeframe: input.interval, timeframes: [{ timeframe: input.interval, candles, source: input.source, cachedAt: asOf.closeTime, providerUpdatedAt: asOf.closeTime, providerTimestampOrigin: "provider", isStale: false }] });
  const primary = analysis.timeframes.find((frame) => frame.timeframe === input.interval) ?? null;
  const support = primary?.structure.status === "AVAILABLE" ? primary.structure.value.support.filter((level) => level.price < asOf.close).sort((left, right) => right.price - left.price)[0]?.price ?? null : null;
  return { assetId: input.symbol.toLowerCase(), symbol: input.symbol, primaryTimeframe: analysis.primaryTimeframe, dataQuality: "HISTORICAL", source: input.source, providerUpdatedAt: asOf.closeTime, generatedAt: asOf.closeTime, opportunityScore: analysis.opportunityScore.value, intelligenceRiskScore: analysis.riskScore.value, signalStrength: analysis.signalStrength.value, regime: analysis.regime.status === "AVAILABLE" ? analysis.regime.value.regime : null, atrUsd: primary?.indicators.atr14.status === "AVAILABLE" ? primary.indicators.atr14.value.value : null, confirmedSupportUsd: support, timeframeConflict: analysis.multiTimeframe.status === "AVAILABLE" && ["MIXED_SIGNALS", "TREND_CONFLICT"].includes(analysis.multiTimeframe.value.alignment) };
}

function equity(state: State, markPrice: number): number { return state.cashUsd + (state.position ? state.position.quantity * markPrice : 0); }
function exposure(state: State, markPrice: number): ExposurePositionInput[] { return state.position ? [{ symbol: "BACKTEST", quantity: state.position.quantity, marketValueUsd: state.position.quantity * markPrice, costBasisUsd: state.position.quantity * state.position.entryPriceUsd, plannedRiskUsd: state.position.plannedRiskUsd }] : []; }
function appendPoint(points: BacktestEquityPoint[], state: State, observedAt: number, markPrice: number): void { const value = state.position ? state.position.quantity * markPrice : 0; const total = state.cashUsd + value; state.peakEquityUsd = Math.max(state.peakEquityUsd, total); points.push({ sequence: points.length + 1, observedAt, cashUsd: state.cashUsd, positionValueUsd: value, equityUsd: total, drawdownPercent: state.peakEquityUsd === 0 ? 0 : Math.max(0, (state.peakEquityUsd - total) / state.peakEquityUsd * 100), exposurePercent: total === 0 ? 0 : value / total * 100 }); }
function createRejected(sequence: number, signal: HistoricalCandle, reason: string, gate: unknown, evidence: Record<string, unknown>): BacktestTradeResult { return { sequence, decision: "REJECTED", signalTime: signal.closeTime, entryTime: null, exitTime: null, entryPriceUsd: null, exitPriceUsd: null, quantity: 0, stopPriceUsd: null, targetPriceUsd: null, plannedRiskUsd: null, plannedRiskPercent: null, grossPnlUsd: null, netPnlUsd: null, estimatedFeesUsd: 0, maxExposureUsd: null, exitReason: "REJECTED", gate, evidence, rejectionReason: reason }; }

function closePosition(state: State, trades: BacktestTradeResult[], observed: HistoricalCandle, rawExitPrice: number, exitReason: BacktestTradeResult["exitReason"], feeRate: number): void {
  const position = state.position; if (!position) return;
  const exitPrice = rawExitPrice;
  const trade = trades[position.tradeIndex]!; const exitFee = exitPrice * position.quantity * feeRate;
  const gross = (exitPrice - position.entryPriceUsd) * position.quantity;
  const net = gross - position.entryFeeUsd - exitFee;
  state.cashUsd += exitPrice * position.quantity - exitFee;
  trade.exitTime = observed.closeTime; trade.exitPriceUsd = exitPrice; trade.grossPnlUsd = gross; trade.netPnlUsd = net; trade.estimatedFeesUsd = position.entryFeeUsd + exitFee; trade.exitReason = exitReason;
  trade.evidence = { ...trade.evidence, exitRawPriceUsd: rawExitPrice, exitFillPriceUsd: exitPrice, collisionPolicy: "STOP_FIRST" };
  state.realizedEvents.push({ realizedPnlUsd: net, occurredAt: observed.closeTime });
  const streak = calculateNextLossStreak({ previousConsecutiveLosses: state.consecutiveLosses, realizedPnlUsd: net, occurredAt: observed.closeTime, consecutiveLossLimit: (trade.evidence.consecutiveLossLimit as number) ?? 3, cooldownMinutes: (trade.evidence.cooldownMinutes as number) ?? 30 });
  state.consecutiveLosses = streak.consecutiveLosses; state.cooldownUntil = streak.cooldownUntil; state.position = null;
}

function metrics(input: BacktestRunInput, trades: BacktestTradeResult[], points: BacktestEquityPoint[]): BacktestMetrics {
  const accepted = trades.filter((trade) => trade.decision === "ACCEPTED"); const closed = accepted.filter((trade) => trade.netPnlUsd !== null); const wins = closed.filter((trade) => trade.netPnlUsd! > 0); const losses = closed.filter((trade) => trade.netPnlUsd! < 0); const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnlUsd!, 0); const grossLoss = losses.reduce((sum, trade) => sum + Math.abs(trade.netPnlUsd!), 0); const exposures = points.map((point) => point.exposurePercent); const counts = (reason: BacktestTradeResult["exitReason"]) => closed.filter((trade) => trade.exitReason === reason).length; const finalEquity = points.at(-1)?.equityUsd ?? input.risk.initialEquityUsd;
  return { initialEquityUsd: input.risk.initialEquityUsd, finalEquityUsd: finalEquity, netPnlUsd: finalEquity - input.risk.initialEquityUsd, netPnlPercent: input.risk.initialEquityUsd === 0 ? 0 : (finalEquity - input.risk.initialEquityUsd) / input.risk.initialEquityUsd * 100, tradeCount: closed.length, acceptedDecisionCount: accepted.length, rejectedDecisionCount: trades.length - accepted.length, winCount: wins.length, lossCount: losses.length, winRatePercent: closed.length ? wins.length / closed.length * 100 : null, profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null, maxDrawdownPercent: Math.max(0, ...points.map((point) => point.drawdownPercent)), maximumExposurePercent: Math.max(0, ...exposures), averageExposurePercent: exposures.length ? exposures.reduce((sum, value) => sum + value, 0) / exposures.length : null, stopEventCount: counts("STOP"), targetEventCount: counts("TARGET"), ruleExitCount: counts("RULE_EXIT"), endOfDataExitCount: counts("END_OF_DATA") };
}

export function runDeterministicBacktest(input: BacktestRunInput): BacktestResult {
  const rules = validateRuleConfig(input.rules); const min = minimumWarmup(rules) + 3; validateHistoricalCandles(input.candles, input.interval, min);
  if (!Number.isFinite(input.risk.initialEquityUsd) || input.risk.initialEquityUsd <= 0 || input.risk.initialEquityUsd > 100_000_000) throw new StrategyValidationError("Initial virtual equity must be finite, positive, and bounded.");
  const startedAt = input.candles[0]!.openTime; const state: State = { cashUsd: input.risk.initialEquityUsd, peakEquityUsd: input.risk.initialEquityUsd, storedRiskDayUtc: utcRiskDay(startedAt), dayStartEquityUsd: input.risk.initialEquityUsd, dayPeakEquityUsd: input.risk.initialEquityUsd, consecutiveLosses: 0, cooldownUntil: null, realizedEvents: [], position: null }; const trades: BacktestTradeResult[] = []; const points: BacktestEquityPoint[] = []; const feeRate = input.risk.feeBps / 10_000; const slippageRate = input.risk.slippageBps / 10_000;
  for (let index = minimumWarmup(rules); index < input.candles.length - 1; index += 1) {
    const candle = input.candles[index]!; const available = input.candles.slice(0, index + 1); const currentEquity = equity(state, candle.close);
    const daily = calculateDailyProtection({ now: candle.closeTime, storedRiskDayUtc: state.storedRiskDayUtc, storedDayStartEquityUsd: state.dayStartEquityUsd, storedDayPeakEquityUsd: state.dayPeakEquityUsd, currentEquityUsd: currentEquity, realizedEvents: state.realizedEvents, consecutiveLosses: state.consecutiveLosses, cooldownUntil: state.cooldownUntil, emergencyStopActive: false, emergencyStopReason: null });
    state.storedRiskDayUtc = daily.riskDayUtc; state.dayStartEquityUsd = daily.dayStartEquityUsd; state.dayPeakEquityUsd = daily.dayPeakEquityUsd;
    if (state.position) { const stopHit = candle.low <= state.position.stopPriceUsd; const targetHit = candle.high >= state.position.targetPriceUsd; if (stopHit || targetHit) { const raw = stopHit ? state.position.stopPriceUsd : state.position.targetPriceUsd; closePosition(state, trades, candle, raw * (1 - slippageRate), stopHit ? "STOP" : "TARGET", feeRate); } else if (exitTriggered(rules.exit, available)) closePosition(state, trades, candle, candle.close * (1 - slippageRate), "RULE_EXIT", feeRate); }
    if (!state.position && entryTriggered(rules.entry, available)) {
      const intelligence = historicalIntelligence(input, available, candle); const plan = buildRiskPlan({ now: candle.closeTime, expiresInMs: intervalMs[input.interval], request: { requestKey: `backtest:${input.datasetFingerprint}:${index}`, symbol: input.symbol, side: "buy", orderType: "market", requestedQuantity: rules.requestedQuantity, triggerPriceUsd: null, stopMethod: input.risk.stopMethod, stopPriceOverrideUsd: null, targetPriceOverrideUsd: null }, settings: input.risk, cashUsd: state.cashUsd, positions: exposure(state, candle.close), dailyProtection: daily, intelligence, referencePriceUsd: candle.close });
      if (plan.gate.decision !== "ACCEPTED" || !plan.sizing || !plan.stop || !plan.rewardRisk) trades.push(createRejected(trades.length + 1, candle, plan.gate.primaryReason ?? "The historical safety gate rejected this entry.", plan.gate, { datasetFingerprint: input.datasetFingerprint, intelligence, rule: rules.entry }));
      else { const next = input.candles[index + 1]!; const fill = next.open * (1 + slippageRate); const quantity = plan.sizing.approvedQuantity; const fee = fill * quantity * feeRate; const total = fill * quantity + fee; if (total > state.cashUsd + 1e-8) trades.push(createRejected(trades.length + 1, candle, "Next-candle opening fill exceeds available virtual cash; the approved historical plan is not silently resized.", plan.gate, { datasetFingerprint: input.datasetFingerprint, expectedFillUsd: plan.sizing.estimatedEntryFillUsd, nextOpenUsd: next.open, fillUsd: fill })); else { state.cashUsd -= total; const trade: BacktestTradeResult = { sequence: trades.length + 1, decision: "ACCEPTED", signalTime: candle.closeTime, entryTime: next.openTime, exitTime: null, entryPriceUsd: fill, exitPriceUsd: null, quantity, stopPriceUsd: plan.stop.stopPriceUsd, targetPriceUsd: plan.rewardRisk.targetPriceUsd, plannedRiskUsd: plan.sizing.plannedLossUsd, plannedRiskPercent: plan.sizing.plannedRiskPercent, grossPnlUsd: null, netPnlUsd: null, estimatedFeesUsd: fee, maxExposureUsd: quantity * fill, exitReason: "END_OF_DATA", gate: plan.gate, evidence: { datasetFingerprint: input.datasetFingerprint, rule: rules.entry, plan, feeBps: input.risk.feeBps, slippageBps: input.risk.slippageBps, consecutiveLossLimit: input.risk.consecutiveLossLimit, cooldownMinutes: input.risk.cooldownMinutes }, rejectionReason: null }; trades.push(trade); state.position = { tradeIndex: trades.length - 1, quantity, entryPriceUsd: fill, entryFeeUsd: fee, stopPriceUsd: plan.stop.stopPriceUsd, targetPriceUsd: plan.rewardRisk.targetPriceUsd, plannedRiskUsd: plan.sizing.plannedLossUsd, plannedRiskPercent: plan.sizing.plannedRiskPercent, entryTime: next.openTime, maxExposureUsd: quantity * fill }; } }
    }
    appendPoint(points, state, candle.closeTime, candle.close);
  }
  const finalCandle = input.candles.at(-1)!; if (state.position) closePosition(state, trades, finalCandle, finalCandle.close * (1 - slippageRate), "END_OF_DATA", feeRate); appendPoint(points, state, finalCandle.closeTime, finalCandle.close);
  const completedAt = finalCandle.closeTime; return { engineVersion: ENGINE_VERSION, simulation: true, datasetFingerprint: input.datasetFingerprint, symbol: input.symbol, interval: input.interval, source: input.source, startedAt, completedAt, trades, equityCurve: points, metrics: metrics(input, trades, points), disclaimer: "This is a deterministic historical paper simulation based on a stored closed-candle dataset. It never submits an external order and is not financial advice." };
}
