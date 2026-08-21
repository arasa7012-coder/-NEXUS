/**
 * Vocabulary shared by every NEXUS domain.
 *
 * These are the words the mobile app, the API, and the core all use for the
 * same ideas. Defining them once is what stops "stale" meaning three different
 * things in three layers.
 */

import { arrayOf, bool, enumOf, epochMs, nullable, num, object, optional, str } from "./validate.ts";
import type { Validator } from "./validate.ts";

// --- entities --------------------------------------------------------------

/**
 * Every addressable thing in NEXUS. Screens bind to EntityRef, never to a
 * concrete asset or wallet shape, so a new entity kind does not require a new
 * screen — which is the requirement in §16 of the brief.
 */
export const ENTITY_KINDS = [
  "ASSET",
  "WALLET",
  "ADDRESS",
  "TRANSACTION",
  "MARKET",
  "PROTOCOL",
  "SIGNAL",
  "RISK",
  "ALERT",
  "EVENT",
  "MONITOR",
  "PROVIDER",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface EntityRef {
  kind: EntityKind;
  /** Stable within a kind. e.g. "BTCUSDT", "0xabc…". */
  id: string;
  label: string;
}

export const entityRef: Validator<EntityRef> = object({
  kind: enumOf(ENTITY_KINDS),
  id: str({ min: 1, max: 128 }),
  label: str({ min: 1, max: 160 }),
});

/** Canonical string form — used as the `entity` component of a dedupe key. */
export function entityKey(ref: Pick<EntityRef, "kind" | "id">): string {
  return `${ref.kind.toLowerCase()}:${ref.id}`;
}

// --- data freshness --------------------------------------------------------

/**
 * §19: stale data must never be presented as live. This is the single enum the
 * whole system uses, and every payload carrying market or chain data must
 * carry one.
 */
export const FRESHNESS = ["LIVE", "CACHED", "STALE", "UNAVAILABLE"] as const;
export type Freshness = (typeof FRESHNESS)[number];

export interface DataOrigin {
  freshness: Freshness;
  /** Which provider produced it. null when nothing was produced. */
  providerId: string | null;
  /** Provider's own timestamp, not our receive time. */
  observedAt: number | null;
  /** When NEXUS cached it. */
  cachedAt: number | null;
  /** Present whenever freshness is STALE or UNAVAILABLE. */
  reason: string | null;
}

export const dataOrigin: Validator<DataOrigin> = object({
  freshness: enumOf(FRESHNESS),
  providerId: nullable(str({ min: 1, max: 64 })),
  observedAt: nullable(epochMs()),
  cachedAt: nullable(epochMs()),
  reason: nullable(str({ max: 280 })),
});

// --- explainability --------------------------------------------------------

/**
 * Mirrors ExplainableScore in @nexus/core across the wire. The contract keeps
 * `value: null` legal precisely so the API can say "not measurable" instead of
 * inventing a number.
 */
export interface ScoreFactor {
  id: string;
  label: string;
  points: number;
  maxPoints: number;
  description: string;
}

export const scoreFactor: Validator<ScoreFactor> = object({
  id: str({ min: 1, max: 64 }),
  label: str({ min: 1, max: 120 }),
  points: num(),
  maxPoints: num(),
  description: str({ max: 400 }),
});

export interface ExplainedScore {
  value: number | null;
  coveragePercent: number;
  factors: ScoreFactor[];
  unavailableReason: string | null;
}

export const explainedScore: Validator<ExplainedScore> = object({
  value: nullable(num({ min: 0, max: 100 })),
  coveragePercent: num({ min: 0, max: 100 }),
  factors: arrayOf(scoreFactor, { max: 40 }),
  unavailableReason: nullable(str({ max: 400 })),
});

// --- errors ----------------------------------------------------------------

/**
 * §26: every layer distinguishes failure kinds. One closed set, so the mobile
 * app can branch on `code` rather than string-matching messages.
 */
export const ERROR_CODES = [
  "NETWORK",
  "TIMEOUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "RATE_LIMIT",
  "PROVIDER_FAILURE",
  "PROVIDER_UNAVAILABLE",
  "DATA_UNAVAILABLE",
  "CONFLICT",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface NexusError {
  code: ErrorCode;
  /** Safe to show a user. Never contains secrets or stack detail. */
  message: string;
  /** Whether the same request is worth repeating. */
  retryable: boolean;
  /** Correlates this failure with server logs. */
  traceId: string | null;
  /**
   * Present on VALIDATION.
   *
   * Explicitly `| undefined`: under `exactOptionalPropertyTypes` a bare `?`
   * means "may be absent", not "may be present and undefined", and the
   * validator legitimately produces the latter.
   */
  fields?: Array<{ path: string; message: string }> | undefined;
}

export const nexusError: Validator<NexusError> = object({
  code: enumOf(ERROR_CODES),
  message: str({ min: 1, max: 400 }),
  retryable: bool(),
  traceId: nullable(str({ max: 64 })),
  fields: optional(arrayOf(object({ path: str({ max: 200 }), message: str({ max: 200 }) }), { max: 50 })),
});

/**
 * Which failures are worth a client retry. Single source of truth, shared by
 * the mobile client and the API's own upstream calls.
 *
 * PROVIDER_UNAVAILABLE is retryable: a 502/503/504 is by definition transient
 * upstream unavailability, and the whole point of the provider breaker is that
 * the *server* decides when to stop trying. Omitting it here meant a gateway
 * blip surfaced to the user as a hard failure with no second attempt.
 */
export function isRetryable(code: ErrorCode): boolean {
  return (
    code === "NETWORK" ||
    code === "TIMEOUT" ||
    code === "RATE_LIMIT" ||
    code === "PROVIDER_FAILURE" ||
    code === "PROVIDER_UNAVAILABLE"
  );
}

// --- provider health -------------------------------------------------------

export const PROVIDER_STATES = ["OPERATIONAL", "DEGRADED", "RATE_LIMITED", "FAILING", "UNCONFIGURED"] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

export interface ProviderStatus {
  providerId: string;
  displayName: string;
  state: ProviderState;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  /** Rolling median, milliseconds. null before the first sample. */
  latencyMs: number | null;
  detail: string | null;
}

export const providerStatus: Validator<ProviderStatus> = object({
  providerId: str({ min: 1, max: 64 }),
  displayName: str({ min: 1, max: 80 }),
  state: enumOf(PROVIDER_STATES),
  lastSuccessAt: nullable(epochMs()),
  lastFailureAt: nullable(epochMs()),
  consecutiveFailures: num({ min: 0, int: true }),
  latencyMs: nullable(num({ min: 0 })),
  detail: nullable(str({ max: 280 })),
});
