/**
 * Domain contracts — alerts, events, monitoring, intelligence, risk.
 *
 * These are wire shapes. They are intentionally *not* the core's internal
 * types: the core is free to evolve its representation, and this layer is the
 * promise made to the mobile client. Mapping between the two happens once, in
 * apps/api, so a core refactor never silently breaks a shipped app.
 */

import {
  arrayOf,
  bool,
  enumOf,
  epochMs,
  literal,
  nullable,
  num,
  object,
  str,
  variant,
} from "./validate.ts";
import type { Validator } from "./validate.ts";
import { dataOrigin, entityRef, explainedScore, providerStatus } from "./common.ts";
import type { DataOrigin, EntityRef, ExplainedScore, ProviderStatus } from "./common.ts";

// --- alerts ----------------------------------------------------------------

export const SEVERITIES = ["INFO", "WATCH", "WARNING", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface AlertHistoryEntry {
  at: number;
  status: AlertStatus;
  note: string | null;
}

export const alertHistoryEntry: Validator<AlertHistoryEntry> = object({
  at: epochMs(),
  status: enumOf(ALERT_STATUSES),
  note: nullable(str({ max: 400 })),
});

export interface Alert {
  /** Server-issued monotonic id. The client never mints this. */
  id: string;
  /**
   * Content-addressed identity of the underlying condition. Two evaluations of
   * the same condition share a dedupeKey, which is how repeats are collapsed
   * instead of duplicated.
   */
  dedupeKey: string;
  createdAt: number;
  updatedAt: number;
  severity: Severity;
  /** Tie-breaker within a severity. Higher sorts first. */
  priority: number;
  title: string;
  /** Why this fired, in plain language. Required — an unexplained alert is noise. */
  explanation: string;
  source: string;
  entity: EntityRef | null;
  status: AlertStatus;
  read: boolean;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  /** How many times the condition re-occurred while this alert stayed open. */
  occurrences: number;
  history: AlertHistoryEntry[];
}

export const alert: Validator<Alert> = object({
  id: str({ min: 1, max: 32 }),
  dedupeKey: str({ min: 1, max: 160 }),
  createdAt: epochMs(),
  updatedAt: epochMs(),
  severity: enumOf(SEVERITIES),
  priority: num({ min: 0, max: 1000, int: true }),
  title: str({ min: 1, max: 140 }),
  explanation: str({ min: 1, max: 800 }),
  source: str({ min: 1, max: 64 }),
  entity: nullable(entityRef),
  status: enumOf(ALERT_STATUSES),
  read: bool(),
  acknowledgedAt: nullable(epochMs()),
  resolvedAt: nullable(epochMs()),
  occurrences: num({ min: 1, int: true }),
  history: arrayOf(alertHistoryEntry, { max: 100 }),
});

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, WATCH: 1, INFO: 0 };

/**
 * §12 default ordering: unread, then severity, then priority, then newest.
 * Defined here rather than in the app so every surface — list, badge count,
 * notification tray — agrees on what "most important" means.
 */
export function compareAlerts(a: Alert, b: Alert): number {
  if (a.read !== b.read) return a.read ? 1 : -1;
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sev !== 0) return sev;
  if (b.priority !== a.priority) return b.priority - a.priority;
  return b.createdAt - a.createdAt;
}

// --- events ----------------------------------------------------------------

/** §11. The closed set of things the system announces about itself. */
export const EVENT_TYPES = [
  "DATA_UPDATED",
  "SIGNAL_CREATED",
  "SIGNAL_UPDATED",
  "RISK_CHANGED",
  "ALERT_CREATED",
  "ALERT_ACKNOWLEDGED",
  "ALERT_RESOLVED",
  "MONITOR_STARTED",
  "MONITOR_STOPPED",
  "MONITOR_CREATED",
  "MONITOR_UPDATED",
  "MONITOR_ENABLED",
  "MONITOR_DISABLED",
  "MONITOR_FAILED",
  "MONITOR_RECOVERED",
  "MONITOR_DELETED",
  "EMERGENCY_STOP_ACTIVATED",
  "EMERGENCY_STOP_RESET",
  "PROVIDER_ERROR",
  "SYSTEM_WARNING",
  "SYSTEM_ERROR",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface NexusEvent {
  id: string;
  type: EventType;
  occurredAt: number;
  severity: Severity;
  entity: EntityRef | null;
  summary: string;
  /** Free-form detail. Deliberately unvalidated beyond being an object. */
  data: Record<string, unknown>;
  /** Groups events belonging to one causal chain across services. */
  correlationId: string | null;
}

export const nexusEvent: Validator<NexusEvent> = object({
  id: str({ min: 1, max: 32 }),
  type: enumOf(EVENT_TYPES),
  occurredAt: epochMs(),
  severity: enumOf(SEVERITIES),
  entity: nullable(entityRef),
  summary: str({ min: 1, max: 400 }),
  data: object({}) as unknown as Validator<Record<string, unknown>>,
  correlationId: nullable(str({ max: 64 })),
});

/**
 * Mirrors @nexus/core's RiskLevel exactly. An earlier version of this contract
 * invented a five-step scale (ELEVATED/SEVERE) the engine never produces —
 * which would have made the API reject its own valid responses at the output
 * contract. The engine defines the scale; the wire follows it.
 */
export const RISK_LEVELS = ["LOW", "MODERATE", "HIGH", "EXTREME"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// --- monitoring ------------------------------------------------------------

export const MONITOR_STATES = ["ACTIVE", "PAUSED", "FAILING", "STOPPED"] as const;
export type MonitorState = (typeof MONITOR_STATES)[number];

/**
 * Monitor types NEXUS can actually execute today.
 *
 * Deliberately two. Wallet, address and transaction monitoring are meaningful
 * ideas the entity model already supports, but no runner executes them, so
 * exposing them would be a promise the backend cannot keep. They are added
 * when a runner exists, not before.
 */
export const MONITOR_TYPES = ["ASSET_INTELLIGENCE", "PROVIDER_HEALTH"] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

/**
 * Why a monitor run failed. Distinguishing these is what lets the scheduler
 * back off intelligently — a rate limit deserves a longer wait than a
 * malformed response, and an auth failure deserves no retry at all.
 */
export const MONITOR_FAILURE_KINDS = [
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "RATE_LIMITED",
  "AUTH_FAILED",
  "INTERNAL",
] as const;
export type MonitorFailureKind = (typeof MONITOR_FAILURE_KINDS)[number];

/**
 * Trigger configuration, discriminated by monitor type.
 *
 * Config is a closed shape per type — never free-form. A monitor is a
 * user-supplied instruction executed by the server, so anything resembling a
 * URL, path, or expression would be a remote-execution surface. Users choose
 * from validated enums and bounded numbers; nothing else crosses the wire.
 */
export interface AssetIntelligenceConfig {
  type: "ASSET_INTELLIGENCE";
  /** Fire when measured risk reaches this level or worse. */
  riskAtOrAbove: RiskLevel | null;
  /** Fire when the signal-strength score reaches this value. 0-100. */
  signalAtOrAbove: number | null;
  /** Fire when intelligence becomes unavailable for this asset. */
  onDataUnavailable: boolean;
}

export interface ProviderHealthConfig {
  type: "PROVIDER_HEALTH";
  /** Which registered provider to watch. Validated against the registry. */
  providerId: string;
  /** Fire when consecutive failures reach this count. */
  failuresAtOrAbove: number;
}

export type MonitorConfig = AssetIntelligenceConfig | ProviderHealthConfig;

export interface Monitor {
  id: string;
  /** Owner. Every read and write is scoped to this — see §13. */
  userId: string;
  name: string;
  type: MonitorType;
  target: EntityRef;
  config: MonitorConfig;
  state: MonitorState;
  /**
   * User intent, distinct from `state`. A disabled monitor is PAUSED; a
   * monitor the engine gave up on is STOPPED while still enabled. Collapsing
   * the two would make "why did this stop?" unanswerable.
   */
  enabled: boolean;
  intervalSeconds: number;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastOutcome: "OK" | "TRIGGERED" | "ERROR" | null;
  lastFailureKind: MonitorFailureKind | null;
  consecutiveFailures: number;
  detail: string | null;
}

export const assetIntelligenceConfig: Validator<AssetIntelligenceConfig> = object({
  type: literal("ASSET_INTELLIGENCE"),
  riskAtOrAbove: nullable(enumOf(RISK_LEVELS)),
  signalAtOrAbove: nullable(num({ min: 0, max: 100 })),
  onDataUnavailable: bool(),
});

export const providerHealthConfig: Validator<ProviderHealthConfig> = object({
  type: literal("PROVIDER_HEALTH"),
  // Bounded charset: the id is used to look up a registered provider, never
  // to build a request path.
  providerId: str({ min: 1, max: 64, pattern: /^[a-z0-9_-]+$/ }),
  failuresAtOrAbove: num({ min: 1, max: 100, int: true }),
});

export const monitorConfig: Validator<MonitorConfig> = variant("type", {
  ASSET_INTELLIGENCE: assetIntelligenceConfig,
  PROVIDER_HEALTH: providerHealthConfig,
}) as Validator<MonitorConfig>;

export const monitor: Validator<Monitor> = object({
  id: str({ min: 1, max: 32 }),
  userId: str({ min: 1, max: 32 }),
  name: str({ min: 1, max: 120 }),
  type: enumOf(MONITOR_TYPES),
  target: entityRef,
  config: monitorConfig,
  state: enumOf(MONITOR_STATES),
  enabled: bool(),
  // 15s floor protects providers from a user configuring a hot loop.
  intervalSeconds: num({ min: 15, max: 86_400, int: true }),
  createdAt: epochMs(),
  updatedAt: epochMs(),
  lastRunAt: nullable(epochMs()),
  nextRunAt: nullable(epochMs()),
  lastOutcome: nullable(enumOf(["OK", "TRIGGERED", "ERROR"] as const)),
  lastFailureKind: nullable(enumOf(MONITOR_FAILURE_KINDS)),
  consecutiveFailures: num({ min: 0, int: true }),
  detail: nullable(str({ max: 280 })),
});

/** Create/update payload. The server owns everything not listed here. */
export interface MonitorDraft {
  name: string;
  type: MonitorType;
  target: EntityRef;
  config: MonitorConfig;
  intervalSeconds: number;
  enabled: boolean;
}

export const monitorDraft: Validator<MonitorDraft> = object({
  name: str({ min: 1, max: 120 }),
  type: enumOf(MONITOR_TYPES),
  target: entityRef,
  config: monitorConfig,
  intervalSeconds: num({ min: 15, max: 86_400, int: true }),
  enabled: bool(),
});

// --- emergency stop --------------------------------------------------------

export interface EmergencyStopView {
  active: boolean;
  reason: string | null;
  activatedAt: number | null;
  resetAt: number | null;
  /** Who changed it last. Auditable by design. */
  actor: string | null;
}

export const emergencyStopView: Validator<EmergencyStopView> = object({
  active: bool(),
  reason: nullable(str({ max: 280 })),
  activatedAt: nullable(epochMs()),
  resetAt: nullable(epochMs()),
  actor: nullable(str({ max: 64 })),
});

// --- intelligence ----------------------------------------------------------

export const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/**
 * One timeframe's evidence.
 *
 * Note what is NOT here: scores. In @nexus/core, opportunity/risk/signal
 * strength are computed once at the *asset* level from the timeframe the
 * engine judged primary — they are not per-timeframe quantities. Duplicating
 * them per row would invent numbers the engine never produced, so the contract
 * mirrors the engine instead.
 */
export interface TimeframeSummary {
  timeframe: Timeframe;
  origin: DataOrigin;
  /** null when the engine could not classify one from available evidence. */
  regime: string | null;
  /** Candles the verdict rests on — the reader's coverage check. */
  sampleCount: number;
  /** Whether this timeframe had enough validated evidence to be usable. */
  usable: boolean;
}

export const timeframeSummary: Validator<TimeframeSummary> = object({
  timeframe: enumOf(TIMEFRAMES),
  origin: dataOrigin,
  regime: nullable(str({ max: 64 })),
  sampleCount: num({ min: 0, int: true }),
  usable: bool(),
});

export interface AssetIntelligenceView {
  entity: EntityRef;
  /** The timeframe the headline scores came from. null when none qualified. */
  primaryTimeframe: Timeframe | null;
  timeframes: TimeframeSummary[];
  /** Measured ATR% on the primary timeframe. null when not measurable. */
  atrPercent: number | null;
  /** Asset-level scores, exactly as the engine produces them. */
  opportunity: ExplainedScore;
  risk: ExplainedScore;
  signalStrength: ExplainedScore;
  /** Narrative written from the evidence actually available. */
  explanation: string | null;
  /** Evidence lines backing the narrative. */
  evidence: string[];
  generatedAt: number;
}

export const assetIntelligenceView: Validator<AssetIntelligenceView> = object({
  entity: entityRef,
  primaryTimeframe: nullable(enumOf(TIMEFRAMES)),
  timeframes: arrayOf(timeframeSummary, { max: 12 }),
  atrPercent: nullable(num({ min: 0 })),
  opportunity: explainedScore,
  risk: explainedScore,
  signalStrength: explainedScore,
  explanation: nullable(str({ max: 4000 })),
  evidence: arrayOf(str({ max: 400 }), { max: 40 }),
  generatedAt: epochMs(),
});

// --- risk ------------------------------------------------------------------


export interface RiskView {
  entity: EntityRef | null;
  /** null when data quality does not support a verdict. */
  level: RiskLevel | null;
  score: ExplainedScore;
  origin: DataOrigin;
  emergencyStopActive: boolean;
  evaluatedAt: number;
}

export const riskView: Validator<RiskView> = object({
  entity: nullable(entityRef),
  level: nullable(enumOf(RISK_LEVELS)),
  score: explainedScore,
  origin: dataOrigin,
  emergencyStopActive: bool(),
  evaluatedAt: epochMs(),
});

export interface PositionSizeView {
  approvedQuantity: number;
  notionalUsd: number;
  plannedLossUsd: number;
  plannedRiskPercent: number;
  /** Which constraint bound the size. Shown to the user verbatim. */
  limitingFactor: "RISK" | "CASH" | "TOTAL_EXPOSURE" | "ASSET_EXPOSURE" | "REQUESTED_QUANTITY";
}

export const positionSizeView: Validator<PositionSizeView> = object({
  approvedQuantity: num({ min: 0 }),
  notionalUsd: num({ min: 0 }),
  plannedLossUsd: num({ min: 0 }),
  plannedRiskPercent: num({ min: 0 }),
  limitingFactor: enumOf([
    "RISK",
    "CASH",
    "TOTAL_EXPOSURE",
    "ASSET_EXPOSURE",
    "REQUESTED_QUANTITY",
  ] as const),
});

// --- command centre --------------------------------------------------------

/**
 * §13: the one payload that answers "what is happening, and what needs me?".
 * A single round trip on cold start — the home screen must not fan out into
 * eight requests before it can render.
 */
export interface CommandCenterView {
  generatedAt: number;
  systemState: "NOMINAL" | "DEGRADED" | "CRITICAL";
  criticalAlerts: Alert[];
  unreadAlertCount: number;
  risk: RiskView | null;
  monitors: Monitor[];
  providers: ProviderStatus[];
  recentEvents: NexusEvent[];
}

export const commandCenterView: Validator<CommandCenterView> = object({
  generatedAt: epochMs(),
  systemState: enumOf(["NOMINAL", "DEGRADED", "CRITICAL"] as const),
  criticalAlerts: arrayOf(alert, { max: 20 }),
  unreadAlertCount: num({ min: 0, int: true }),
  risk: nullable(riskView),
  monitors: arrayOf(monitor, { max: 50 }),
  providers: arrayOf(providerStatus, { max: 20 }),
  recentEvents: arrayOf(nexusEvent, { max: 50 }),
});
