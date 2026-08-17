import { describe, expect, it } from "vitest";
import type { MonitoredPositionRisk } from "../risk/types";
import { derivePaperPositionState, hasMonitoringStateTransition, monitoringEventKey, monitoringExposurePercent, shouldCloseMonitoredPosition } from "./contracts";

const base = (overrides: Partial<MonitoredPositionRisk> = {}): MonitoredPositionRisk => ({
  positionId: 4, symbol: "BTC", quantity: 1, currentPriceUsd: 60000, unrealizedPnlUsd: 10,
  stopPriceUsd: 58000, targetPriceUsd: 63000, distanceToStopPercent: 3, distanceToTargetPercent: 5,
  plannedRiskUsd: 200, currentRiskLevel: "LOW", openingRegime: "TREND", currentRegime: "TREND", regimeChanged: false,
  dataQuality: "LIVE", source: "binance", providerUpdatedAt: 1_700_000_000_000, evaluatedAt: 1_700_000_001_000,
  protectionStatus: "MONITORED", ...overrides,
});

describe("paper-position monitoring state contract", () => {
  it("fails safe when verified market evidence is stale or unavailable", () => {
    expect(derivePaperPositionState(base({ dataQuality: "STALE" }), 10).state).toBe("DATA_STALE");
    expect(derivePaperPositionState(base({ currentPriceUsd: null }), 10).severity).toBe("WARNING");
  });
  it("prioritizes observed protection and risk states over proximity", () => {
    expect(derivePaperPositionState(base({ protectionStatus: "STOP_OBSERVED", distanceToStopPercent: 0.1 }), 10).state).toBe("PROTECTION_TRIGGERED");
    expect(derivePaperPositionState(base({ currentRiskLevel: "EXTREME" }), 10)).toMatchObject({ state: "RISK_INCREASED", severity: "CRITICAL" });
  });
  it("derives exposure, stop, target, regime, and ordinary states deterministically", () => {
    expect(derivePaperPositionState(base(), 80).state).toBe("RISK_INCREASED");
    expect(derivePaperPositionState(base({ distanceToStopPercent: 0.5 }), 10).state).toBe("STOP_APPROACHING");
    expect(derivePaperPositionState(base({ distanceToTargetPercent: 0.5 }), 10).state).toBe("TARGET_APPROACHING");
    expect(derivePaperPositionState(base({ regimeChanged: true }), 10).state).toBe("WATCH");
    expect(derivePaperPositionState(base(), 10).state).toBe("OPEN");
  });
  it("builds an auditable idempotency key from position, state, and observation evidence", () => {
    expect(monitoringEventKey(4, "WATCH", 100, 200)).toBe("4:WATCH:100");
    expect(monitoringEventKey(4, "WATCH", null, 200)).toBe("4:WATCH:200");
  });
  it("does not create a duplicate transition and closes only a previously open position absent from the paper ledger", () => {
    expect(hasMonitoringStateTransition("WATCH", "WATCH")).toBe(false);
    expect(hasMonitoringStateTransition("WATCH", "OPEN")).toBe(true);
    expect(shouldCloseMonitoredPosition("WATCH", false)).toBe(true);
    expect(shouldCloseMonitoredPosition("CLOSED", false)).toBe(false);
    expect(shouldCloseMonitoredPosition("OPEN", true)).toBe(false);
  });
  it("uses the existing Risk Engine total-exposure field and fails safe for malformed values", () => {
    expect(monitoringExposurePercent({ totalExposurePercent: 72.5 })).toBe(72.5);
    expect(monitoringExposurePercent({ totalExposurePercent: "not-a-number" })).toBe(0);
    expect(monitoringExposurePercent(null)).toBe(0);
  });
});
