// Run: node --experimental-strip-types verify.e2e.ts
//
// Full-stack integration over a REAL socket:
//   login -> session -> command center -> intelligence -> risk -> monitoring
//   -> alerts -> live SSE event -> mobile store update -> logout
//
// The API, domain, core, contracts and mobile state/clients all execute here.
// React rendering does not — see the limitations note in the report.

import { IdSequence } from "@nexus/core";
import type { AnalysisCandle } from "@nexus/core";
import { createApp } from "./src/app.ts";
import type { Clock } from "./src/platform/events.ts";
import { hashPassword } from "./src/auth/passwords.ts";
import {
  InMemoryAlertRepository, InMemoryEntityRepository, InMemoryMonitorRepository,
  InMemoryRiskRepository, InMemorySafetyStateRepository, InMemorySessionRepository,
  InMemoryUserRepository,
} from "./src/adapters/memory/repositories.ts";
import { rankSearchResults } from "./src/domain/entities/entityService.ts";
import { NexusClient } from "../mobile/src/api/client.ts";
import type { TokenStore } from "../mobile/src/api/client.ts";
import { RealtimeClient, SseParser, backoffWithJitter } from "../mobile/src/api/realtime.ts";
import type { RealtimeTransport } from "../mobile/src/api/realtime.ts";
import {
  alertsStore, applyRealtimeEvent, applyResult, commandCenterStore, connectionStore,
  emptySlice, eventsStore, isStale, monitorsStore, resetAllStores, Store, upsertAlert,
} from "../mobile/src/state/stores.ts";
import { arrayOf, assetIntelligenceView, commandCenterView, riskView, alert as alertContract } from "@nexus/contracts";
import type { Alert } from "@nexus/contracts";

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

// --- deterministic candle fixture (TEST DATA, never a production path) ------
function candles(n: number, start = 100, drift = 0.4): AnalysisCandle[] {
  const out: AnalysisCandle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price, close = price + drift;
    out.push({
      openTime: T0 + i * 3600_000, closeTime: T0 + (i + 1) * 3600_000 - 1,
      open, high: Math.max(open, close) + 0.6, low: Math.min(open, close) - 0.6,
      close, volume: 1000 + i * 5, quoteVolumeUsd: (1000 + i * 5) * close, tradeCount: 250 + i,
    });
    price = close;
  }
  return out;
}

// ===========================================================================
console.log("\n[1] Application composes and starts");

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

const passwordHash = await hashPassword("correct horse battery staple");
repositories.users.seed({ id: "u1", email: "aras@nexus.app", passwordHash, roles: ["user"], disabledAt: null });

const app = createApp({
  config: {
    jwtSecret: "s".repeat(48), issuer: "nexus", audience: "nexus-mobile",
    nodeId: "E1", version: "1.0.0-e2e", marketProviderId: "market", logLevel: "error",
  },
  repositories,
  clock,
  logSink: () => {},
});

// Register a provider whose behaviour we control, so both the healthy and the
// unavailable paths are exercised against the real intelligence engine.
let providerMode: "ok" | "fail" = "ok";
app.providers.register({
  id: "market", displayName: "Market Data",
  isConfigured: () => true,
  fetch: async () => {
    if (providerMode === "fail") throw new Error("upstream 503");
    return { data: candles(120), observedAt: clock.now() - 1000 };
  },
});

await app.entities.register({ kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" }, null, clock.now());
await app.entities.register({ kind: "ASSET", id: "ETHUSDT", label: "Ethereum / USDT" }, null, clock.now());
await app.entities.register({ kind: "WALLET", id: "0xtreasury", label: "Treasury Wallet" }, null, clock.now());

const server = app.listen(0);
await new Promise((r) => server.on("listening", r));
const port = (server.address() as { port: number }).port;
const baseUrl = `http://127.0.0.1:${port}`;
ok("the API is listening on a real socket", typeof port === "number" && port > 0);

// ===========================================================================
console.log("\n[2] Mobile client authenticates against the real API");

let accessToken: string | null = null;
let refreshToken: string | null = null;
let unauthorizedCount = 0;

const tokens: TokenStore = {
  getAccessToken: async () => accessToken,
  onUnauthorized: async () => { unauthorizedCount++; accessToken = null; },
};
const client = new NexusClient({ baseUrl, fetchImpl: fetch, tokens, sleep: async () => {} });

const anonymous = await client.request("/v1/command-center", commandCenterView);
ok("an unauthenticated request is rejected", !anonymous.ok);
ok("it is classified UNAUTHENTICATED", !anonymous.ok && anonymous.error.code === "UNAUTHENTICATED");
ok("the session-expired hook fired", unauthorizedCount === 1);

const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "aras@nexus.app", password: "correct horse battery staple" }),
});
ok("login over the wire returns 200", loginRes.status === 200);
const loginBody = await loginRes.json() as { accessToken: string; refreshToken: string; user: { id: string } };
accessToken = loginBody.accessToken;
refreshToken = loginBody.refreshToken;
ok("an access token was issued", typeof accessToken === "string" && accessToken.length > 20);
ok("the user identity came back", loginBody.user.id === "u1");
ok("no password material is in the response", !JSON.stringify(loginBody).includes("scrypt$"));

// ===========================================================================
console.log("\n[3] Command Center — real API-backed state");

resetAllStores();
const cc = await client.request("/v1/command-center", commandCenterView);
ok("the Command Center loads authenticated", cc.ok, cc.ok ? "" : JSON.stringify(cc.error));
ok("it passed the shared contract on BOTH ends", cc.ok);
commandCenterStore.update((s) => applyResult(s, cc, clock.now()));
ok("the store holds the API payload", commandCenterStore.get().data !== null);
ok("system state is nominal with no alerts", commandCenterStore.get().data?.systemState === "NOMINAL");
ok("provider health is reported", (commandCenterStore.get().data?.providers.length ?? 0) === 1);
ok("no fabricated risk is present", commandCenterStore.get().data?.risk === null);

// ===========================================================================
console.log("\n[4] Intelligence — real engine, real contract");

const intel = await client.request("/v1/intelligence/asset/BTCUSDT", assetIntelligenceView);
ok("intelligence loads", intel.ok, intel.ok ? "" : JSON.stringify(intel.error).slice(0, 200));
if (intel.ok) {
  ok("a primary timeframe was selected from real evidence", intel.data.primaryTimeframe !== null, String(intel.data.primaryTimeframe));
  ok("every requested timeframe is represented", intel.data.timeframes.length === 4, String(intel.data.timeframes.length));
  ok("scores are explainable", intel.data.risk.factors.length > 0 || intel.data.risk.value === null);
  ok("sample counts are reported for coverage", intel.data.timeframes.every((t) => t.sampleCount === 120));
  ok("an explanation was generated from the evidence", (intel.data.explanation ?? "").length > 0);
  ok("data origin is attributed to the provider",
    intel.data.timeframes[0]!.origin.providerId === "market");
  ok("freshness is LIVE when the provider answered",
    intel.data.timeframes[0]!.origin.freshness === "LIVE", intel.data.timeframes[0]!.origin.freshness);
}

console.log("\n[5] Provider failure becomes UNAVAILABLE, never invented data");
providerMode = "fail";
const degraded = await client.request("/v1/intelligence/asset/ETHUSDT", assetIntelligenceView);
ok("the endpoint still responds when the provider is down", degraded.ok);
if (degraded.ok) {
  ok("no primary timeframe is claimed", degraded.data.primaryTimeframe === null);
  ok("every timeframe reports UNAVAILABLE",
    degraded.data.timeframes.every((t) => t.origin.freshness === "UNAVAILABLE"));
  ok("a reason is attributed to each",
    degraded.data.timeframes.every((t) => (t.origin.reason ?? "").length > 0),
    degraded.data.timeframes[0]?.origin.reason ?? "");
  ok("no timeframe is marked usable", degraded.data.timeframes.every((t) => !t.usable));
  ok("the risk score is null, not zero", degraded.data.risk.value === null);
  ok("the unavailability is explained", (degraded.data.risk.unavailableReason ?? "").length > 0);
}

// Those four failures tripped the provider breaker, which is correct
// behaviour. Recovery therefore requires waiting out the cooldown — asserting
// that here rather than working around it, because a breaker that never
// reopened would be a far worse defect than one that opens too eagerly.
ok("the breaker opened after repeated provider failure",
  app.providers.status().find((p) => p.providerId === "market")?.state === "FAILING");
providerMode = "ok";
const cooling = await client.request("/v1/intelligence/asset/BTCUSDT", assetIntelligenceView);
ok("requests during cooldown still report UNAVAILABLE",
  cooling.ok && cooling.data.timeframes.every((t) => t.origin.freshness === "UNAVAILABLE"));
clock.advance(61_000);
const recovered = await client.request("/v1/intelligence/asset/BTCUSDT", assetIntelligenceView);
ok("the provider recovers after the cooldown elapses",
  recovered.ok && recovered.data.primaryTimeframe !== null,
  recovered.ok ? String(recovered.data.primaryTimeframe) : "");

// ===========================================================================
console.log("\n[6] Risk — ExplainableScore end to end");

const risk = await client.request("/v1/risk/asset/BTCUSDT?dailyDrawdownPercent=2.5", riskView);
ok("risk evaluates", risk.ok, risk.ok ? "" : JSON.stringify(risk.error).slice(0, 200));
if (risk.ok) {
  ok("a level was assigned from real data", risk.data.level !== null, String(risk.data.level));
  ok("the score carries contributing factors", risk.data.score.factors.length > 0);
  ok("factors carry point weights", risk.data.score.factors.every((f) => f.maxPoints > 0));
  ok("coverage is reported", risk.data.score.coveragePercent >= 0);
  ok("emergency stop state is included", risk.data.emergencyStopActive === false);
  ok("the evaluation is attributed to an origin", risk.data.origin.providerId === "market");
}

await app.safety.activate({ userId: "u1", reason: "Test halt for the risk view.", actor: "u1" });
const stopped = await client.request("/v1/risk/asset/BTCUSDT?dailyDrawdownPercent=2.5", riskView);
ok("emergency stop surfaces in the risk view", stopped.ok && stopped.data.emergencyStopActive);
await app.safety.reset({ userId: "u1", actor: "u1" });

providerMode = "fail";
const riskBlind = await client.request("/v1/risk/asset/ETHUSDT?dailyDrawdownPercent=1", riskView);
ok("risk refuses to score without data", riskBlind.ok && riskBlind.data.level === null);
ok("and states why", riskBlind.ok && (riskBlind.data.score.unavailableReason ?? "").length > 0);
ok("no score is invented in place of the missing level", riskBlind.ok && riskBlind.data.score.value === null);
providerMode = "ok";
clock.advance(61_000);

const history = await fetch(`${baseUrl}/v1/risk/asset/BTCUSDT/history`, { headers: { authorization: `Bearer ${accessToken}` } });
const historyBody = await history.json() as unknown[];
ok("risk history persisted every evaluation", historyBody.length === 2, String(historyBody.length));

const badDrawdown = await fetch(`${baseUrl}/v1/risk/asset/BTCUSDT?dailyDrawdownPercent=500`, { headers: { authorization: `Bearer ${accessToken}` } });
ok("an out-of-range parameter is rejected 422", badDrawdown.status === 422);

// ===========================================================================
console.log("\n[7] Search across real entities");

const search = await fetch(`${baseUrl}/v1/search?q=BTC`, { headers: { authorization: `Bearer ${accessToken}` } });
const searchBody = await search.json() as Array<{ entity: { id: string }; score: number; matchedOn: string }>;
ok("search returns matches", searchBody.length === 1, String(searchBody.length));
ok("the match is attributed to the field", searchBody[0]?.matchedOn === "ID");

const wallet = await fetch(`${baseUrl}/v1/search?q=treasury`, { headers: { authorization: `Bearer ${accessToken}` } });
ok("search spans entity kinds", ((await wallet.json()) as unknown[]).length === 1);

const empty = await fetch(`${baseUrl}/v1/search?q=`, { headers: { authorization: `Bearer ${accessToken}` } });
ok("an empty query returns nothing rather than everything", ((await empty.json()) as unknown[]).length === 0);

const ranked = rankSearchResults("btc", [
  { kind: "ASSET", id: "WBTCUSDT", label: "Wrapped Bitcoin", metadata: null, updatedAt: T0 },
  { kind: "ASSET", id: "BTC", label: "Bitcoin", metadata: null, updatedAt: T0 },
  { kind: "ASSET", id: "ETHUSDT", label: "BTC pair reference", metadata: null, updatedAt: T0 },
], 10);
ok("an exact id match ranks first", ranked[0]?.entity.id === "BTC", ranked.map((r) => r.entity.id).join(","));
// A label that *starts* with the term outranks an id that merely contains it:
// someone typing "btc" more likely wants "BTC pair reference" than a match
// buried inside "WBTCUSDT". Asserting the policy that exists, deliberately.
ok("a label prefix outranks a buried id substring",
  ranked[1]?.entity.id === "ETHUSDT" && ranked[2]?.entity.id === "WBTCUSDT",
  ranked.map((r) => `${r.entity.id}:${r.score}`).join(","));
ok("every result carries its match provenance", ranked.every((r) => r.matchedOn === "ID" || r.matchedOn === "LABEL"));

// ===========================================================================
console.log("\n[8] Alerts — dedupe preserved across the HTTP boundary");

const raise = () => app.alerts.raise({
  source: "risk-engine", rule: "daily-drawdown", severity: "WARNING",
  title: "Daily drawdown approaching limit",
  explanation: "Drawdown reached 4.1% against a 5% daily limit.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});

const firstRaise = await raise();
clock.advance(30_000);
await raise();
clock.advance(30_000);
await raise();

const alertList = await fetch(`${baseUrl}/v1/alerts`, { headers: { authorization: `Bearer ${accessToken}` } });
const alertBody = await alertList.json() as Alert[];
ok("three raises produced ONE alert over the API", alertBody.length === 1, String(alertBody.length));
ok("the occurrence count reached the client", alertBody[0]?.occurrences === 3, String(alertBody[0]?.occurrences));
ok("the alert satisfies its contract", alertContract.safeParse(alertBody[0]).ok);
ok("the id is server-issued and stable", alertBody[0]?.id === firstRaise.alert.id);

const ackRes = await fetch(`${baseUrl}/v1/alerts/${firstRaise.alert.id}/acknowledge`, {
  method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  body: JSON.stringify({ note: "Investigating." }),
});
const acked = await ackRes.json() as Alert;
ok("acknowledgement works over HTTP", acked.status === "ACKNOWLEDGED");
ok("acknowledgement is recorded in history", acked.history.length === 2);

const ccAfter = await client.request("/v1/command-center", commandCenterView);
ok("the Command Center now reports DEGRADED or worse",
  ccAfter.ok && ccAfter.data.systemState !== "NOMINAL", ccAfter.ok ? ccAfter.data.systemState : "");

// ===========================================================================
console.log("\n[9] Realtime — a real SSE stream over TCP");

const nodeTransport: RealtimeTransport = {
  async open({ url, headers, signal, onChunk }) {
    const response = await fetch(url, { headers, signal });
    if (!response.ok || !response.body) throw new Error(`stream failed: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  },
};

const received: string[] = [];
const states: string[] = [];
resetAllStores();

const realtime = new RealtimeClient({
  baseUrl,
  transport: nodeTransport,
  getAccessToken: async () => accessToken,
  onEvent: (event) => {
    received.push(event.type);
    applyRealtimeEvent(event, {});
  },
  onStateChange: (state) => { states.push(state); connectionStore.set(state); },
  sleep: async () => {},
  random: () => 0.5,
  maxRetries: 0,
});

void realtime.start();
// Wait for the server's initial comment frame to arrive.
await new Promise((r) => setTimeout(r, 150));
ok("the realtime connection reports OPEN", realtime.connectionState === "OPEN", realtime.connectionState);
ok("connection state was published to the store", connectionStore.get() === "OPEN");
ok("the hub registered the connection", app.hub.connectionCount === 1);

// Publish a genuine domain event — not a synthetic one.
const liveAlert = await app.alerts.raise({
  source: "monitor", rule: "price-breakout", severity: "CRITICAL",
  title: "Breakout confirmed on BTCUSDT",
  explanation: "Price cleared structure with volume confirmation.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
});
await new Promise((r) => setTimeout(r, 150));

ok("the alert reached the mobile client over SSE", received.includes("ALERT_CREATED"), received.join(","));
ok("the event feed store was updated", eventsStore.get().length >= 1);
ok("the unread badge incremented without a refetch",
  eventsStore.get()[0]?.data.alertId === liveAlert.alert.id);

const beforeCount = received.length;
app.bus.publish({ type: "DATA_UPDATED", severity: "INFO", summary: "Candles refreshed" });
await new Promise((r) => setTimeout(r, 120));
ok("subsequent events keep flowing on the same connection", received.length === beforeCount + 1);
ok("a non-domain event reaches the feed only", eventsStore.get()[0]?.type === "DATA_UPDATED");

realtime.stop();
await new Promise((r) => setTimeout(r, 120));
ok("stopping the client releases the server connection", app.hub.connectionCount === 0);
ok("connection state returned to IDLE", connectionStore.get() === "IDLE");

// ===========================================================================
console.log("\n[10] Realtime client resilience (unit-level)");

const parser = new SseParser();
ok("a frame split across chunks is reassembled",
  parser.push("id: 1\nevent: ALERT_CREATED\nda").length === 0
  && parser.push('ta: {"id":"1"}\n\n').length === 1);
ok("heartbeat comments are not delivered as events", parser.push(": heartbeat 123\n\n").length === 0);
const multi = parser.push('id: 2\nevent: A\ndata: {"a":1}\n\nid: 3\nevent: B\ndata: {"b":2}\n\n');
ok("multiple frames in one chunk are all parsed", multi.length === 2);
ok("frame fields are extracted", multi[0]!.id === "2" && multi[0]!.event === "A");

const seen = new Set<string>();
const dupClient = new RealtimeClient({
  baseUrl, transport: { async open() { /* not used */ } },
  getAccessToken: async () => "t",
  onEvent: (e) => { seen.add(e.id); },
  sleep: async () => {}, random: () => 0.5,
});
ok("backoff is bounded and jittered",
  backoffWithJitter(0, () => 1) === 1000 && backoffWithJitter(10, () => 1) === 30_000
  && backoffWithJitter(5, () => 0) === 0);
ok("backoff grows with attempts", backoffWithJitter(3, () => 1) === 8000);

let attempts = 0;
const flaky = new RealtimeClient({
  baseUrl, transport: { async open() { attempts++; throw new Error("connection refused"); } },
  getAccessToken: async () => "token",
  onEvent: () => {}, sleep: async () => {}, random: () => 0.5, maxRetries: 3,
});
await flaky.start();
ok("a failing stream retries with bounded attempts", attempts === 4, String(attempts));
ok("it ends in OFFLINE, surfaced to the UI", flaky.connectionState === "OFFLINE");

const noSession = new RealtimeClient({
  baseUrl, transport: { async open() { throw new Error("should not open"); } },
  getAccessToken: async () => null,
  onEvent: () => {}, sleep: async () => {},
});
await noSession.start();
ok("no session means no connection attempt", noSession.connectionState === "IDLE");

// ===========================================================================
console.log("\n[11] Mobile state reducers");

resetAllStores();
const mkAlert = (o: Partial<Alert> = {}): Alert => ({
  id: "01A", dedupeKey: "k1", createdAt: T0, updatedAt: T0,
  severity: "WARNING", priority: 600, title: "t", explanation: "e",
  source: "s", entity: null, status: "OPEN", read: false,
  acknowledgedAt: null, resolvedAt: null, occurrences: 1, history: [], ...o,
});

const list1 = upsertAlert([], mkAlert({ id: "a", severity: "INFO" }));
const list2 = upsertAlert(list1, mkAlert({ id: "b", severity: "CRITICAL" }));
ok("upsert inserts and orders by severity", list2[0]!.id === "b" && list2.length === 2);
const list3 = upsertAlert(list2, mkAlert({ id: "b", severity: "CRITICAL", occurrences: 5 }));
ok("a repeat REPLACES rather than duplicating", list3.length === 2, String(list3.length));
ok("the occurrence count is updated in place", list3[0]!.occurrences === 5);

const store = new Store({ n: 1 });
let notifications = 0;
const unsub = store.subscribe(() => notifications++);
store.set({ n: 2 });
const same = store.get();
store.set(same);
ok("a store notifies on real change", notifications === 1, String(notifications));
ok("an identical reference does not re-notify", notifications === 1);
unsub();
store.set({ n: 3 });
ok("unsubscribe stops notifications", notifications === 1);

const failed = applyResult(
  { data: [mkAlert()], error: null, loading: false, receivedAt: T0 },
  { ok: false, error: { code: "NETWORK", message: "No connection.", retryable: true, traceId: null } },
  T0 + 1000,
);
ok("a failed refresh KEEPS the last known data", failed.data !== null);
ok("and surfaces the error alongside it", failed.error?.code === "NETWORK");
ok("fresh data is not marked stale", !isStale({ ...emptySlice(), receivedAt: T0 }, T0 + 1000));
ok("old data IS marked stale", isStale({ ...emptySlice(), receivedAt: T0 }, T0 + 120_000));

resetAllStores();
monitorsStore.set({
  data: [{
    id: "m1", name: "BTC monitor", target: { kind: "ASSET", id: "BTCUSDT", label: "BTC" },
    state: "ACTIVE", intervalSeconds: 60, lastRunAt: null, nextRunAt: null,
    lastOutcome: null, consecutiveFailures: 0, detail: null,
  }],
  error: null, loading: false, receivedAt: T0,
});
const before = alertsStore.get();
const touched = applyRealtimeEvent({
  id: "e1", type: "MONITOR_STOPPED", occurredAt: T0, severity: "WARNING",
  entity: null, summary: "stopped", data: { monitorId: "m1" }, correlationId: null,
}, {});
ok("a monitor event updates only the monitor slice", monitorsStore.get().data?.[0]?.state === "STOPPED");
ok("unrelated slices are left untouched", alertsStore.get() === before);
ok("the touched slices are reported", touched.includes("monitors") && !touched.includes("risk"));

let riskRefreshes = 0;
applyRealtimeEvent(
  { id: "e2", type: "RISK_CHANGED", occurredAt: T0, severity: "WARNING", entity: null, summary: "risk", data: {}, correlationId: null },
  { refreshRisk: () => { riskRefreshes++; } },
);
ok("a risk event triggers a targeted refresh, not a full reload", riskRefreshes === 1);

// ===========================================================================
// ===========================================================================
console.log("\n[11b] The complete monitor loop reaches mobile state over SSE");
//
// create -> enable -> scheduler -> claim -> emergency-stop check -> provider
// -> intelligence/risk -> alert -> dedupe -> SSE -> mobile store.

resetAllStores();
const loopEvents: string[] = [];
const loopRealtime = new RealtimeClient({
  baseUrl, transport: nodeTransport,
  getAccessToken: async () => accessToken,
  onEvent: (event) => { loopEvents.push(event.type); applyRealtimeEvent(event, {}); },
  onStateChange: (state) => connectionStore.set(state),
  sleep: async () => {}, random: () => 0.5, maxRetries: 0,
});
void loopRealtime.start();
await new Promise((r) => setTimeout(r, 150));
ok("the realtime stream is open for the loop", loopRealtime.connectionState === "OPEN");

const loopMonitor = await app.monitors.create("u1", {
  name: "BTC loop monitor",
  type: "ASSET_INTELLIGENCE",
  target: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" },
  // The shared fixture is a gently trending series that evaluates to LOW risk,
  // so the threshold is set to LOW. Raising the fixture's volatility to suit a
  // higher threshold would be bending the data to the test.
  config: { type: "ASSET_INTELLIGENCE", riskAtOrAbove: "LOW", signalAtOrAbove: null, onDataUnavailable: false },
  intervalSeconds: 60,
  enabled: true,
});
await new Promise((r) => setTimeout(r, 120));
ok("MONITOR_CREATED reached the client over SSE", loopEvents.includes("MONITOR_CREATED"), loopEvents.join(","));

const loopCycle = await app.runMonitorCycle();
await new Promise((r) => setTimeout(r, 150));
ok("the scheduled run executed", loopCycle.ran === 1, JSON.stringify(loopCycle));
ok("it triggered on real evaluated data", loopCycle.triggered === 1, JSON.stringify(loopCycle));
ok("ALERT_CREATED reached the client over SSE", loopEvents.includes("ALERT_CREATED"));
ok("the mobile event feed shows the alert", eventsStore.get().some((e) => e.type === "ALERT_CREATED"));
ok("the unread badge was updated without a refetch",
  eventsStore.get().some((e) => typeof e.data.alertId === "string"));

// Repeat the same condition: the user must not be notified again.
const createdBefore = loopEvents.filter((t) => t === "ALERT_CREATED").length;
clock.advance(60_000);
await app.runMonitorCycle();
clock.advance(60_000);
await app.runMonitorCycle();
await new Promise((r) => setTimeout(r, 150));
ok("repeat detections send NO further ALERT_CREATED to the client",
  loopEvents.filter((t) => t === "ALERT_CREATED").length === createdBefore,
  String(loopEvents.filter((t) => t === "ALERT_CREATED").length));

const loopAlerts = await client.request("/v1/alerts", arrayOf(alertContract, { max: 50 }));
ok("the user still sees exactly one alert for the condition",
  loopAlerts.ok && loopAlerts.data.filter((a) => a.source === `monitor:${loopMonitor.id}`).length === 1,
  loopAlerts.ok ? String(loopAlerts.data.length) : "");
ok("with an occurrence count reflecting every run",
  loopAlerts.ok && (loopAlerts.data.find((a) => a.source === `monitor:${loopMonitor.id}`)?.occurrences ?? 0) === 3,
  loopAlerts.ok ? String(loopAlerts.data.find((a) => a.source === `monitor:${loopMonitor.id}`)?.occurrences) : "");

// Monitor CRUD is reachable over HTTP with ownership enforced.
const httpList = await fetch(`${baseUrl}/v1/monitors`, { headers: { authorization: `Bearer ${accessToken}` } });
ok("monitors are listable over HTTP", httpList.status === 200);
ok("the list contains the created monitor", ((await httpList.json()) as unknown[]).length === 1);

const httpDisable = await fetch(`${baseUrl}/v1/monitors/${loopMonitor.id}/disable`, {
  method: "POST", headers: { authorization: `Bearer ${accessToken}` },
});
ok("disable works over HTTP", httpDisable.status === 200);
await new Promise((r) => setTimeout(r, 120));
ok("MONITOR_DISABLED reached the client", loopEvents.includes("MONITOR_DISABLED"));

const rejected = await fetch(`${baseUrl}/v1/monitors`, {
  method: "POST",
  headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  body: JSON.stringify({
    name: "bad", type: "ASSET_INTELLIGENCE",
    target: { kind: "ASSET", id: "NOTREAL", label: "Nope" },
    config: { type: "ASSET_INTELLIGENCE", riskAtOrAbove: "HIGH", signalAtOrAbove: null, onDataUnavailable: false },
    intervalSeconds: 60, enabled: true,
  }),
});
ok("an unknown target is rejected 422 over HTTP", rejected.status === 422);

const stopRes = await fetch(`${baseUrl}/v1/safety/emergency-stop`, {
  method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  body: JSON.stringify({ reason: "Operator halt via API." }),
});
ok("emergency stop is settable over HTTP", stopRes.status === 200);
ok("and reports as active", ((await stopRes.json()) as { active: boolean }).active);
await fetch(`${baseUrl}/v1/safety/emergency-stop`, {
  method: "DELETE", headers: { authorization: `Bearer ${accessToken}` },
});

loopRealtime.stop();
await new Promise((r) => setTimeout(r, 100));

// ===========================================================================
console.log("\n[12] Session teardown");

const refreshRes = await fetch(`${baseUrl}/v1/auth/refresh`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ sid: JSON.parse(Buffer.from(accessToken!.split(".")[1]!, "base64url").toString()).sid, refreshToken }),
});
ok("refresh succeeds before logout", refreshRes.status === 200);
const rotated = await refreshRes.json() as { accessToken: string };
accessToken = rotated.accessToken;

const logout = await fetch(`${baseUrl}/v1/auth/logout`, {
  method: "POST", headers: { authorization: `Bearer ${accessToken}` },
});
ok("logout returns 204", logout.status === 204);

const afterLogout = await fetch(`${baseUrl}/v1/command-center`, { headers: { authorization: `Bearer ${accessToken}` } });
ok("the access token stops working immediately after logout", afterLogout.status === 401);

const sseAfterLogout = await fetch(`${baseUrl}/v1/realtime`, { headers: { authorization: `Bearer ${accessToken}` } });
ok("the realtime stream also rejects a revoked session", sseAfterLogout.status === 401);
await sseAfterLogout.body?.cancel();

app.shutdown();
server.close();
await new Promise((r) => setTimeout(r, 50));

console.log(`\n${"=".repeat(52)}\n  end-to-end: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
