import { describe, expect, it } from "vitest";

/**
 * Pure-logic regression tests for the monitoring health precedence rules.
 *
 * These mirror the decision in runManagedMonitoringHealthCheck. They are kept
 * dependency-free deliberately: the surrounding function requires a live
 * database, and mocking the whole Drizzle chain would test the mock rather than
 * the rule. The rule itself is the thing that regressed historically.
 */
type Freshness = "FRESH" | "STALE" | "UNAVAILABLE" | "UNKNOWN";
type Execution = { evaluatedUsers: number; failedUsers: number };

function deriveStatus(freshness: Freshness, execution?: Execution) {
  const attempted = execution ? execution.evaluatedUsers + execution.failedUsers : 0;
  if (execution && attempted > 0 && execution.evaluatedUsers === 0) return "FAILED";
  if ((execution && execution.failedUsers > 0) || freshness === "STALE") return "DEGRADED";
  return "OPERATIONAL";
}

describe("monitoring health precedence", () => {
  it("reports FAILED when every attempted evaluation errored", () => {
    expect(deriveStatus("FRESH", { evaluatedUsers: 0, failedUsers: 5 })).toBe("FAILED");
  });

  it("reports DEGRADED on partial failure even when data looks fresh", () => {
    // Regression: freshness-only logic reported OPERATIONAL here.
    expect(deriveStatus("FRESH", { evaluatedUsers: 3, failedUsers: 2 })).toBe("DEGRADED");
  });

  it("reports DEGRADED when observations are stale", () => {
    expect(deriveStatus("STALE", { evaluatedUsers: 3, failedUsers: 0 })).toBe("DEGRADED");
  });

  it("treats an empty candidate list as OPERATIONAL, not FAILED", () => {
    // No open positions is legitimately no work, not a broken runner.
    expect(deriveStatus("FRESH", { evaluatedUsers: 0, failedUsers: 0 })).toBe("OPERATIONAL");
  });

  it("reports OPERATIONAL when evaluations succeed and data is fresh", () => {
    expect(deriveStatus("FRESH", { evaluatedUsers: 10, failedUsers: 0 })).toBe("OPERATIONAL");
  });

  it("falls back to freshness when no execution summary is supplied", () => {
    expect(deriveStatus("STALE")).toBe("DEGRADED");
    expect(deriveStatus("FRESH")).toBe("OPERATIONAL");
  });
});
