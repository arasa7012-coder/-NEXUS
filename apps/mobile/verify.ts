// Run: node --experimental-strip-types verify.ts
// Covers the dependency-free half of the mobile app: API client behaviour.
// UI rendering is NOT covered here — see the limitations note in the report.
import { NexusClient, classifyStatus, retryDelayMs, toNexusError } from "./src/api/client.ts";
import { commandCenterView, alert as alertContract } from "@nexus/contracts";
import type { TokenStore } from "./src/api/client.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
};

const tokens: TokenStore = {
  getAccessToken: async () => "test-token",
  onUnauthorized: async () => { unauthorizedCalls++; },
};
let unauthorizedCalls = 0;

const res = (status: number, body: unknown, okFlag = status < 400) => ({
  ok: okFlag, status,
  headers: { get: () => "trace-abc" },
  json: async () => body,
}) as unknown as Response;

const mkClient = (fetchImpl: typeof fetch, maxRetries = 2) =>
  new NexusClient({ baseUrl: "https://api.test/", fetchImpl, tokens, maxRetries, sleep: async () => {} });

console.log("\n[1] Status mapping is total and correct");
ok("401 -> UNAUTHENTICATED", classifyStatus(401) === "UNAUTHENTICATED");
ok("403 -> FORBIDDEN", classifyStatus(403) === "FORBIDDEN");
ok("429 -> RATE_LIMIT", classifyStatus(429) === "RATE_LIMIT");
ok("503 -> PROVIDER_UNAVAILABLE", classifyStatus(503) === "PROVIDER_UNAVAILABLE");
ok("500 -> INTERNAL", classifyStatus(500) === "INTERNAL");
ok("retryability derives from the shared contract",
  toNexusError("TIMEOUT").retryable && !toNexusError("FORBIDDEN").retryable);

console.log("\n[2] Backoff schedule is bounded");
ok("first retry waits 500ms", retryDelayMs(0) === 500);
ok("backoff doubles", retryDelayMs(1) === 1000 && retryDelayMs(2) === 2000);
ok("backoff is capped at 8s", retryDelayMs(20) === 8000);

console.log("\n[3] Valid responses are validated, not trusted");
const goodPayload = {
  generatedAt: 1_760_000_000_000, systemState: "NOMINAL",
  criticalAlerts: [], unreadAlertCount: 0, risk: null,
  monitors: [], providers: [], recentEvents: [],
};
const good = await mkClient(async () => res(200, goodPayload)).request("/command-center", commandCenterView);
ok("a contract-conforming response resolves", good.ok);
ok("parsed data is returned", good.ok && good.data.systemState === "NOMINAL");

console.log("\n[4] A server that breaks its own contract fails loudly");
const broken = await mkClient(async () => res(200, { generatedAt: "yesterday" })).request("/command-center", commandCenterView);
ok("malformed payload becomes a typed error, not a crash", !broken.ok);
ok("classified as VALIDATION", !broken.ok && broken.error.code === "VALIDATION");
ok("offending field paths are reported", !broken.ok && (broken.error.fields?.length ?? 0) > 0,
  !broken.ok ? JSON.stringify(broken.error.fields?.slice(0, 2)) : "");
ok("trace id is preserved for correlation", !broken.ok && broken.error.traceId === "trace-abc");

console.log("\n[5] Retry policy distinguishes worth-retrying from not");
let calls = 0;
const flaky = await mkClient(async () => {
  calls++;
  return calls < 3 ? res(503, {}) : res(200, goodPayload);
}).request("/command-center", commandCenterView);
ok("a transient 503 is retried to success", flaky.ok, `calls=${calls}`);
ok("it took exactly the failed attempts plus one", calls === 3, String(calls));

calls = 0;
const forbidden = await mkClient(async () => { calls++; return res(403, {}); }).request("/x", commandCenterView);
ok("a 403 is not retried", !forbidden.ok && calls === 1, `calls=${calls}`);

calls = 0;
const downhard = await mkClient(async () => { calls++; return res(503, {}); }).request("/x", commandCenterView);
ok("retries are bounded, not infinite", !downhard.ok && calls === 3, `calls=${calls}`);
ok("the final error reaches the caller", !downhard.ok && downhard.error.code === "PROVIDER_UNAVAILABLE");

console.log("\n[6] Auth and transport failures");
unauthorizedCalls = 0;
const unauth = await mkClient(async () => res(401, {})).request("/x", commandCenterView);
ok("401 triggers the session hook exactly once", unauthorizedCalls === 1, String(unauthorizedCalls));
ok("401 is not retried", !unauth.ok && unauth.error.code === "UNAUTHENTICATED");

const netdown = await mkClient(async () => { throw new Error("connection refused"); }).request("/x", commandCenterView);
ok("a transport failure maps to NETWORK", !netdown.ok && netdown.error.code === "NETWORK");
ok("the user-facing message contains no stack detail",
  !netdown.ok && !netdown.error.message.toLowerCase().includes("connection refused"), !netdown.ok ? netdown.error.message : "");

const aborted = await mkClient(async () => {
  const e = new Error("aborted"); e.name = "AbortError"; throw e;
}).request("/x", commandCenterView);
ok("an abort maps to TIMEOUT, not NETWORK", !aborted.ok && aborted.error.code === "TIMEOUT");

console.log("\n[7] Non-JSON error bodies do not break error handling");
const htmlError = await mkClient(async () => ({
  ok: false, status: 502,
  headers: { get: () => null },
  json: async () => { throw new Error("Unexpected token <"); },
}) as unknown as Response, 0).request("/x", commandCenterView);
ok("a gateway HTML body still yields a typed error",
  !htmlError.ok && htmlError.error.code === "PROVIDER_UNAVAILABLE");

console.log("\n[8] Monitor realtime reducers patch state without refetching");

const { applyRealtimeEvent, monitorsStore, emergencyStopStore, resetAllStores, eventsStore } =
  await import("./src/state/stores.ts");
const T = 1_760_000_000_000;

const mkMonitor = (o: Record<string, unknown> = {}) => ({
  id: "m1", userId: "u1", name: "BTC watch", type: "ASSET_INTELLIGENCE",
  target: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin" },
  config: { type: "ASSET_INTELLIGENCE", riskAtOrAbove: "HIGH", signalAtOrAbove: null, onDataUnavailable: false },
  state: "ACTIVE", enabled: true, intervalSeconds: 60,
  createdAt: T, updatedAt: T, lastRunAt: null, nextRunAt: null,
  lastOutcome: null, lastFailureKind: null, consecutiveFailures: 0, detail: null,
  ...o,
}) as never;

const evt = (type: string, data: Record<string, unknown> = {}) => ({
  id: `e-${type}`, type, occurredAt: T, severity: "INFO",
  entity: null, summary: type, data, correlationId: null,
}) as never;

const seed = () => {
  resetAllStores();
  monitorsStore.set({ data: [mkMonitor()], error: null, loading: false, receivedAt: T });
};

seed();
applyRealtimeEvent(evt("MONITOR_DISABLED", { monitorId: "m1" }));
ok("MONITOR_DISABLED flips enabled and pauses the row",
  monitorsStore.get().data?.[0]?.enabled === false && monitorsStore.get().data?.[0]?.state === "PAUSED");

applyRealtimeEvent(evt("MONITOR_ENABLED", { monitorId: "m1" }));
ok("MONITOR_ENABLED restores it", monitorsStore.get().data?.[0]?.enabled === true);

applyRealtimeEvent(evt("MONITOR_FAILED", { monitorId: "m1", failureKind: "RATE_LIMITED", detail: "cooldown" }));
const failed = monitorsStore.get().data?.[0];
ok("MONITOR_FAILED marks the row FAILING", failed?.state === "FAILING");
ok("the failure kind is surfaced to the user", failed?.lastFailureKind === "RATE_LIMITED");
ok("the detail is carried through", failed?.detail === "cooldown");
ok("fields the event does not establish are left alone", failed?.name === "BTC watch");

applyRealtimeEvent(evt("MONITOR_RECOVERED", { monitorId: "m1" }));
ok("MONITOR_RECOVERED clears the failure state",
  monitorsStore.get().data?.[0]?.state === "ACTIVE" && monitorsStore.get().data?.[0]?.lastFailureKind === null);

seed();
let monitorRefreshes = 0;
applyRealtimeEvent(evt("MONITOR_CREATED", { monitorId: "m2" }), { refreshMonitors: () => { monitorRefreshes++; } });
ok("MONITOR_CREATED triggers a targeted refetch, not a full reload", monitorRefreshes === 1);
ok("the existing row is untouched meanwhile", monitorsStore.get().data?.length === 1);

seed();
applyRealtimeEvent(evt("MONITOR_DELETED", { monitorId: "m1" }));
ok("MONITOR_DELETED removes the row locally", monitorsStore.get().data?.length === 0);

seed();
emergencyStopStore.set({
  data: { active: false, reason: null, activatedAt: null, resetAt: null, actor: null },
  error: null, loading: false, receivedAt: T,
});
applyRealtimeEvent(evt("EMERGENCY_STOP_ACTIVATED", {}));
ok("EMERGENCY_STOP_ACTIVATED reaches mobile state", emergencyStopStore.get().data?.active === true);
applyRealtimeEvent(evt("EMERGENCY_STOP_RESET", {}));
ok("EMERGENCY_STOP_RESET clears it", emergencyStopStore.get().data?.active === false);

seed();
const before = monitorsStore.get();
applyRealtimeEvent(evt("DATA_UPDATED", {}));
ok("an unrelated event does not disturb the monitor slice", monitorsStore.get() === before);
ok("but it still reaches the activity feed", eventsStore.get().length === 1);

console.log(`\n${"=".repeat(52)}\n  mobile client: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
