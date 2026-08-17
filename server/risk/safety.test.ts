import { describe, expect, it } from "vitest";
import { activateEmergencyStopTransition, prepareEmergencyStopCancellations, resetEmergencyStopTransition, SafetyStateError } from "./safety";

const inactive = { active: false, reason: null, activatedAt: null, resetAt: null };
const active = { active: true, reason: "Daily protection review", activatedAt: 1_723_000_000_000, resetAt: null };

describe("Emergency Stop state transitions", () => {
  it("activates with a normalized reason and an auditable critical event", () => {
    const result = activateEmergencyStopTransition(inactive, "  Market   data   review  ", 1_723_000_001_000);
    expect(result).toEqual({
      state: { active: true, reason: "Market data review", activatedAt: 1_723_000_001_000, resetAt: null },
      changed: true,
      eventType: "EMERGENCY_STOP_ACTIVATED",
      severity: "CRITICAL",
    });
  });

  it("is idempotent when already active and preserves the original reason", () => {
    const result = activateEmergencyStopTransition(active, "Another reason", 1_723_000_002_000);
    expect(result.changed).toBe(false);
    expect(result.state).toEqual(active);
  });

  it("resets once with an informational audit event and is then idempotent", () => {
    const reset = resetEmergencyStopTransition(active, 1_723_000_003_000);
    expect(reset).toEqual({
      state: { active: false, reason: null, activatedAt: 1_723_000_000_000, resetAt: 1_723_000_003_000 },
      changed: true,
      eventType: "EMERGENCY_STOP_RESET",
      severity: "INFO",
    });
    const repeated = resetEmergencyStopTransition(reset.state, 1_723_000_004_000);
    expect(repeated.changed).toBe(false);
  });

  it("rejects missing or unsafe reasons", () => {
    expect(() => activateEmergencyStopTransition(inactive, " ", 1_723_000_000_000)).toThrow(SafetyStateError);
    expect(() => activateEmergencyStopTransition(inactive, "ok", 1_723_000_000_000)).toThrow(/3 to 280/);
  });

  it("creates deterministic, symbol-labelled cancellation evidence for every pending paper order", () => {
    const cancellations = prepareEmergencyStopCancellations({
      safetyStateId: 7,
      activatedAt: 1_723_000_001_000,
      pendingOrders: [{ id: 11, symbol: "btc" }, { id: 12, symbol: "ETH" }],
    });
    expect(cancellations).toEqual([
      {
        pendingOrderId: 11,
        symbol: "BTC",
        cancelReason: "Cancelled by Emergency Stop before a paper fill.",
        eventKey: "pending-cancel:emergency:7:11:1723000001000",
      },
      {
        pendingOrderId: 12,
        symbol: "ETH",
        cancelReason: "Cancelled by Emergency Stop before a paper fill.",
        eventKey: "pending-cancel:emergency:7:12:1723000001000",
      },
    ]);
  });

  it("rejects malformed cancellation evidence rather than silently cancelling an ambiguous order", () => {
    expect(() => prepareEmergencyStopCancellations({
      safetyStateId: 0,
      activatedAt: 1_723_000_001_000,
      pendingOrders: [],
    })).toThrow(SafetyStateError);
  });
});
