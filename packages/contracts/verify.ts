// Run: node --experimental-strip-types verify.ts
import {
  alert,
  compareAlerts,
  dataOrigin,
  entityKey,
  entityRef,
  explainedScore,
  isRetryable,
  monitor,
  nexusError,
  providerStatus,
  riskView,
  ValidationError,
} from "./src/index.ts";
import type { Alert, Severity } from "./src/index.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
};

const T = 1_760_000_000_000;

const mkAlert = (o: Partial<Alert> = {}): Alert => ({
  id: "01K7ABCDEF0000A1",
  dedupeKey: "risk.drawdown:1a2b3c4d5e6f7081",
  createdAt: T, updatedAt: T,
  severity: "WARNING", priority: 500,
  title: "Daily drawdown approaching limit",
  explanation: "Drawdown reached 4.1% against a 5% daily limit.",
  source: "risk-engine",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
  status: "OPEN", read: false,
  acknowledgedAt: null, resolvedAt: null,
  occurrences: 1, history: [],
  ...o,
});

console.log("\n[1] Structural validation actually rejects bad payloads");
ok("a well-formed alert parses", alert.safeParse(mkAlert()).ok);
ok("unknown severity rejected", !alert.safeParse(mkAlert({ severity: "SCARY" as Severity })).ok);
ok("empty explanation rejected — alerts must explain themselves",
  !alert.safeParse(mkAlert({ explanation: "" })).ok);
ok("missing field rejected", !alert.safeParse({ id: "x" }).ok);
const bad = alert.safeParse(mkAlert({ priority: -1 }));
ok("issue carries a field path", !bad.ok && bad.issues[0]!.path === "priority", !bad.ok ? bad.issues[0]!.path : "");

console.log("\n[2] Seconds-vs-milliseconds confusion is caught, not stored");
ok("epoch seconds rejected as a timestamp", !alert.safeParse(mkAlert({ createdAt: 1_760_000_000 })).ok);
ok("epoch milliseconds accepted", alert.safeParse(mkAlert({ createdAt: T })).ok);

console.log("\n[3] parse() throws a typed, path-bearing error");
let caught: unknown = null;
try { alert.parse({}); } catch (e) { caught = e; }
ok("throws ValidationError", caught instanceof ValidationError);
ok("reports every missing field at once",
  caught instanceof ValidationError && caught.issues.length > 5, `${(caught as ValidationError)?.issues.length} issues`);

console.log("\n[4] Alert ordering matches the specified precedence");
const unreadInfo = mkAlert({ id: "A", severity: "INFO", read: false, priority: 1, createdAt: T });
const readCritical = mkAlert({ id: "B", severity: "CRITICAL", read: true, priority: 900, createdAt: T + 5 });
ok("unread outranks read regardless of severity", compareAlerts(unreadInfo, readCritical) < 0);

const critical = mkAlert({ id: "C", severity: "CRITICAL", read: false, priority: 1 });
const warning = mkAlert({ id: "D", severity: "WARNING", read: false, priority: 999 });
ok("within unread, severity outranks priority", compareAlerts(critical, warning) < 0);

const hi = mkAlert({ id: "E", severity: "WARNING", read: false, priority: 900, createdAt: T });
const lo = mkAlert({ id: "F", severity: "WARNING", read: false, priority: 100, createdAt: T + 999 });
ok("within severity, priority outranks recency", compareAlerts(hi, lo) < 0);

const older = mkAlert({ id: "G", severity: "INFO", read: false, priority: 5, createdAt: T });
const newer = mkAlert({ id: "H", severity: "INFO", read: false, priority: 5, createdAt: T + 1 });
ok("recency breaks the final tie", compareAlerts(newer, older) < 0);

const sorted = [readCritical, older, critical, newer].sort(compareAlerts).map((a) => a.id);
ok("full sort is stable and correct", sorted[0] === "C" && sorted[3] === "B", sorted.join(","));

console.log("\n[5] Unavailability is representable — the point of the whole design");
ok("a score may be null with a stated reason", explainedScore.safeParse({
  value: null, coveragePercent: 0, factors: [],
  unavailableReason: "Provider returned no candles for this timeframe.",
}).ok);
ok("UNAVAILABLE origin needs no observation timestamp", dataOrigin.safeParse({
  freshness: "UNAVAILABLE", providerId: "twelvedata",
  observedAt: null, cachedAt: null, reason: "Upstream request timed out.",
}).ok);
ok("a risk view may decline to assign a level", riskView.safeParse({
  entity: null, level: null,
  score: { value: null, coveragePercent: 0, factors: [], unavailableReason: "Market data unavailable." },
  origin: { freshness: "UNAVAILABLE", providerId: null, observedAt: null, cachedAt: null, reason: "No provider configured." },
  emergencyStopActive: false, evaluatedAt: T,
}).ok);
ok("score above 100 rejected", !explainedScore.safeParse({
  value: 140, coveragePercent: 100, factors: [], unavailableReason: null,
}).ok);

console.log("\n[6] Operational contracts");
ok("provider status parses", providerStatus.safeParse({
  providerId: "alchemy", displayName: "Alchemy", state: "DEGRADED",
  lastSuccessAt: T, lastFailureAt: T + 10, consecutiveFailures: 3,
  latencyMs: 812, detail: "Elevated latency on eth_getLogs.",
}).ok);
ok("monitor interval floor enforced", !monitor.safeParse({
  id: "m1", name: "BTC drawdown", target: { kind: "ASSET", id: "BTCUSDT", label: "BTC" },
  state: "ACTIVE", intervalSeconds: 1, lastRunAt: null, nextRunAt: null,
  lastOutcome: null, consecutiveFailures: 0, detail: null,
}).ok);
ok("error contract parses", nexusError.safeParse({
  code: "PROVIDER_UNAVAILABLE", message: "Market data provider is unreachable.",
  retryable: true, traceId: "trace-1",
}).ok);
ok("transient failures are retryable",
  isRetryable("TIMEOUT") && isRetryable("RATE_LIMIT") && isRetryable("PROVIDER_UNAVAILABLE"));
ok("deterministic failures are not retryable",
  !isRetryable("FORBIDDEN") && !isRetryable("VALIDATION") && !isRetryable("NOT_FOUND"));

console.log("\n[7] Entity addressing is canonical");
ok("entity ref parses", entityRef.safeParse({ kind: "WALLET", id: "0xabc", label: "Treasury" }).ok);
ok("entity key is lowercase and stable", entityKey({ kind: "ASSET", id: "BTCUSDT" }) === "asset:BTCUSDT");
ok("unknown entity kind rejected", !entityRef.safeParse({ kind: "SPACESHIP", id: "x", label: "y" }).ok);

console.log(`\n${"=".repeat(52)}\n  contracts: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
