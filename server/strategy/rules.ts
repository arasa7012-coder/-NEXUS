import type { HistoricalCandle, StrategyEntryRule, StrategyExitRule, StrategyRuleConfig } from "./types";
import { StrategyValidationError } from "./types";

function finitePeriod(value: number, label: string, min = 2, max = 200): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new StrategyValidationError(`${label} must be a whole number from ${min} to ${max}.`);
}
function closes(candles: HistoricalCandle[], period: number): number[] { return candles.slice(-period).map((candle) => candle.close); }
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
export function calculateRsi(candles: HistoricalCandle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let gains = 0; let losses = 0;
  const window = candles.slice(-(period + 1));
  for (let index = 1; index < window.length; index += 1) { const change = window[index]!.close - window[index - 1]!.close; gains += Math.max(change, 0); losses += Math.max(-change, 0); }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const relativeStrength = (gains / period) / (losses / period);
  return 100 - 100 / (1 + relativeStrength);
}
function crossover(candles: HistoricalCandle[], fastPeriod: number, slowPeriod: number, up: boolean): boolean {
  if (candles.length < slowPeriod + 1) return false;
  const prior = candles.slice(0, -1); const fastNow = average(closes(candles, fastPeriod)); const slowNow = average(closes(candles, slowPeriod)); const fastPrior = average(closes(prior, fastPeriod)); const slowPrior = average(closes(prior, slowPeriod));
  return up ? fastPrior <= slowPrior && fastNow > slowNow : fastPrior >= slowPrior && fastNow < slowNow;
}
export function validateRuleConfig(config: StrategyRuleConfig): StrategyRuleConfig {
  if (config.version !== 1) throw new StrategyValidationError("Unsupported strategy rule configuration version.");
  if (!Number.isFinite(config.requestedQuantity) || config.requestedQuantity <= 0 || config.requestedQuantity > 1_000_000_000) throw new StrategyValidationError("Requested quantity must be finite, positive, and bounded.");
  const validateCross = (rule: { fastPeriod: number; slowPeriod: number }) => { finitePeriod(rule.fastPeriod, "Fast period"); finitePeriod(rule.slowPeriod, "Slow period"); if (rule.fastPeriod >= rule.slowPeriod) throw new StrategyValidationError("Fast period must be lower than slow period."); };
  if (config.entry.type === "SMA_CROSSOVER") validateCross(config.entry);
  if (config.entry.type === "RSI_RECOVERY") { finitePeriod(config.entry.period, "RSI period"); if (config.entry.oversoldThreshold < 5 || config.entry.oversoldThreshold > 45) throw new StrategyValidationError("RSI oversold threshold must be between 5 and 45."); }
  if (config.entry.type === "BREAKOUT") finitePeriod(config.entry.lookback, "Breakout lookback", 2, 180);
  if (config.exit.type === "SMA_CROSSUNDER") validateCross(config.exit);
  if (config.exit.type === "RSI_OVERBOUGHT") { finitePeriod(config.exit.period, "RSI period"); if (config.exit.overboughtThreshold < 55 || config.exit.overboughtThreshold > 95) throw new StrategyValidationError("RSI overbought threshold must be between 55 and 95."); }
  return config;
}
export function minimumWarmup(config: StrategyRuleConfig): number { const periods = [60]; if (config.entry.type === "SMA_CROSSOVER") periods.push(config.entry.slowPeriod + 1); if (config.entry.type === "RSI_RECOVERY") periods.push(config.entry.period + 2); if (config.entry.type === "BREAKOUT") periods.push(config.entry.lookback + 1); if (config.exit.type === "SMA_CROSSUNDER") periods.push(config.exit.slowPeriod + 1); if (config.exit.type === "RSI_OVERBOUGHT") periods.push(config.exit.period + 1); return Math.max(...periods); }
export function entryTriggered(rule: StrategyEntryRule, candles: HistoricalCandle[]): boolean {
  if (rule.type === "SMA_CROSSOVER") return crossover(candles, rule.fastPeriod, rule.slowPeriod, true);
  if (rule.type === "RSI_RECOVERY") { const current = calculateRsi(candles, rule.period); const previous = calculateRsi(candles.slice(0, -1), rule.period); return current !== null && previous !== null && previous <= rule.oversoldThreshold && current > rule.oversoldThreshold; }
  if (candles.length < rule.lookback + 1) return false;
  return candles.at(-1)!.close > Math.max(...candles.slice(-(rule.lookback + 1), -1).map((candle) => candle.high));
}
export function exitTriggered(rule: StrategyExitRule, candles: HistoricalCandle[]): boolean { if (rule.type === "NONE") return false; if (rule.type === "SMA_CROSSUNDER") return crossover(candles, rule.fastPeriod, rule.slowPeriod, false); const current = calculateRsi(candles, rule.period); return current !== null && current >= rule.overboughtThreshold; }
