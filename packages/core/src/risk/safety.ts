/**
 * Emergency Stop — pure state transitions.
 *
 * Lifted from the legacy server/risk/safety.ts. Only the deterministic
 * transition logic lives here; all persistence was left behind and now sits
 * behind SafetyStateRepository in apps/api. The transitions are therefore
 * testable without a database, which is the point of the extraction.
 */

export interface EmergencyStopState {
  active: boolean;
  reason: string | null;
  activatedAt: number | null;
  resetAt: number | null;
}

export interface EmergencyStopTransition {
  state: EmergencyStopState;
  changed: boolean;
  eventType: "EMERGENCY_STOP_ACTIVATED" | "EMERGENCY_STOP_RESET" | null;
  severity: "CRITICAL" | "INFO" | null;
}

export interface ActivePendingOrder {
  id: number;
  symbol: string;
}

export interface EmergencyStopCancellation {
  pendingOrderId: number;
  symbol: string;
  cancelReason: string;
  eventKey: string;
}

export class SafetyStateError extends Error {
  readonly code: "INVALID_REASON" | "UNAVAILABLE";

  constructor(code: "INVALID_REASON" | "UNAVAILABLE", message: string) {
    super(message);
    this.code = code;
    this.name = "SafetyStateError";
  }
}

function ensureTimestamp(value: number): void {
  if (!Number.isFinite(value)) throw new SafetyStateError("INVALID_REASON", "Safety event time must be finite.");
}

function normalizeReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 280) {
    throw new SafetyStateError("INVALID_REASON", "Emergency Stop reason must contain 3 to 280 characters.");
  }
  return normalized;
}

export function activateEmergencyStopTransition(
  current: EmergencyStopState,
  reason: string,
  now: number,
): EmergencyStopTransition {
  ensureTimestamp(now);
  const normalizedReason = normalizeReason(reason);
  if (current.active) {
    return { state: current, changed: false, eventType: null, severity: null };
  }
  return {
    state: { active: true, reason: normalizedReason, activatedAt: now, resetAt: null },
    changed: true,
    eventType: "EMERGENCY_STOP_ACTIVATED",
    severity: "CRITICAL",
  };
}

export function resetEmergencyStopTransition(current: EmergencyStopState, now: number): EmergencyStopTransition {
  ensureTimestamp(now);
  if (!current.active) {
    return { state: current, changed: false, eventType: null, severity: null };
  }
  return {
    state: { active: false, reason: null, activatedAt: current.activatedAt, resetAt: now },
    changed: true,
    eventType: "EMERGENCY_STOP_RESET",
    severity: "INFO",
  };
}

export function prepareEmergencyStopCancellations(input: {
  safetyStateId: number;
  activatedAt: number;
  pendingOrders: ActivePendingOrder[];
}): EmergencyStopCancellation[] {
  ensureTimestamp(input.activatedAt);
  if (!Number.isInteger(input.safetyStateId) || input.safetyStateId <= 0) {
    throw new SafetyStateError("INVALID_REASON", "Safety state identifier must be a positive whole number.");
  }
  return input.pendingOrders.map((order) => {
    if (!Number.isInteger(order.id) || order.id <= 0 || !order.symbol.trim()) {
      throw new SafetyStateError("INVALID_REASON", "Pending order cancellation evidence is invalid.");
    }
    const symbol = order.symbol.trim().toUpperCase();
    return {
      pendingOrderId: order.id,
      symbol,
      cancelReason: "Cancelled by Emergency Stop before a paper fill.",
      eventKey: `pending-cancel:emergency:${input.safetyStateId}:${order.id}:${input.activatedAt}`,
    };
  });
}
