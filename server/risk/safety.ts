import { and, eq } from "drizzle-orm";
import { simulationPendingOrders, simulationRiskEvents, simulationSafetyStates } from "../../drizzle/schema";
import { getDb } from "../db";

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
  constructor(
    public readonly code: "INVALID_REASON" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
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

function toNumber(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

async function getOrCreateSafetyRow(userId: number, currentEquityUsd: number) {
  const db = await getDb();
  if (!db) throw new SafetyStateError("UNAVAILABLE", "Risk safety storage is temporarily unavailable.");
  const existing = await db.select().from(simulationSafetyStates).where(eq(simulationSafetyStates.userId, userId)).limit(1);
  if (existing[0]) return { db, state: existing[0] };

  const now = new Date();
  try {
    await db.insert(simulationSafetyStates).values({
      userId,
      riskDayUtc: utcDay(now.getTime()),
      dayStartEquityUsd: Math.max(0, currentEquityUsd).toFixed(2),
      dayPeakEquityUsd: Math.max(0, currentEquityUsd).toFixed(2),
      consecutiveLosses: 0,
      emergencyStopActive: 0,
    });
  } catch {
    // The unique per-user state can be created by a concurrent request; re-read below.
  }
  const created = await db.select().from(simulationSafetyStates).where(eq(simulationSafetyStates.userId, userId)).limit(1);
  if (!created[0]) throw new SafetyStateError("UNAVAILABLE", "Risk safety storage could not be initialized.");
  return { db, state: created[0] };
}

function stateFromRow(row: { emergencyStopActive: number; emergencyStopReason: string | null; emergencyStopActivatedAt: Date | null; emergencyStopResetAt: Date | null }): EmergencyStopState {
  return {
    active: row.emergencyStopActive === 1,
    reason: row.emergencyStopReason,
    activatedAt: row.emergencyStopActivatedAt?.getTime() ?? null,
    resetAt: row.emergencyStopResetAt?.getTime() ?? null,
  };
}

export async function getEmergencyStopState(userId: number, currentEquityUsd: number): Promise<EmergencyStopState> {
  const { state } = await getOrCreateSafetyRow(userId, currentEquityUsd);
  return stateFromRow(state);
}

export async function setEmergencyStop(input: {
  userId: number;
  simulationPortfolioId: number | null;
  currentEquityUsd: number;
  reason: string;
  now?: number;
}): Promise<EmergencyStopTransition> {
  const now = input.now ?? Date.now();
  const { db, state } = await getOrCreateSafetyRow(input.userId, input.currentEquityUsd);
  const transition = activateEmergencyStopTransition(stateFromRow(state), input.reason, now);
  if (!transition.changed) return transition;

  await db.transaction(async (tx) => {
    await tx.update(simulationSafetyStates).set({
      emergencyStopActive: 1,
      emergencyStopReason: transition.state.reason,
      emergencyStopActivatedAt: new Date(now),
      emergencyStopResetAt: null,
    }).where(eq(simulationSafetyStates.id, state.id));
    const pendingOrders = await tx.select({ id: simulationPendingOrders.id, symbol: simulationPendingOrders.symbol })
      .from(simulationPendingOrders)
      .where(and(
        eq(simulationPendingOrders.userId, input.userId),
        eq(simulationPendingOrders.status, "ACTIVE"),
      ));
    const cancellations = prepareEmergencyStopCancellations({
      safetyStateId: state.id,
      activatedAt: now,
      pendingOrders,
    });
    for (const cancellation of cancellations) {
      await tx.update(simulationPendingOrders).set({
        status: "CANCELLED",
        cancelReason: cancellation.cancelReason,
        cancelledAt: new Date(now),
      }).where(eq(simulationPendingOrders.id, cancellation.pendingOrderId));
      await tx.insert(simulationRiskEvents).values({
        eventKey: cancellation.eventKey,
        userId: input.userId,
        simulationPortfolioId: input.simulationPortfolioId,
        pendingOrderId: cancellation.pendingOrderId,
        symbol: cancellation.symbol,
        eventType: "PENDING_ORDER_CANCELLED",
        severity: "WARNING",
        detailsJson: JSON.stringify({ simulation: true, reason: cancellation.cancelReason, emergencyStop: true }),
      });
    }
    await tx.insert(simulationRiskEvents).values({
      eventKey: `emergency-stop:activate:${state.id}:${now}`,
      userId: input.userId,
      simulationPortfolioId: input.simulationPortfolioId,
      eventType: "EMERGENCY_STOP_ACTIVATED",
      severity: "CRITICAL",
      detailsJson: JSON.stringify({ simulation: true, reason: transition.state.reason }),
    });
  });
  return transition;
}

export async function resetEmergencyStop(input: {
  userId: number;
  simulationPortfolioId: number | null;
  currentEquityUsd: number;
  now?: number;
}): Promise<EmergencyStopTransition> {
  const now = input.now ?? Date.now();
  const { db, state } = await getOrCreateSafetyRow(input.userId, input.currentEquityUsd);
  const transition = resetEmergencyStopTransition(stateFromRow(state), now);
  if (!transition.changed) return transition;

  await db.transaction(async (tx) => {
    await tx.update(simulationSafetyStates).set({
      emergencyStopActive: 0,
      emergencyStopReason: null,
      emergencyStopResetAt: new Date(now),
    }).where(eq(simulationSafetyStates.id, state.id));
    await tx.insert(simulationRiskEvents).values({
      eventKey: `emergency-stop:reset:${state.id}:${now}`,
      userId: input.userId,
      simulationPortfolioId: input.simulationPortfolioId,
      eventType: "EMERGENCY_STOP_RESET",
      severity: "INFO",
      detailsJson: JSON.stringify({ simulation: true, previousReason: state.emergencyStopReason }),
    });
  });
  return transition;
}

export function safetyStateEquityHint(value: unknown): number {
  return Math.max(0, toNumber(value));
}
