/**
 * @nexus/core — the deterministic heart of NEXUS.
 *
 * Constraints this package must always satisfy:
 *   1. Zero runtime dependencies. No React, no Express, no Drizzle, no network.
 *   2. Pure functions only. No I/O, no clocks read internally, no hidden state.
 *   3. Never fabricate. Missing or degraded input must surface as UNAVAILABLE
 *      with an attributed reason — never as an invented value.
 *
 * Because of (1) and (2) this package runs unchanged on the API server and
 * inside the mobile app, so intelligence and risk cannot drift between them.
 */

// Intelligence
export { analyzeTimeframe, composeAssetIntelligence } from "./intelligence/engine.ts";
export type { TimeframeAnalysisInput } from "./intelligence/engine.ts";
export * from "./intelligence/types.ts";

// Risk
export { calculatePositionSize, calculatePlannedRisk } from "./risk/calculations.ts";
export { calculateRiskLevel, intelligenceRiskContextToRiskLevelInput } from "./risk/riskLevel.ts";
export type { RiskLevelInput } from "./risk/riskLevel.ts";
export { calculateStop } from "./risk/stops.ts";
export * from "./risk/types.ts";

// Risk settings, position monitoring, and trade planning.
// These were lifted from the legacy core and are preserved per the
// no-unnecessary-rewrites rule, but were unreachable through this barrel —
// exporting them makes the preserved functionality usable rather than dead.
export {
  DEFAULT_RISK_SETTINGS,
  validateRiskSettings,
  normalizeRiskSettings,
  RiskSettingsValidationError,
} from "./risk/settings.ts";
export { evaluatePositionRisk, PositionMonitoringError } from "./risk/monitor.ts";
export type { PositionMonitoringInput } from "./risk/monitor.ts";
export { buildRiskPlan, dailySnapshotFromStored, RiskPlanError } from "./risk/plan.ts";
export type { RiskPlanBuildInput } from "./risk/plan.ts";

// Emergency Stop transitions (pure; persistence lives behind a repository port)
export {
  activateEmergencyStopTransition,
  resetEmergencyStopTransition,
  prepareEmergencyStopCancellations,
  SafetyStateError,
} from "./risk/safety.ts";
export type {
  EmergencyStopState,
  EmergencyStopTransition,
  ActivePendingOrder,
  EmergencyStopCancellation,
} from "./risk/safety.ts";

// Identity — deterministic, never random
export { dedupeKey, timeBucket, fingerprint64, IdSequence, IdentityError } from "./identity/id.ts";
export type { DedupeKeyInput } from "./identity/id.ts";

// Deterministic heuristics
export { analyzeSentimentHeuristic } from "./analysis/sentiment.ts";
export type { SentimentResult, SentimentTerm, SentimentMethod } from "./analysis/sentiment.ts";

// Candle analysis
export * from "./analysis/candleAnalysis.ts";
