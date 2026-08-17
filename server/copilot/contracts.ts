export const copilotRequestKinds = ["MARKET", "SETUP", "RISK", "PAPER_TRADE", "PORTFOLIO", "BACKTEST", "BRIEFING"] as const;
export type CopilotRequestKind = (typeof copilotRequestKinds)[number];

export const smartAlertSeverities = ["INFO", "WATCH", "WARNING", "CRITICAL"] as const;
export type SmartAlertSeverity = (typeof smartAlertSeverities)[number];

export const smartAlertTypes = [
  "STRUCTURE_CHANGE",
  "MOMENTUM_CHANGE",
  "VOLATILITY_SPIKE",
  "VOLUME_ANOMALY",
  "OPPORTUNITY_SCORE_HIGH",
  "RISK_SCORE_HIGH",
  "MARKET_REGIME_CHANGE",
  "STOP_PROXIMITY",
  "TARGET_PROXIMITY",
  "PAPER_POSITION_RISK_CHANGE",
  "DATA_UNAVAILABLE",
] as const;
export type SmartAlertType = (typeof smartAlertTypes)[number];

export const COPILOT_MODEL_ID = "gpt-5-mini";
export const COPILOT_RESPONSE_TTL_MS = 5 * 60_000;
export const COPILOT_REQUEST_LIMIT_PER_WINDOW = 6;
export const COPILOT_REQUEST_WINDOW_MS = 60_000;

export const defaultCopilotPreferences = () => ({
  favoriteSymbols: ["BTC", "ETH", "SOL"] as string[],
  preferredTimeframes: ["1h", "4h"] as string[],
  riskTolerance: "BALANCED" as "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE",
  enabledAlertTypes: [...smartAlertTypes] as SmartAlertType[],
  minimumAlertSeverity: "WATCH" as SmartAlertSeverity,
  alertCooldownMinutes: 60,
  dailyBriefingEnabled: false,
});

export function classifyCopilotQuestion(question: string): CopilotRequestKind {
  const normalized = question.toLowerCase();
  if (/backtest|strategy|dataset|run\b/.test(normalized)) return "BACKTEST";
  if (/reject|blocked|safety gate|risk engine|daily loss|emergency/.test(normalized)) return "RISK";
  if (/paper trade|simulated trade|order|accepted/.test(normalized)) return "PAPER_TRADE";
  if (/position|portfolio|\bp\/?l\b|exposure|holding/.test(normalized)) return "PORTFOLIO";
  if (/setup|entry|stop|target|reward/.test(normalized)) return "SETUP";
  return "MARKET";
}

export function severityRank(value: SmartAlertSeverity): number {
  return smartAlertSeverities.indexOf(value);
}

export function shouldEmitSmartAlert(input: { enabled: readonly SmartAlertType[]; minimumSeverity: SmartAlertSeverity; type: SmartAlertType; severity: SmartAlertSeverity; priorCooldownUntil: number | null; now: number }): boolean {
  if (!input.enabled.includes(input.type)) return false;
  if (severityRank(input.severity) < severityRank(input.minimumSeverity)) return false;
  return input.priorCooldownUntil === null || input.priorCooldownUntil <= input.now;
}
