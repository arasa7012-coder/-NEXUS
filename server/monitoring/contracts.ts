import type { MonitoredPositionRisk } from "../risk/types";

export const paperPositionStates = ["OPEN", "WATCH", "STOP_APPROACHING", "TARGET_APPROACHING", "RISK_INCREASED", "DATA_STALE", "PROTECTION_TRIGGERED", "CLOSED"] as const;
export type PaperPositionState = (typeof paperPositionStates)[number];
export type MonitoringSeverity = "INFO" | "WATCH" | "WARNING" | "CRITICAL";

export type PositionStateDecision = {
  state: Exclude<PaperPositionState, "CLOSED">;
  severity: MonitoringSeverity;
  reason: string;
};

const PROXIMITY_PERCENT = 1;

/** Derives a display-only state from existing verified monitor output. It cannot create, close, or amend a paper position. */
export function derivePaperPositionState(input: MonitoredPositionRisk, exposurePercent: number): PositionStateDecision {
  if (input.protectionStatus === "DATA_UNAVAILABLE" || input.dataQuality !== "LIVE" || input.currentPriceUsd === null) {
    return { state: "DATA_STALE", severity: "WARNING", reason: "Verified price or intelligence evidence is stale or unavailable." };
  }
  if (input.protectionStatus === "STOP_OBSERVED" || input.protectionStatus === "TARGET_OBSERVED") {
    return { state: "PROTECTION_TRIGGERED", severity: "CRITICAL", reason: `Paper protection observation: ${input.protectionStatus}.` };
  }
  if (input.currentRiskLevel === "HIGH" || input.currentRiskLevel === "EXTREME") {
    return { state: "RISK_INCREASED", severity: input.currentRiskLevel === "EXTREME" ? "CRITICAL" : "WARNING", reason: `Risk Engine currently classifies the position as ${input.currentRiskLevel}.` };
  }
  if (exposurePercent >= 75) {
    return { state: "RISK_INCREASED", severity: "WARNING", reason: `Verified portfolio exposure is ${exposurePercent.toFixed(2)}%.` };
  }
  if (input.distanceToStopPercent !== null && input.distanceToStopPercent >= 0 && input.distanceToStopPercent <= PROXIMITY_PERCENT) {
    return { state: "STOP_APPROACHING", severity: "WARNING", reason: `Current paper price is within ${PROXIMITY_PERCENT}% of the configured stop.` };
  }
  if (input.distanceToTargetPercent !== null && input.distanceToTargetPercent >= 0 && input.distanceToTargetPercent <= PROXIMITY_PERCENT) {
    return { state: "TARGET_APPROACHING", severity: "WATCH", reason: `Current paper price is within ${PROXIMITY_PERCENT}% of the configured target.` };
  }
  if (input.regimeChanged) {
    return { state: "WATCH", severity: "WATCH", reason: "Verified market regime differs from the position opening regime." };
  }
  return { state: "OPEN", severity: "INFO", reason: "Paper position is monitored with current verified evidence." };
}

export function monitoringEventKey(positionId: number, state: PaperPositionState, providerUpdatedAt: number | null, evaluatedAt: number) {
  return `${positionId}:${state}:${providerUpdatedAt ?? evaluatedAt}`;
}

export function hasMonitoringStateTransition(previousState: PaperPositionState | null, nextState: PaperPositionState) {
  return previousState !== nextState;
}

export function shouldCloseMonitoredPosition(previousState: PaperPositionState, isStillOpen: boolean) {
  return previousState !== "CLOSED" && !isStillOpen;
}

export function monitoringExposurePercent(exposure: { totalExposurePercent?: unknown } | null | undefined) {
  const value = Number(exposure?.totalExposurePercent ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function monitoringAlertValue(position: MonitoredPositionRisk): string | null {
  return position.currentPriceUsd === null ? null : position.currentPriceUsd.toFixed(8);
}
