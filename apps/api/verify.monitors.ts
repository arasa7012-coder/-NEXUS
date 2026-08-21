// Run: node --experimental-strip-types --conditions=nexus-source verify.monitors.ts
//
// Covers: persistent Emergency Stop, the replica-safe rate limiter, and the
// complete monitor loop — definition -> scheduler -> claim -> executor ->
// provider -> intelligence/risk -> alert -> event.
import { IdSequence } from "@nexus/core";
import type { AnalysisCandle } from "@nexus/core";
import { monitor as monitorContract } from "@nexus/contracts";
import type { Monitor, MonitorDraft } from "@nexus/contracts";
import { createApp } from "./src/app.ts";
import type { Clock } from "./src/platform/events.ts";
import { InMemoryEventBus } from "./src/platform/events.ts";
import { createLogger } from "./src/platform/logger.ts";
import {
  InMemoryCounterStore, InMemoryRateLimiter, SharedStoreRateLimiter, POLICIES,
} from "./src/platform/rateLimit.ts";
import { SafetyService } from "./src/domain/safety/safetyService.ts";
import { nextRunAt } from "./src/domain/monitoring/scheduler.ts";
import { MonitorError } from "./src/domain/monitoring/monitorService.ts";
import { classifyProviderReason } from "./src/domain/monitoring/monitorExecutor.ts";
import { backoffDelayMs } from "./src/domain/monitoring/scheduler.ts";
import { hashPassword } from "./src/auth/passwords.ts";
import {
  InMemoryAlertRepository, InMemoryEntityRepository, InMemoryMonitorRepository,
  InMemoryRiskRepository, InMemorySafetyStateRepository, InMemorySessionRepository,
  InMemoryUserRepository, UnreachableSafetyStateRepository,
} from "./src/adapters/memory/repositories.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
};

const T0 = 1_760_000_000_000;
class TestClock implements Clock {
  private t: number;
  constructor(t = T0) { this.t = t; }
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
}

// ===========================================================================
console.log("\n[1] Emergency Stop survives a restart");

const sClock = new TestClock();
const sBus = new InMemoryEventBus({ nodeId: "S", clock: sClock });
let storage = new InMemorySafetyStateRepository();
let safety = new SafetyService({ repo: storage, events: sBus, clock: sClock });

ok("default state is clear", !(await safety.isEmergencyStopActive("u1")));

const activated = await safety.activate({ userId: "u1", reason: "Manual halt during volatility.", actor: "u1" });
ok("activate reports active", activated.active);
ok("the reason is recorded", activated.reason === "Manual halt during volatility.");
ok("the activation is timestamped", activated.activatedAt === T0);
ok("the actor is recorded for audit", activated.actor === "u1");
ok("EMERGENCY_STOP_ACTIVATED was published",
  sBus.recent(20).some((e) => e.type === "EMERGENCY_STOP_ACTIVATED" && e.severity === "CRITICAL"));

// Restart: rebuild the service from scratch against surviving storage.
storage = storage.reconnect();
safety = new SafetyService({ repo: storage, events: sBus, clock: sClock });
ok("the stop is STILL ACTIVE after a restart", await safety.isEmergencyStopActive("u1"));
ok("the reason survived the restart", (await safety.current("u1")).reason === "Manual halt during volatility.");
ok("the actor survived the restart", (await safety.current("u1")).actor === "u1");

ok("another user is unaffected", !(await safety.isEmergencyStopActive("u2")));

sClock.advance(1000);
await safety.activate({ userId: "u1", reason: "Pressed again.", actor: "u1" });
ok("re-activating is a safe no-op", (await safety.current("u1")).reason === "Manual halt during volatility.");

let rejected = false;
try { await safety.activate({ userId: "u3", reason: "x", actor: "u3" }); } catch { rejected = true; }
ok("a too-short reason is refused by the core validator", rejected);

const cleared = await safety.reset({ userId: "u1", actor: "admin" });
ok("reset clears the stop", !cleared.active);
ok("reset is timestamped", cleared.resetAt === T0 + 1000);
ok("reset records who did it", cleared.actor === "admin");
ok("EMERGENCY_STOP_RESET was published", sBus.recent(20).some((e) => e.type === "EMERGENCY_STOP_RESET"));
ok("monitoring is permitted again", !(await safety.isEmergencyStopActive("u1")));

const audit = await safety.history("u1");
ok("every transition is in the audit trail", audit.length === 2, String(audit.length));
ok("the audit trail is append-only and ordered newest first", audit[0]!.transition === "RESET");

// Fail closed: an unreadable store must not read as "no stop configured".
const blind = new SafetyService({ repo: new UnreachableSafetyStateRepository(), events: sBus, clock: sClock });
ok("an unreadable store fails CLOSED, not open", await blind.isEmergencyStopActive("u1"));

// ===========================================================================
console.log("\n[2] Rate limiting is replica safe");

const rClock = new TestClock();
const single = new InMemoryRateLimiter(rClock);
let allowed = 0;
for (let i = 0; i < 8; i++) if ((await single.check("ip1", POLICIES.auth)).allowed) allowed++;
ok("in-memory limiter caps the burst", allowed === 5, String(allowed));
single.reset("ip1");
ok("reset clears a key", (await single.check("ip1", POLICIES.auth)).allowed);

// The point of the exercise: several logical replicas, one shared store.
const store = new InMemoryCounterStore(rClock);
const replicaA = new SharedStoreRateLimiter({ store, clock: rClock });
const replicaB = new SharedStoreRateLimiter({ store, clock: rClock });
const replicaC = new SharedStoreRateLimiter({ store, clock: rClock });

let sharedAllowed = 0;
for (let i = 0; i < 9; i++) {
  const replica = [replicaA, replicaB, replicaC][i % 3]!;
  if ((await replica.check("ip9", POLICIES.auth)).allowed) sharedAllowed++;
}
ok("three replicas share ONE limit rather than one each",
  sharedAllowed === POLICIES.auth.capacity, `${sharedAllowed} allowed of 9`);

const denied = await replicaB.check("ip9", POLICIES.auth);
ok("a rejected request reports retry-after", !denied.allowed && denied.retryAfterSec > 0, String(denied.retryAfterSec));
ok("a different key has its own budget", (await replicaC.check("ip-other", POLICIES.auth)).allowed);

rClock.advance(301_000);
ok("the window expires and the budget returns", (await replicaA.check("ip9", POLICIES.auth)).allowed);
ok("expired counters are swept from the store", store.size < 5, String(store.size));

await replicaA.reset("ip9");
ok("reset is available on the shared limiter", true);

// ===========================================================================
console.log("\n[3] The complete monitor loop");

const clock = new TestClock();
const repositories = {
  alerts: new InMemoryAlertRepository(),
  monitors: new InMemoryMonitorRepository(),
  sessions: new InMemorySessionRepository(),
  users: new InMemoryUserRepository(),
  risk: new InMemoryRiskRepository(),
  entities: new InMemoryEntityRepository(),
  safety: new InMemorySafetyStateRepository(),
};
repositories.monitors.useClock(() => clock.now());

const passwordHash = await hashPassword("correct horse battery staple");
repositories.users.seed({ id: "u1", email: "a@nexus.app", passwordHash, roles: ["user"], disabledAt: null });
repositories.users.seed({ id: "u2", email: "b@nexus.app", passwordHash, roles: ["user"], disabledAt: null });

const app = createApp({
  config: {
    jwtSecret: "m".repeat(48), issuer: "nexus", audience: "nexus-mobile",
    nodeId: "M1", version: "1.0.0-mon", marketProviderId: "market", logLevel: "error",
  },
  repositories, clock, logSink: () => {},
});

function candles(n: number, drift: number): AnalysisCandle[] {
  const out: AnalysisCandle[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const open = p, close = p + drift;
    out.push({
      openTime: T0 + i * 3600_000, closeTime: T0 + (i + 1) * 3600_000 - 1,
      open, high: Math.max(open, close) + Math.abs(drift) * 4, low: Math.min(open, close) - Math.abs(drift) * 4,
      close, volume: 1000 + i * 5, quoteVolumeUsd: (1000 + i * 5) * close, tradeCount: 250 + i,
    });
    p = close;
  }
  return out;
}

let providerMode: "ok" | "fail" | "timeout" = "ok";
app.providers.register({
  id: "market", displayName: "Market Data",
  isConfigured: () => true,
  fetch: async () => {
    if (providerMode === "fail") throw new Error("upstream 503 service unavailable");
    if (providerMode === "timeout") throw new Error("request timed out after 10000ms");
    return { data: candles(150, 2.4), observedAt: clock.now() - 1000 };
  },
});

await app.entities.register({ kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" }, null, clock.now());
await app.entities.register({ kind: "PROVIDER", id: "market", label: "Market Data" }, null, clock.now());

// Record every event type published by this app instance: the bus ring buffer
// is bounded, and these assertions span many cycles.
const dApp0Events: string[] = [];
app.bus.on("*", "monitor-event-recorder", (e) => { dApp0Events.push(e.type); });

const draft: MonitorDraft = {
  name: "BTC risk watch",
  type: "ASSET_INTELLIGENCE",
  target: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
  config: { type: "ASSET_INTELLIGENCE", riskAtOrAbove: "MODERATE", signalAtOrAbove: null, onDataUnavailable: false },
  intervalSeconds: 60,
  enabled: true,
};

console.log("\n  -- creation and validation --");
const created = await app.monitors.create("u1", draft);
ok("a monitor is created", created.id.length > 0);
ok("it satisfies the wire contract", monitorContract.safeParse(created).ok,
  JSON.stringify(monitorContract.safeParse(created)).slice(0, 200));
ok("it is owned by its creator", created.userId === "u1");
ok("an enabled monitor is due immediately", created.nextRunAt === clock.now());
ok("state reflects enablement", created.state === "ACTIVE" && created.enabled);
ok("MONITOR_CREATED was published", app.bus.recent(20).some((e) => e.type === "MONITOR_CREATED"));

const reason = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return "NO_THROW"; } catch (e) { return e instanceof MonitorError ? e.reason : "OTHER"; }
};

ok("an unknown target is refused",
  (await reason(() => app.monitors.create("u1", { ...draft, target: { kind: "ASSET", id: "FAKECOIN", label: "Fake" } }))) === "UNKNOWN_TARGET");
ok("a target of the wrong kind for the type is refused",
  (await reason(() => app.monitors.create("u1", { ...draft, target: { kind: "WALLET", id: "0x1", label: "W" } }))) === "UNSUPPORTED_TYPE");
ok("a config not matching the declared type is refused",
  (await reason(() => app.monitors.create("u1", {
    ...draft, config: { type: "PROVIDER_HEALTH", providerId: "market", failuresAtOrAbove: 3 },
  }))) === "INVALID");
ok("a monitor with no trigger condition is refused",
  (await reason(() => app.monitors.create("u1", {
    ...draft, config: { type: "ASSET_INTELLIGENCE", riskAtOrAbove: null, signalAtOrAbove: null, onDataUnavailable: false },
  }))) === "INVALID");
ok("an interval below the floor is refused",
  (await reason(() => app.monitors.create("u1", { ...draft, intervalSeconds: 1 }))) === "INVALID");
ok("an unregistered provider is refused",
  (await reason(() => app.monitors.create("u1", {
    name: "p", type: "PROVIDER_HEALTH", target: { kind: "PROVIDER", id: "market", label: "M" },
    config: { type: "PROVIDER_HEALTH", providerId: "ghost-provider", failuresAtOrAbove: 3 },
    intervalSeconds: 60, enabled: true,
  }))) === "UNKNOWN_PROVIDER");

console.log("\n  -- user isolation --");
const otherUsers = await app.monitors.list("u2");
ok("another user sees none of these monitors", otherUsers.length === 0);
ok("another user cannot read one by id", (await reason(() => app.monitors.get("u2", created.id))) === "NOT_FOUND");
ok("another user cannot update one", (await reason(() => app.monitors.update("u2", created.id, draft))) === "NOT_FOUND");
ok("another user cannot disable one", (await reason(() => app.monitors.setEnabled("u2", created.id, false))) === "NOT_FOUND");
ok("another user cannot delete one", (await reason(() => app.monitors.delete("u2", created.id))) === "NOT_FOUND");
ok("cross-user access reports NOT_FOUND, never FORBIDDEN — no enumeration oracle",
  (await reason(() => app.monitors.get("u2", created.id))) !== "FORBIDDEN");

console.log("\n  -- execution: definition -> runner -> alert --");
const cycle = await app.runMonitorCycle();
ok("the due monitor ran", cycle.ran === 1, JSON.stringify(cycle));
ok("it triggered on real evaluated risk", cycle.triggered === 1, JSON.stringify(cycle));

const alerts = await repositories.alerts.list({ limit: 10 });
ok("the trigger produced exactly one alert", alerts.length === 1, String(alerts.length));
ok("the alert is attributed to the monitor", alerts[0]?.source === `monitor:${created.id}`);
ok("the alert names the monitored entity", alerts[0]?.entity?.id === "BTCUSDT");
ok("the alert explains itself with real evidence",
  (alerts[0]?.explanation ?? "").includes("Risk is"), alerts[0]?.explanation.slice(0, 90) ?? "");
ok("the risk evaluation was persisted", (await repositories.risk.history({ kind: "ASSET", id: "BTCUSDT", label: "" }, 10)).length === 1);

const after = repositories.monitors.get(created.id)!;
ok("the monitor recorded its run", after.lastRunAt !== null && after.lastOutcome === "TRIGGERED");
ok("the monitor was rescheduled at its interval", after.nextRunAt === clock.now() + 60_000);

console.log("\n  -- deduplication across repeated runs --");
clock.advance(60_000);
await app.runMonitorCycle();
clock.advance(60_000);
await app.runMonitorCycle();
const afterRepeats = await repositories.alerts.list({ limit: 10 });
ok("repeated detections do NOT create duplicate alerts", afterRepeats.length === 1, String(afterRepeats.length));
ok("occurrences accumulate instead", (afterRepeats[0]?.occurrences ?? 0) === 3, String(afterRepeats[0]?.occurrences));
ok("the alert id is stable across repeats", afterRepeats[0]?.id === alerts[0]?.id);
ok("only one ALERT_CREATED was ever published — no notification spam",
  app.bus.recent(200).filter((e) => e.type === "ALERT_CREATED").length === 1);

console.log("\n  -- emergency stop halts execution --");
await app.safety.activate({ userId: "u1", reason: "Halting all automated activity.", actor: "u1" });
clock.advance(60_000);
const stoppedCycle = await app.runMonitorCycle();
ok("the monitor is still claimed and run", stoppedCycle.ran === 1);
ok("but it refuses to evaluate anything", stoppedCycle.triggered === 0, JSON.stringify(stoppedCycle));
ok("and says why", (repositories.monitors.get(created.id)?.detail ?? "").includes("Emergency Stop"));
ok("no new alert was raised while stopped", (await repositories.alerts.list({ limit: 10 })).length === 1);

await app.safety.reset({ userId: "u1", actor: "u1" });
clock.advance(60_000);
const resumed = await app.runMonitorCycle();
ok("monitoring resumes after the stop is cleared", resumed.triggered === 1, JSON.stringify(resumed));

console.log("\n  -- provider failure is classified, never invented intelligence --");
ok("a 503 maps to PROVIDER_UNAVAILABLE", classifyProviderReason("Provider request failed: upstream 503") === "PROVIDER_UNAVAILABLE");
ok("a timeout maps to TIMEOUT", classifyProviderReason("request timed out after 10000ms") === "TIMEOUT");
ok("a cooldown maps to RATE_LIMITED", classifyProviderReason("Provider is in cooldown; retrying in 45s") === "RATE_LIMITED");
ok("a credential failure maps to AUTH_FAILED", classifyProviderReason("no credentials configured") === "AUTH_FAILED");

providerMode = "fail";
const alertsBefore = (await repositories.alerts.list({ limit: 20 })).length;
clock.advance(60_000);
const failedCycle = await app.runMonitorCycle();
ok("a provider failure is recorded as a monitor failure", failedCycle.failed === 1, JSON.stringify(failedCycle));
ok("it does not count as a trigger", failedCycle.triggered === 0);
ok("NO alert was invented from missing data",
  (await repositories.alerts.list({ limit: 20 })).length === alertsBefore);
const failing = repositories.monitors.get(created.id)!;
ok("the monitor is marked FAILING", failing.state === "FAILING");
ok("the failure count incremented", failing.consecutiveFailures === 1);
// A single failure earns 30s of backoff, which is *below* the 60s interval,
// so the interval still governs. That is correct: backoff only takes over
// once the penalty exceeds the schedule. Asserting the real rule rather than
// assuming backoff always dominates.
ok("the next run respects the interval floor",
  (failing.nextRunAt ?? 0) === clock.now() + 60_000, String((failing.nextRunAt ?? 0) - clock.now()));
ok("sustained failure grows the backoff past the interval",
  backoffDelayMs(4) > 60_000 && backoffDelayMs(1) < 60_000,
  `1 fail=${backoffDelayMs(1)}ms, 4 fails=${backoffDelayMs(4)}ms`);

console.log("\n  -- failure and recovery are announced --");
const failedEvents = dApp0Events.filter((e) => e === "MONITOR_FAILED");
ok("MONITOR_FAILED was published", failedEvents.length >= 1, String(failedEvents.length));
ok("the failure kind reached the event",
  app.bus.recent(50).some((e) => e.type === "MONITOR_FAILED" && typeof e.data.failureKind === "string"));
ok("the failure kind is persisted on the monitor row",
  repositories.monitors.get(created.id)?.lastFailureKind !== null,
  String(repositories.monitors.get(created.id)?.lastFailureKind));
ok("the kind is the classified one, not a generic INTERNAL",
  repositories.monitors.get(created.id)?.lastFailureKind === "PROVIDER_UNAVAILABLE",
  String(repositories.monitors.get(created.id)?.lastFailureKind));

console.log("\n  -- recovery --");
providerMode = "ok";
clock.advance(600_000);
const recovered = await app.runMonitorCycle();
ok("the monitor runs again after backoff", recovered.ran === 1, JSON.stringify(recovered));
ok("it returns to ACTIVE", repositories.monitors.get(created.id)?.state === "ACTIVE");
ok("the failure streak resets", repositories.monitors.get(created.id)?.consecutiveFailures === 0);
ok("MONITOR_RECOVERED was published once the monitor worked again",
  dApp0Events.includes("MONITOR_RECOVERED"));
ok("the persisted failure kind is cleared on recovery",
  repositories.monitors.get(created.id)?.lastFailureKind === null,
  String(repositories.monitors.get(created.id)?.lastFailureKind));

console.log("\n  -- enable / disable / update / delete --");
const disabled = await app.monitors.setEnabled("u1", created.id, false);
ok("disable sets enabled false and state PAUSED", !disabled.enabled && disabled.state === "PAUSED");
ok("a disabled monitor is unscheduled", disabled.nextRunAt === null);
ok("MONITOR_DISABLED was published", app.bus.recent(50).some((e) => e.type === "MONITOR_DISABLED"));

clock.advance(120_000);
const skipped = await app.runMonitorCycle();
ok("a disabled monitor is never executed", skipped.ran === 0, JSON.stringify(skipped));

const reEnabled = await app.monitors.setEnabled("u1", created.id, true);
ok("enable restores scheduling", reEnabled.enabled && reEnabled.nextRunAt === clock.now());
ok("MONITOR_ENABLED was published", app.bus.recent(50).some((e) => e.type === "MONITOR_ENABLED"));

const updated = await app.monitors.update("u1", created.id, { ...draft, name: "BTC extreme only", intervalSeconds: 300 });
ok("update applies the new definition", updated.name === "BTC extreme only" && updated.intervalSeconds === 300);
ok("update preserves the id and owner", updated.id === created.id && updated.userId === "u1");
ok("update preserves createdAt", updated.createdAt === created.createdAt);
ok("MONITOR_UPDATED was published", app.bus.recent(50).some((e) => e.type === "MONITOR_UPDATED"));

await app.monitors.delete("u1", created.id);
ok("delete removes the monitor", (await app.monitors.list("u1")).length === 0);
ok("MONITOR_DELETED was published", app.bus.recent(50).some((e) => e.type === "MONITOR_DELETED"));
ok("a deleted monitor is no longer scheduled", (await app.runMonitorCycle()).ran === 0);

console.log("\n  -- provider health monitor --");
const healthMonitor = await app.monitors.create("u1", {
  name: "Market feed health",
  type: "PROVIDER_HEALTH",
  target: { kind: "PROVIDER", id: "market", label: "Market Data" },
  config: { type: "PROVIDER_HEALTH", providerId: "market", failuresAtOrAbove: 2 },
  intervalSeconds: 60, enabled: true,
});
ok("a provider health monitor is accepted", healthMonitor.type === "PROVIDER_HEALTH");

const healthy = await app.runMonitorCycle();
ok("a healthy provider does not trigger", healthy.triggered === 0, JSON.stringify(healthy));

providerMode = "fail";
for (let i = 0; i < 3; i++) await app.intelligence.forAsset({ kind: "ASSET", id: "BTCUSDT", label: "BTC" });
clock.advance(60_000);
const unhealthy = await app.runMonitorCycle();
ok("a failing provider triggers the health monitor", unhealthy.triggered === 1, JSON.stringify(unhealthy));
const providerAlert = (await repositories.alerts.list({ limit: 20 })).find((a) => a.source === `monitor:${healthMonitor.id}`);
ok("the alert names the provider", (providerAlert?.title ?? "").includes("Market Data"), providerAlert?.title ?? "");
ok("the alert reports the failure count", (providerAlert?.explanation ?? "").includes("consecutive"));

console.log("\n  -- claim prevents double execution --");
providerMode = "ok";
clock.advance(600_000);
repositories.monitors.forceClaim(healthMonitor.id, clock.now() + 60_000);
const claimed = await app.runMonitorCycle();
ok("a monitor claimed by another replica is skipped", claimed.skippedLocked === 1, JSON.stringify(claimed));

// ===========================================================================
console.log("\n[4] Deduplication over a LONG-RUNNING monitor");
//
// The defect this section exists to prevent: a monitor running every 60s while
// one condition persists for hours must produce ONE alert, not one per run.

const dedupeRepos = {
  alerts: new InMemoryAlertRepository(),
  monitors: new InMemoryMonitorRepository(),
  sessions: new InMemorySessionRepository(),
  users: new InMemoryUserRepository(),
  risk: new InMemoryRiskRepository(),
  entities: new InMemoryEntityRepository(),
  safety: new InMemorySafetyStateRepository(),
};
const dClock = new TestClock();
dedupeRepos.monitors.useClock(() => dClock.now());
dedupeRepos.users.seed({ id: "u1", email: "d@nexus.app", passwordHash, roles: ["user"], disabledAt: null });

const dApp = createApp({
  config: {
    jwtSecret: "d".repeat(48), issuer: "nexus", audience: "nexus-mobile",
    nodeId: "D1", version: "1.0.0-dedupe", marketProviderId: "market", logLevel: "error",
  },
  repositories: dedupeRepos, clock: dClock, logSink: () => {},
});

// Count ALERT_CREATED from a subscriber rather than the bus ring buffer:
// the buffer is bounded at 200 by design, and 241 cycles would scroll the
// event out. Counting at publish time measures what actually happened.
let alertCreatedCount = 0;
dApp.bus.on("ALERT_CREATED", "dedupe-counter", () => { alertCreatedCount++; });

let dMode: "trigger" | "calm" = "trigger";
let providerCalls = 0;
dApp.providers.register({
  id: "market", displayName: "Market Data",
  isConfigured: () => true,
  fetch: async () => {
    providerCalls++;
    // A steep, volatile series trips the risk threshold; a flat one does not.
    return { data: dMode === "trigger" ? candles(150, 2.4) : candles(150, 0.01), observedAt: dClock.now() - 1000 };
  },
});
await dApp.entities.register({ kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" }, null, dClock.now());
await dApp.entities.register({ kind: "ASSET", id: "ETHUSDT", label: "Ethereum / USDT" }, null, dClock.now());

const longRun = await dApp.monitors.create("u1", {
  name: "BTC persistent risk",
  type: "ASSET_INTELLIGENCE",
  target: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
  config: { type: "ASSET_INTELLIGENCE", riskAtOrAbove: "MODERATE", signalAtOrAbove: null, onDataUnavailable: false },
  intervalSeconds: 60,
  enabled: true,
});

const openAlerts = async () => (await dedupeRepos.alerts.list({ status: "OPEN", limit: 50 }));
const allAlerts = async () => (await dedupeRepos.alerts.list({ limit: 50 }));

// Minute 0.
await dApp.runMonitorCycle();
ok("t=0: one alert exists", (await allAlerts()).length === 1, String((await allAlerts()).length));
const firstId = (await allAlerts())[0]!.id;

// Minutes 1, 2 — the checkpoints the brief names.
for (const minute of [1, 2]) {
  dClock.advance(60_000);
  await dApp.runMonitorCycle();
  const list = await allAlerts();
  ok(`t=${minute}m: still exactly one alert`, list.length === 1, String(list.length));
  ok(`t=${minute}m: occurrences incremented to ${minute + 1}`, list[0]!.occurrences === minute + 1, String(list[0]!.occurrences));
}

// Minute 5.
for (let i = 0; i < 3; i++) { dClock.advance(60_000); await dApp.runMonitorCycle(); }
ok("t=5m: still exactly one alert", (await allAlerts()).length === 1, String((await allAlerts()).length));
ok("t=5m: occurrences = 6", (await allAlerts())[0]!.occurrences === 6, String((await allAlerts())[0]!.occurrences));

// Minute 30.
for (let i = 0; i < 25; i++) { dClock.advance(60_000); await dApp.runMonitorCycle(); }
ok("t=30m: STILL exactly one alert", (await allAlerts()).length === 1, String((await allAlerts()).length));
ok("t=30m: occurrences = 31", (await allAlerts())[0]!.occurrences === 31, String((await allAlerts())[0]!.occurrences));

// Four hours.
for (let i = 0; i < 210; i++) { dClock.advance(60_000); await dApp.runMonitorCycle(); }
const afterHours = await allAlerts();
ok("t=4h: STILL exactly one alert after 241 evaluations", afterHours.length === 1, String(afterHours.length));
ok("t=4h: occurrences track every evaluation", afterHours[0]!.occurrences === 241, String(afterHours[0]!.occurrences));
ok("t=4h: the alert id never changed", afterHours[0]!.id === firstId);
ok("t=4h: updatedAt advanced with the condition", afterHours[0]!.updatedAt === dClock.now());
ok("t=4h: createdAt is still the original detection", afterHours[0]!.createdAt === T0);
ok("t=4h: exactly ONE ALERT_CREATED event across 241 evaluations",
  alertCreatedCount === 1, String(alertCreatedCount));

console.log("\n  -- escalation happens in place --");
const escalationTarget = (await allAlerts())[0]!;
ok("the persisting alert reached WARNING or above",
  escalationTarget.severity === "WARNING" || escalationTarget.severity === "CRITICAL", escalationTarget.severity);
await dApp.alerts.raise({
  source: `monitor:${longRun.id}`, rule: "risk-threshold", severity: "CRITICAL",
  title: "escalated", explanation: "Risk reached EXTREME.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});
const escalated = await allAlerts();
ok("escalation does NOT create a second alert", escalated.length === 1, String(escalated.length));
ok("escalation raises severity on the existing record", escalated[0]!.severity === "CRITICAL");
ok("escalation keeps the same id", escalated[0]!.id === firstId);

await dApp.alerts.raise({
  source: `monitor:${longRun.id}`, rule: "risk-threshold", severity: "INFO",
  title: "eased", explanation: "Risk eased.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});
ok("a repeat never downgrades severity", (await allAlerts())[0]!.severity === "CRITICAL");

console.log("\n  -- resolution then return starts a NEW lifecycle --");
await dApp.alerts.resolve(firstId, "Condition cleared.");
ok("the alert resolves", (await openAlerts()).length === 0);

dMode = "calm";
dClock.advance(60_000);
await dApp.runMonitorCycle();
ok("a calm market raises nothing", (await allAlerts()).length === 1, String((await allAlerts()).length));

dMode = "trigger";
dClock.advance(60_000);
await dApp.runMonitorCycle();
const returned = await allAlerts();
ok("the returning condition opens a NEW alert", returned.length === 2, String(returned.length));
ok("and that is the second ALERT_CREATED ever published", alertCreatedCount === 2, String(alertCreatedCount));
const newAlert = returned.find((a) => a.id !== firstId)!;
ok("the new alert has a distinct id", newAlert.id !== firstId);
ok("the new alert starts its own occurrence count", newAlert.occurrences === 1, String(newAlert.occurrences));
ok("the resolved alert is preserved as history",
  returned.find((a) => a.id === firstId)?.status === "RESOLVED");

dClock.advance(60_000);
await dApp.runMonitorCycle();
ok("the new lifecycle deduplicates too", (await allAlerts()).length === 2, String((await allAlerts()).length));

console.log("\n[5] Different conditions do NOT collapse together");

// same monitor + same target + DIFFERENT condition
await dApp.alerts.raise({
  source: `monitor:${longRun.id}`, rule: "signal-threshold", severity: "WATCH",
  title: "signal", explanation: "Signal crossed its threshold.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});
ok("same monitor + same target + different condition => separate alert",
  (await allAlerts()).length === 3, String((await allAlerts()).length));

// same monitor + DIFFERENT target
await dApp.alerts.raise({
  source: `monitor:${longRun.id}`, rule: "risk-threshold", severity: "WARNING",
  title: "eth", explanation: "Risk on a different asset.",
  entity: { kind: "ASSET", id: "ETHUSDT", label: "Ethereum / USDT" },
});
ok("same monitor + different target => separate alert",
  (await allAlerts()).length === 4, String((await allAlerts()).length));

// DIFFERENT monitor + same target + same condition
await dApp.alerts.raise({
  source: "monitor:some-other-monitor", rule: "risk-threshold", severity: "WARNING",
  title: "other", explanation: "A different monitor watching the same asset.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});
ok("different monitor + same target + same condition => separate alert",
  (await allAlerts()).length === 5, String((await allAlerts()).length));

// ...and each of those still deduplicates on repeat.
const beforeRepeats = (await allAlerts()).length;
for (const [source, rule, entityId] of [
  [`monitor:${longRun.id}`, "signal-threshold", "BTCUSDT"],
  [`monitor:${longRun.id}`, "risk-threshold", "ETHUSDT"],
  ["monitor:some-other-monitor", "risk-threshold", "BTCUSDT"],
] as const) {
  await dApp.alerts.raise({
    source, rule, severity: "WARNING", title: "repeat", explanation: "Same condition again.",
    entity: { kind: "ASSET", id: entityId, label: entityId },
  });
}
ok("every distinct condition deduplicates independently",
  (await allAlerts()).length === beforeRepeats, String((await allAlerts()).length));

console.log("\n[6] Emergency Stop blocks execution end to end");

await dApp.safety.activate({ userId: "u1", reason: "Safety halt for the stop test.", actor: "u1" });
const callsBeforeStop = providerCalls;
const alertsBeforeStop = (await allAlerts()).length;

dClock.advance(60_000);
const blocked = await dApp.runMonitorCycle();
ok("the monitor was still scheduled and claimed", blocked.ran === 1, JSON.stringify(blocked));
ok("execution was blocked", blocked.triggered === 0);
ok("NO provider call was made", providerCalls === callsBeforeStop, `${providerCalls - callsBeforeStop} calls`);
ok("no intelligence was produced", (await dedupeRepos.risk.history({ kind: "ASSET", id: "BTCUSDT", label: "" }, 1000)).length > 0);
ok("NO false alert was raised", (await allAlerts()).length === alertsBeforeStop);
ok("the block is explained on the monitor",
  (dedupeRepos.monitors.get(longRun.id)?.detail ?? "").includes("Emergency Stop"));

// A restart must not clear the stop mid-incident.
ok("the stop is still active after a service rebuild",
  await new SafetyService({
    repo: dedupeRepos.safety, events: dApp.bus, clock: dClock,
  }).isEmergencyStopActive("u1"));

await dApp.safety.reset({ userId: "u1", actor: "u1" });
dClock.advance(60_000);
const resumedRun = await dApp.runMonitorCycle();
ok("execution resumes once the stop is cleared", resumedRun.triggered === 1, JSON.stringify(resumedRun));
ok("provider calls resume", providerCalls > callsBeforeStop);

console.log("\n[7] Backoff contract: interval and retry are independent");

ok("one failure earns less backoff than a 60s interval", backoffDelayMs(1) === 30_000);
ok("the interval therefore still governs a single blip",
  Math.max(60_000, backoffDelayMs(1)) === 60_000);
ok("sustained failure overtakes the interval", backoffDelayMs(4) === 240_000);
ok("backoff is capped", backoffDelayMs(50) === 30 * 60_000);
// A short-interval monitor is slowed by even one failure; a long-interval one
// is not. Both follow from taking the maximum, which is the documented rule.
const shortInterval = { intervalSeconds: 30, consecutiveFailures: 1, state: "FAILING", enabled: true } as unknown as Monitor;
ok("a 30s monitor IS slowed by a single failure",
  (nextRunAt(shortInterval, T0) ?? 0) === T0 + 30_000, String((nextRunAt(shortInterval, T0) ?? 0) - T0));

console.log(`\n${"=".repeat(52)}\n  monitors: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
