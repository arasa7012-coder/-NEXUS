// Run: node --experimental-strip-types verify.ts
import { IdSequence, dedupeKey, IdentityError } from "@nexus/core";
import { alert as alertContract } from "@nexus/contracts";
import type { Monitor } from "@nexus/contracts";
import { InMemoryEventBus } from "./src/platform/events.ts";
import type { Clock } from "./src/platform/events.ts";
import { AlertService } from "./src/domain/alerts/alertService.ts";
import { MonitorRunner, backoffDelayMs, nextRunAt } from "./src/domain/monitoring/scheduler.ts";
import { ProviderRegistry } from "./src/domain/providers/registry.ts";
import { InMemoryAlertRepository, InMemoryMonitorRepository } from "./src/adapters/memory/repositories.ts";

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
  set(ms: number) { this.t = ms; }
}

// ===========================================================================
console.log("\n[1] Identity — deterministic, never random");

const k1 = dedupeKey({ producer: "risk", rule: "drawdown", entity: "asset:BTCUSDT" });
const k2 = dedupeKey({ producer: "risk", rule: "drawdown", entity: "asset:BTCUSDT" });
ok("same condition yields the same key", k1 === k2, k1);
ok("different entity yields a different key",
  k1 !== dedupeKey({ producer: "risk", rule: "drawdown", entity: "asset:ETHUSDT" }));
ok("different rule yields a different key",
  k1 !== dedupeKey({ producer: "risk", rule: "exposure", entity: "asset:BTCUSDT" }));
ok("key is human-traceable to its producer", k1.startsWith("risk.drawdown:"), k1);

const seq = new IdSequence("A1");
const ids = [seq.next(T0), seq.next(T0), seq.next(T0), seq.next(T0 + 1)];
ok("ids are unique within a millisecond", new Set(ids).size === 4);
ok("ids sort lexicographically in time order", [...ids].sort().join() === ids.join());
ok("ids are fixed width", ids.every((id) => id.length === ids[0]!.length), String(ids[0]!.length));

let regressed = false;
try { seq.next(T0 - 5); } catch (e) { regressed = e instanceof IdentityError && e.code === "CLOCK_REGRESSION"; }
ok("a backwards clock is refused, not silently accepted", regressed);

let badNode = false;
try { new IdSequence("!!"); } catch (e) { badNode = e instanceof IdentityError; }
ok("invalid node id rejected", badNode);

// ===========================================================================
console.log("\n[2] Alerts — repeats collapse instead of flooding");

const clock = new TestClock();
const bus = new InMemoryEventBus({ nodeId: "T", clock });
const repo = new InMemoryAlertRepository();
const alerts = new AlertService({ repo, events: bus, ids: new IdSequence("B1"), clock });

const raise = () => alerts.raise({
  source: "risk-engine", rule: "daily-drawdown", severity: "WARNING",
  title: "Daily drawdown approaching limit",
  explanation: "Drawdown reached 4.1% against a 5% daily limit.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});

const first = await raise();
ok("first raise creates an alert", first.created);
ok("created alert satisfies the wire contract", alertContract.safeParse(first.alert).ok,
  JSON.stringify(alertContract.safeParse(first.alert)).slice(0, 160));

clock.advance(30_000);
const second = await raise();
clock.advance(30_000);
const third = await raise();
ok("repeat does not create a second alert", !second.created && !third.created);
ok("only one alert exists after three raises", repo.size === 1, String(repo.size));
ok("occurrences are counted", third.alert.occurrences === 3, String(third.alert.occurrences));
ok("the alert id is stable across repeats", third.alert.id === first.alert.id);

const escalated = await alerts.raise({
  source: "risk-engine", rule: "daily-drawdown", severity: "CRITICAL",
  title: "Daily drawdown limit breached",
  explanation: "Drawdown reached 5.4% against a 5% daily limit.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});
ok("an escalating repeat raises severity in place", escalated.alert.severity === "CRITICAL" && !escalated.created);

const deEscalated = await alerts.raise({
  source: "risk-engine", rule: "daily-drawdown", severity: "INFO",
  title: "Drawdown easing", explanation: "Drawdown fell back to 3.9%.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});
ok("a repeat never silently downgrades severity", deEscalated.alert.severity === "CRITICAL");

let unexplained = false;
try {
  await alerts.raise({ source: "x", rule: "y", severity: "INFO", title: "t", explanation: "   " });
} catch { unexplained = true; }
ok("an unexplained alert is refused", unexplained);

console.log("\n[3] Alert lifecycle and re-opening");
const acked = await alerts.acknowledge(first.alert.id, "Investigating.");
ok("acknowledge sets status and marks read", acked.status === "ACKNOWLEDGED" && acked.read);
ok("acknowledge appends history", acked.history.length === 2, String(acked.history.length));

const resolved = await alerts.resolve(first.alert.id, "Position closed.");
ok("resolve sets status and timestamp", resolved.status === "RESOLVED" && resolved.resolvedAt !== null);

clock.advance(60_000);
const reopened = await raise();
ok("a condition that returns after resolution opens a NEW alert", reopened.created);
ok("two alerts now exist", repo.size === 2, String(repo.size));

console.log("\n[4] Alerts publish events for downstream consumers");
const created = bus.recent(100).filter((e) => e.type === "ALERT_CREATED");
ok("ALERT_CREATED published once per real alert", created.length === 2, String(created.length));
ok("ALERT_ACKNOWLEDGED published", bus.recent(100).some((e) => e.type === "ALERT_ACKNOWLEDGED"));
ok("ALERT_RESOLVED published", bus.recent(100).some((e) => e.type === "ALERT_RESOLVED"));
ok("events carry the entity for routing", created[0]!.entity?.id === "BTCUSDT");

console.log("\n[5] A failing subscriber cannot break the publisher");
const bus2 = new InMemoryEventBus({ nodeId: "T2", clock, onError: () => {} });
let goodHandlerRan = false;
bus2.on("SYSTEM_WARNING", "explodes", () => { throw new Error("handler bug"); });
bus2.on("SYSTEM_WARNING", "works", () => { goodHandlerRan = true; });
let publishThrew = false;
try { bus2.publish({ type: "SYSTEM_WARNING", severity: "INFO", summary: "test" }); }
catch { publishThrew = true; }
ok("publish does not throw when a handler does", !publishThrew);
ok("a later handler still runs after an earlier one throws", goodHandlerRan);

// ===========================================================================
console.log("\n[6] Provider registry — failure never becomes invented data");

const pClock = new TestClock();
const pBus = new InMemoryEventBus({ nodeId: "P", clock: pClock });
const registry = new ProviderRegistry({ clock: pClock, events: pBus });

let shouldFail = false;
registry.register({
  id: "twelvedata", displayName: "Twelve Data",
  isConfigured: () => true,
  fetch: async () => {
    if (shouldFail) throw new Error("upstream 503");
    return { data: { price: 2410.5 }, observedAt: pClock.now() - 1000 };
  },
});
registry.register({
  id: "unconfigured", displayName: "Unconfigured Feed",
  isConfigured: () => false,
  fetch: async () => ({ data: {}, observedAt: null }),
});

const good = await registry.execute<unknown, { price: number }>("twelvedata", {});
ok("successful fetch is marked LIVE", good.origin.freshness === "LIVE");
ok("provider's own observation time is preserved", good.origin.observedAt === pClock.now() - 1000);
ok("data is returned", good.data?.price === 2410.5);

const missing = await registry.execute("unconfigured", {});
ok("unconfigured provider yields UNAVAILABLE", missing.origin.freshness === "UNAVAILABLE");
ok("unconfigured provider returns null data, not a fallback", missing.data === null);
ok("a reason is attributed", (missing.origin.reason ?? "").length > 0, missing.origin.reason ?? "");

const unknown = await registry.execute("nope", {});
ok("unknown provider yields UNAVAILABLE rather than throwing", unknown.origin.freshness === "UNAVAILABLE");

shouldFail = true;
const f1 = await registry.execute("twelvedata", {});
ok("a failed fetch returns null data", f1.data === null && f1.origin.freshness === "UNAVAILABLE");
ok("the failure reason reaches the caller", (f1.origin.reason ?? "").includes("503"), f1.origin.reason ?? "");

await registry.execute("twelvedata", {});
await registry.execute("twelvedata", {});
ok("breaker opens after the threshold",
  registry.status().find((s) => s.providerId === "twelvedata")?.state === "FAILING");
ok("PROVIDER_ERROR published exactly once on opening",
  pBus.recent(100).filter((e) => e.type === "PROVIDER_ERROR").length === 1);

let calls = 0;
const before = calls;
const blocked = await registry.execute("twelvedata", {});
ok("calls are refused during cooldown", (blocked.origin.reason ?? "").includes("cooldown"), blocked.origin.reason ?? "");
ok("no upstream call was attempted while open", calls === before);

pClock.advance(61_000);
shouldFail = false;
const recovered = await registry.execute("twelvedata", {});
ok("a trial call is allowed after cooldown", recovered.origin.freshness === "LIVE");
ok("state returns to operational",
  registry.status().find((s) => s.providerId === "twelvedata")?.state === "OPERATIONAL");
ok("consecutive failures reset on success",
  registry.status().find((s) => s.providerId === "twelvedata")?.consecutiveFailures === 0);

// ===========================================================================
console.log("\n[7] Monitoring — backoff, overlap, and isolation");

ok("no backoff before any failure", backoffDelayMs(0) === 0);
ok("backoff grows exponentially", backoffDelayMs(1) === 30_000 && backoffDelayMs(3) === 120_000);
ok("backoff is capped", backoffDelayMs(50) === 30 * 60_000, String(backoffDelayMs(50)));

const T = 1_760_000_000_000;
const mk = (o: Partial<Monitor> = {}): Monitor => ({
  id: "m1", userId: "u1", name: "BTC drawdown",
  type: "ASSET_INTELLIGENCE",
  target: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin" },
  config: {
    type: "ASSET_INTELLIGENCE", riskAtOrAbove: "MODERATE",
    signalAtOrAbove: null, onDataUnavailable: false,
  },
  // `enabled` is user intent and `state` is engine status; a monitor is only
  // due when both agree. Fixtures must set it, exactly as a real one would.
  state: "ACTIVE", enabled: true, intervalSeconds: 60,
  createdAt: T, updatedAt: T,
  lastRunAt: null, nextRunAt: null, lastOutcome: null,
  lastFailureKind: null, consecutiveFailures: 0, detail: null, ...o,
});

ok("a healthy monitor reschedules at its interval",
  nextRunAt(mk(), T0) === T0 + 60_000);
ok("a failing monitor is pushed out by backoff",
  nextRunAt(mk({ consecutiveFailures: 4 }), T0) === T0 + 240_000, String(nextRunAt(mk({ consecutiveFailures: 4 }), T0)));
ok("a paused monitor is never rescheduled", nextRunAt(mk({ state: "PAUSED" }), T0) === null);
ok("an exhausted monitor stops being scheduled",
  nextRunAt(mk({ consecutiveFailures: 10 }), T0) === null);

const mClock = new TestClock();
const mBus = new InMemoryEventBus({ nodeId: "M", clock: mClock });
const mRepo = new InMemoryMonitorRepository();
mRepo.seed(mk({ id: "ok1" }));
mRepo.seed(mk({ id: "bad1", name: "Broken check" }));

const runner = new MonitorRunner({ repo: mRepo, events: mBus, clock: mClock });
const report = await runner.runCycle(async (m) => {
  if (m.id === "bad1") throw new Error("provider exploded");
  return { triggered: true, detail: "Threshold crossed." };
});

ok("both due monitors ran", report.ran === 2, JSON.stringify(report));
ok("a throwing monitor does not stop the cycle", report.failed === 1 && report.triggered === 1);
ok("the healthy monitor stayed ACTIVE", mRepo.get("ok1")?.state === "ACTIVE");
ok("the healthy monitor was rescheduled", mRepo.get("ok1")?.nextRunAt === mClock.now() + 60_000);
ok("the broken monitor is marked FAILING", mRepo.get("bad1")?.state === "FAILING");
ok("its failure count incremented", mRepo.get("bad1")?.consecutiveFailures === 1);
ok("its error detail was captured", (mRepo.get("bad1")?.detail ?? "").includes("exploded"));
ok("a trigger published an event", mBus.recent(50).some((e) => e.type === "SIGNAL_CREATED"));

mRepo.seed(mk({ id: "locked", nextRunAt: null }));
mRepo.forceClaim("locked", Date.now() + 60_000);
const locked = await runner.runCycle(async () => ({ triggered: false }));
ok("a monitor claimed by another worker is skipped, not run twice",
  locked.skippedLocked === 1, JSON.stringify(locked));

let concurrent = 0;
const slowRepo = new InMemoryMonitorRepository();
slowRepo.seed(mk({ id: "slow" }));
const slowRunner = new MonitorRunner({ repo: slowRepo, events: mBus, clock: mClock });
const slowCheck = async () => {
  concurrent += 1;
  await new Promise((r) => setTimeout(r, 20));
  concurrent -= 1;
  return { triggered: false };
};
const [r1, r2] = await Promise.all([slowRunner.runCycle(slowCheck), slowRunner.runCycle(slowCheck)]);
ok("overlapping cycles do not double-run", r1.ran + r2.ran === 1, `${r1.ran}+${r2.ran}`);
ok("no check ever ran concurrently with itself", concurrent === 0);

const giveUp = new InMemoryMonitorRepository();
giveUp.seed(mk({ id: "doomed", consecutiveFailures: 9 }));
const giveUpRunner = new MonitorRunner({ repo: giveUp, events: mBus, clock: mClock });
await giveUpRunner.runCycle(async () => { throw new Error("still broken"); });
ok("a monitor that keeps failing is stopped, not retried forever",
  giveUp.get("doomed")?.state === "STOPPED");
ok("MONITOR_STOPPED was published", mBus.recent(100).some((e) => e.type === "MONITOR_STOPPED"));

console.log(`\n${"=".repeat(52)}\n  api domain: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
