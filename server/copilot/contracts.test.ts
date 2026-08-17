import { describe, expect, it } from "vitest";
import { classifyCopilotQuestion, defaultCopilotPreferences, severityRank, shouldEmitSmartAlert, smartAlertTypes } from "./contracts";

describe("Version 2.4 Copilot contracts", () => {
  it("classifies bounded evidence requests without treating them as trade commands", () => {
    expect(classifyCopilotQuestion("Why was my paper trade rejected by the Risk Engine?")).toBe("RISK");
    expect(classifyCopilotQuestion("Explain this backtest run")).toBe("BACKTEST");
    expect(classifyCopilotQuestion("Show my portfolio exposure")).toBe("PORTFOLIO");
    expect(classifyCopilotQuestion("Explain BTC context")).toBe("MARKET");
  });

  it("ships a conservative bounded default context and monotonic severity levels", () => {
    const defaults = defaultCopilotPreferences();
    expect(defaults.favoriteSymbols).toEqual(["BTC", "ETH", "SOL"]);
    expect(defaults.riskTolerance).toBe("BALANCED");
    expect(defaults.enabledAlertTypes).toContain("DATA_UNAVAILABLE");
    expect(defaults.enabledAlertTypes).toHaveLength(smartAlertTypes.length);
    expect(severityRank("INFO")).toBeLessThan(severityRank("WATCH"));
    expect(severityRank("WATCH")).toBeLessThan(severityRank("WARNING"));
    expect(severityRank("WARNING")).toBeLessThan(severityRank("CRITICAL"));
  });

  it("suppresses disabled, low-severity, and cooled-down smart alerts deterministically", () => {
    const enabled = ["RISK_SCORE_HIGH"] as const;
    expect(shouldEmitSmartAlert({ enabled, minimumSeverity: "WATCH", type: "RISK_SCORE_HIGH", severity: "WARNING", priorCooldownUntil: null, now: 100 })).toBe(true);
    expect(shouldEmitSmartAlert({ enabled, minimumSeverity: "WATCH", type: "RISK_SCORE_HIGH", severity: "INFO", priorCooldownUntil: null, now: 100 })).toBe(false);
    expect(shouldEmitSmartAlert({ enabled, minimumSeverity: "WATCH", type: "RISK_SCORE_HIGH", severity: "WARNING", priorCooldownUntil: 101, now: 100 })).toBe(false);
    expect(shouldEmitSmartAlert({ enabled, minimumSeverity: "WATCH", type: "VOLATILITY_SPIKE", severity: "WARNING", priorCooldownUntil: null, now: 100 })).toBe(false);
  });
});
