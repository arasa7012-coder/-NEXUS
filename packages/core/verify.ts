// Dependency-free verification harness for @nexus/core.
// Runs under: node --experimental-strip-types verify.ts
import { analyzeTimeframe } from "./src/intelligence/engine.ts";
import type { AnalysisCandle } from "./src/intelligence/types.ts";
import { calculatePositionSize } from "./src/risk/calculations.ts";
import { calculateRiskLevel } from "./src/risk/riskLevel.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
};

// Deterministic synthetic fixture (TEST DATA ONLY — never a production path).
function candles(n: number, start = 100, drift = 0.4): AnalysisCandle[] {
  const out: AnalysisCandle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) + 0.6;
    const low = Math.min(open, close) - 0.6;
    out.push({
      openTime: i * 3600_000, closeTime: (i + 1) * 3600_000 - 1,
      open, high, low, close, volume: 1000 + i * 5,
      quoteVolumeUsd: (1000 + i * 5) * close, tradeCount: 250 + i,
    });
    price = close;
  }
  return out;
}

const base = {
  timeframe: "1h" as const, source: "PROVIDER" as const,
  cachedAt: 1_700_000_000_000, providerUpdatedAt: 1_700_000_000_000,
  providerTimestampOrigin: "PROVIDER" as const, isStale: false,
};

console.log("\n[1] Intelligence — sufficient data");
const rich = analyzeTimeframe({ ...base, candles: candles(120) });
ok("returns the requested timeframe", rich.timeframe === "1h");
ok("metadata carries a quality verdict", typeof rich.metadata?.quality === "string", String(rich.metadata?.quality));
ok("indicators computed", rich.indicators !== undefined);
ok("regime classified, not invented", rich.regime !== undefined && "status" in rich.regime);

console.log("\n[2] Intelligence — insufficient data must degrade, not fabricate");
const thin = analyzeTimeframe({ ...base, candles: candles(3) });
ok("thin sample does not throw", thin !== undefined);
ok("thin sample is not reported as full quality", thin.metadata?.quality !== "COMPLETE", String(thin.metadata?.quality));

console.log("\n[3] Intelligence — provider error must surface as UNAVAILABLE");
const errored = analyzeTimeframe({
  ...base, candles: [], hasError: true,
  unavailableReasons: ["provider request failed"],
});
ok("error path yields ERROR quality", errored.metadata?.quality === "ERROR", String(errored.metadata?.quality));
ok("regime is UNAVAILABLE, never guessed", errored.regime?.status === "UNAVAILABLE", String(errored.regime?.status));
ok("regime value is null on unavailable", errored.regime?.value === null);
ok("an unavailable reason is attributed", (errored.metadata?.unavailableReasons?.length ?? 0) > 0);

console.log("\n[4] Risk — position sizing is deterministic and bounded");
const sizeInput = {
  accountEquityUsd: 10_000, availableCashUsd: 5_000,
  entryPriceUsd: 100, stopPriceUsd: 95, requestedQuantity: 50,
  riskPerTradePercent: 1, feeBps: 10, slippageBps: 5,
  remainingTotalExposureUsd: 4_000, remainingAssetExposureUsd: 2_000,
};
const a = calculatePositionSize(sizeInput);
const b = calculatePositionSize(sizeInput);
ok("identical input yields identical output", JSON.stringify(a) === JSON.stringify(b));
ok("notional is capped by remaining asset exposure", a.notionalUsd <= 2_000 + 1e-6, `notional=${a.notionalUsd}`);
ok("approved quantity is finite and non-negative", Number.isFinite(a.approvedQuantity) && a.approvedQuantity >= 0, String(a.approvedQuantity));
ok("the binding constraint is attributed", typeof a.limitingFactor === "string", String(a.limitingFactor));
ok("planned loss respects the 1% risk budget", a.plannedLossUsd <= 100 + 1e-6, `plannedLoss=${a.plannedLossUsd}`);

let threw = false;
try { calculatePositionSize({ ...sizeInput, accountEquityUsd: 0 }); } catch (e: any) { threw = e?.code === "INVALID_INPUT"; }
ok("invalid equity rejected with typed code", threw);

let stopThrew = false;
try { calculatePositionSize({ ...sizeInput, stopPriceUsd: 100 }); } catch (e: any) { stopThrew = typeof e?.code === "string"; }
ok("zero-distance stop rejected, not silently sized", stopThrew);

console.log("\n[5] Risk — level refuses to score on unavailable data");
const unavailable = calculateRiskLevel({
  dataQuality: "UNAVAILABLE", atrPercent: null, timeframeConflict: false,
  intelligenceRiskScore: null, signalStrength: null, dailyDrawdownPercent: 0,
});
ok("level is null when data is unavailable", unavailable.level === null, String(unavailable.level));
ok("score is null when data is unavailable", unavailable.score === null);
ok("a reason factor is still attributed", (unavailable.factors?.length ?? 0) > 0);

const scored = calculateRiskLevel({
  dataQuality: "COMPLETE", atrPercent: 3.2, timeframeConflict: true,
  intelligenceRiskScore: 62, signalStrength: 40, dailyDrawdownPercent: 2.5,
});
ok("level is assigned when data is complete", scored.level !== null, String(scored.level));
ok("score is explainable via factors", (scored.factors?.length ?? 0) > 0, `${scored.factors?.length} factors`);

console.log("\n[6] Preserved core functionality is reachable");
const barrel = await import("./src/index.ts");
for (const name of [
  "DEFAULT_RISK_SETTINGS", "validateRiskSettings", "normalizeRiskSettings",
  "evaluatePositionRisk", "buildRiskPlan", "dailySnapshotFromStored",
  "calculateStop", "analyzeSentimentHeuristic", "dedupeKey", "IdSequence",
]) {
  ok(`${name} is exported`, name in barrel);
}

const defaults = (barrel as { DEFAULT_RISK_SETTINGS: Record<string, unknown> }).DEFAULT_RISK_SETTINGS;
ok("default risk settings are frozen against mutation", Object.isFrozen(defaults));
const issues = (barrel as { validateRiskSettings: (s: unknown) => string[] })
  .validateRiskSettings(defaults as never);
ok("the shipped defaults are themselves valid", issues.length === 0, issues.join("; "));

console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}\n`);
process.exit(fail === 0 ? 0 : 1);
