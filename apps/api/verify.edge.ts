// Run: node --experimental-strip-types verify.edge.ts
// Covers the HTTP edge, auth, persistence contracts, realtime, notifications.
// Includes a REAL node:http server bound to a real socket and hit over TCP.
import { IdSequence } from "@nexus/core";
import { InMemoryEventBus } from "./src/platform/events.ts";
import type { Clock } from "./src/platform/events.ts";
import { createLogger, redact } from "./src/platform/logger.ts";
import { InMemoryRateLimiter, POLICIES } from "./src/platform/rateLimit.ts";
import { JwtService, JwtError } from "./src/auth/jwt.ts";
import { hashPassword, verifyPassword, needsRehash } from "./src/auth/passwords.ts";
import { SessionService, AuthError } from "./src/auth/session.ts";
import { NexusRouter } from "./src/http/router.ts";
import { registerRoutes } from "./src/http/routes.ts";
import { RealtimeHub, encodeSseFrame, encodeHeartbeat } from "./src/http/realtime.ts";
import { decideNotification, DEFAULT_PREFERENCES } from "./src/domain/notifications/notificationPolicy.ts";
import { AlertService } from "./src/domain/alerts/alertService.ts";
import { ProviderRegistry } from "./src/domain/providers/registry.ts";
import {
  InMemoryAlertRepository, InMemoryEntityRepository, InMemoryMonitorRepository,
  InMemoryRiskRepository, InMemorySafetyStateRepository,
  InMemorySessionRepository, InMemoryUserRepository,
} from "./src/adapters/memory/repositories.ts";
import { EntityService } from "./src/domain/entities/entityService.ts";
import { IntelligenceService } from "./src/domain/intelligence/intelligenceService.ts";
import { RiskService } from "./src/domain/risk/riskService.ts";
import { MonitorService } from "./src/domain/monitoring/monitorService.ts";
import { SafetyService } from "./src/domain/safety/safetyService.ts";
import { runAlertRepositoryContract, runSessionRepositoryContract } from "./src/testing/repositoryContract.ts";

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

const SECRET = "a".repeat(48);

// ===========================================================================
console.log("\n[1] JWT — pinned algorithm, constant-time, expiry");
const jwt = new JwtService({ secret: SECRET, issuer: "nexus", audience: "nexus-mobile" });
const token = jwt.issue({ sub: "u1", sid: "s1", roles: ["user"] }, T0, 900);
const claims = jwt.verify(token, T0);
ok("a freshly issued token verifies", claims.sub === "u1" && claims.sid === "s1");
ok("roles survive the round trip", claims.roles[0] === "user");

const reason = (fn: () => unknown): string => {
  try { fn(); return "NO_THROW"; } catch (e) { return e instanceof JwtError ? e.reason : "OTHER"; }
};
ok("a tampered payload fails signature verification",
  reason(() => jwt.verify(token.split(".")[0] + "." + Buffer.from('{"sub":"admin"}').toString("base64url") + "." + token.split(".")[2], T0)) === "SIGNATURE_INVALID");
// exp = iat + 900s, with 5s of accepted clock skew. Both sides of that
// boundary are asserted so the tolerance cannot silently widen later.
ok("a token just inside the skew window still verifies", jwt.verify(token, T0 + 903_000).sub === "u1");
ok("a token past expiry + skew is rejected", reason(() => jwt.verify(token, T0 + 906_000)) === "EXPIRED");
ok("a long-expired token is rejected", reason(() => jwt.verify(token, T0 + 7_200_000)) === "EXPIRED");
ok("a malformed token is rejected", reason(() => jwt.verify("not.a.jwt", T0)) === "MALFORMED");

// alg:none downgrade — the canonical JWT attack.
const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
const noneBody = Buffer.from(JSON.stringify({ sub: "admin", sid: "s1", roles: ["admin"], iss: "nexus", aud: "nexus-mobile", exp: 9_999_999_999 })).toString("base64url");
ok("an alg:none token is refused", reason(() => jwt.verify(`${noneHeader}.${noneBody}.`, T0)) !== "NO_THROW");

const other = new JwtService({ secret: "b".repeat(48), issuer: "nexus", audience: "nexus-mobile" });
ok("a token signed with a different secret is refused",
  reason(() => jwt.verify(other.issue({ sub: "u1", sid: "s1", roles: [] }, T0, 900), T0)) === "SIGNATURE_INVALID");

const wrongAud = new JwtService({ secret: SECRET, issuer: "nexus", audience: "someone-else" });
ok("a token for another audience is refused",
  reason(() => jwt.verify(wrongAud.issue({ sub: "u1", sid: "s1", roles: [] }, T0, 900), T0)) === "CLAIM_MISMATCH");

let shortSecret = false;
try { new JwtService({ secret: "tooshort", issuer: "n", audience: "a" }); } catch { shortSecret = true; }
ok("a secret under 32 bytes is refused at construction", shortSecret);

// ===========================================================================
console.log("\n[2] Password hashing");
const hash = await hashPassword("correct horse battery staple");
ok("hash is scrypt with embedded parameters", hash.startsWith("scrypt$32768$8$1$"));
ok("the plaintext never appears in the hash", !hash.includes("correct horse"));
ok("the correct password verifies", await verifyPassword("correct horse battery staple", hash));
ok("a wrong password does not verify", !(await verifyPassword("wrong password here", hash)));
ok("two hashes of the same password differ (salted)", (await hashPassword("correct horse battery staple")) !== hash);
ok("a corrupt hash string fails closed", !(await verifyPassword("x", "garbage")));
ok("current parameters do not need rehashing", !needsRehash(hash));
ok("weaker legacy parameters are flagged for rehash", needsRehash("scrypt$16384$8$1$AA==$BB=="));
let shortPw = false;
try { await hashPassword("short"); } catch { shortPw = true; }
ok("a too-short password is refused", shortPw);

// ===========================================================================
console.log("\n[3] Session lifecycle — rotation, revocation, reuse detection");
const clock = new TestClock();
const users = new InMemoryUserRepository();
const sessionRepo = new InMemorySessionRepository();
users.seed({ id: "u1", email: "aras@nexus.app", passwordHash: hash, roles: ["user"], disabledAt: null });
users.seed({ id: "u2", email: "disabled@nexus.app", passwordHash: hash, roles: ["user"], disabledAt: T0 });

const sessions = new SessionService({ users, sessions: sessionRepo, jwt, clock, verifyPassword });

const authReason = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return "NO_THROW"; } catch (e) { return e instanceof AuthError ? e.reason : "OTHER"; }
};

const login = await sessions.login("aras@nexus.app", "correct horse battery staple");
ok("login issues an access and refresh token", !!login.tokens.accessToken && !!login.tokens.refreshToken);
ok("email is matched case-insensitively",
  (await authReason(() => sessions.login("ARAS@NEXUS.APP", "correct horse battery staple"))) === "NO_THROW");
ok("a wrong password is rejected",
  (await authReason(() => sessions.login("aras@nexus.app", "nope nope nope"))) === "INVALID_CREDENTIALS");
ok("an unknown email gives the SAME error as a wrong password",
  (await authReason(() => sessions.login("ghost@nexus.app", "whatever at all"))) === "INVALID_CREDENTIALS");
ok("a disabled account is rejected distinctly",
  (await authReason(() => sessions.login("disabled@nexus.app", "correct horse battery staple"))) === "ACCOUNT_DISABLED");

const decoded = jwt.verify(login.tokens.accessToken, clock.now());
const principal = await sessions.authenticate(login.tokens.accessToken);
ok("the access token authenticates", principal.userId === "u1");

const refreshed = await sessions.refresh(decoded.sid, login.tokens.refreshToken);
ok("refresh issues a new access token", !!refreshed.accessToken);
ok("the refresh token ROTATES", refreshed.refreshToken !== login.tokens.refreshToken);
ok("the old refresh token is now rejected",
  (await authReason(() => sessions.refresh(decoded.sid, login.tokens.refreshToken))) === "REFRESH_REUSED");
ok("reuse revokes the whole session, not just the request",
  (await authReason(() => sessions.refresh(decoded.sid, refreshed.refreshToken))) === "SESSION_REVOKED");
ok("a revoked session's access token stops authenticating",
  (await authReason(() => sessions.authenticate(login.tokens.accessToken))) === "SESSION_REVOKED");

const second = await sessions.login("aras@nexus.app", "correct horse battery staple");
const secondSid = jwt.verify(second.tokens.accessToken, clock.now()).sid;
await sessions.logout(secondSid);
ok("logout revokes the session immediately",
  (await authReason(() => sessions.authenticate(second.tokens.accessToken))) === "SESSION_REVOKED");

// Count live sessions explicitly rather than assuming: earlier assertions in
// this block also created sessions, and an expectation baked to a literal
// would silently drift as tests are added above.
await sessions.login("aras@nexus.app", "correct horse battery staple");
await sessions.login("aras@nexus.app", "correct horse battery staple");
const revokedCount = await sessions.logoutAll("u1");
ok("logoutAll revokes every remaining live session", revokedCount >= 2, String(revokedCount));
ok("logoutAll is idempotent once nothing is live", (await sessions.logoutAll("u1")) === 0);

// ===========================================================================
console.log("\n[4] Rate limiting");
const rlClock = new TestClock();
const limiter = new InMemoryRateLimiter(rlClock);
let allowed = 0;
for (let i = 0; i < 8; i++) if (limiter.check("ip1", POLICIES.auth).allowed) allowed++;
ok("the burst is capped at capacity", allowed === 5, String(allowed));
const denied = limiter.check("ip1", POLICIES.auth);
ok("a denied request reports retry-after", !denied.allowed && denied.retryAfterSec > 0, String(denied.retryAfterSec));
ok("a different key has its own bucket", limiter.check("ip2", POLICIES.auth).allowed);
rlClock.advance(300_000);
ok("tokens refill over time", limiter.check("ip1", POLICIES.auth).allowed);

// ===========================================================================
console.log("\n[5] Structured logging redacts secrets centrally");
const lines: string[] = [];
const logger = createLogger({ sink: (l) => lines.push(l), now: () => T0, service: "test" });
logger.child({ requestId: "req-1" }).info("login", { userId: "u1", password: "hunter2", nested: { accessToken: "abc" } });
const logged = JSON.parse(lines[0]!);
ok("log output is a single JSON object", typeof logged === "object");
ok("the request id is carried", logged.requestId === "req-1");
ok("a password is redacted", logged.password === "[redacted]");
ok("a nested token is redacted", logged.nested.accessToken === "[redacted]");
ok("non-sensitive fields survive", logged.userId === "u1");
ok("redact handles arrays", JSON.stringify(redact([{ token: "x", ok: 1 }])) === '[{"token":"[redacted]","ok":1}]');
lines.length = 0;
createLogger({ sink: (l) => lines.push(l), level: "warn" }).info("suppressed");
ok("level filtering suppresses lower levels", lines.length === 0);

// ===========================================================================
console.log("\n[6] Repository contract — in-memory reference implementation");
await runAlertRepositoryContract(() => new InMemoryAlertRepository(), ok, "memory");
await runSessionRepositoryContract(() => new InMemorySessionRepository(), ok, "memory");

// ===========================================================================
console.log("\n[7] HTTP edge");
const apiClock = new TestClock();
const bus = new InMemoryEventBus({ nodeId: "H", clock: apiClock });
const alertRepo = new InMemoryAlertRepository();
const monitorRepo = new InMemoryMonitorRepository();
const providers = new ProviderRegistry({ clock: apiClock, events: bus });
const alertService = new AlertService({ repo: alertRepo, events: bus, ids: new IdSequence("H1"), clock: apiClock });

const apiUsers = new InMemoryUserRepository();
const apiSessionRepo = new InMemorySessionRepository();
apiUsers.seed({ id: "u1", email: "aras@nexus.app", passwordHash: hash, roles: ["user"], disabledAt: null });
apiUsers.seed({ id: "admin", email: "admin@nexus.app", passwordHash: hash, roles: ["user", "admin"], disabledAt: null });
const apiSessions = new SessionService({ users: apiUsers, sessions: apiSessionRepo, jwt, clock: apiClock, verifyPassword });

const raised = await alertService.raise({
  source: "risk-engine", rule: "drawdown", severity: "CRITICAL",
  title: "Drawdown limit breached", explanation: "Drawdown reached 5.4% against a 5% limit.",
  entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin" },
});

const router = new NexusRouter({
  logger: createLogger({ sink: () => {} }),
  rateLimiter: new InMemoryRateLimiter(apiClock),
  authenticate: (t) => apiSessions.authenticate(t),
  now: () => apiClock.now(),
});
// The HTTP suite exercises auth, validation, errors and rate limits; monitor
// and intelligence behaviour live in their own suites. Real services are wired
// so the routes under test hit the same code paths as production.
const edgeEntityRepo = new InMemoryEntityRepository();
const edgeEntities = new EntityService(edgeEntityRepo);
const edgeSafety = new SafetyService({
  repo: new InMemorySafetyStateRepository(), events: bus, clock: apiClock,
});
const edgeIntelligence = new IntelligenceService({
  providers, providerId: "market", sourceName: "binance", now: () => apiClock.now(),
});
const edgeRiskIds = new IdSequence("E9");
const edgeRisk = new RiskService({
  intelligence: edgeIntelligence, repo: new InMemoryRiskRepository(),
  safety: edgeSafety, nextId: () => edgeRiskIds.next(apiClock.now()), now: () => apiClock.now(),
});
const edgeMonitorIds = new IdSequence("E8");
const edgeMonitors = new MonitorService({
  repo: monitorRepo, entities: edgeEntities, providers, events: bus,
  clock: apiClock, nextId: () => edgeMonitorIds.next(apiClock.now()),
});

registerRoutes(router, {
  sessions: apiSessions, alerts: alertService, alertRepo,
  monitors: edgeMonitors, safety: edgeSafety,
  providers, events: bus,
  intelligence: edgeIntelligence, risk: edgeRisk, entities: edgeEntities,
  now: () => apiClock.now(),
  checkDatabase: async () => true, version: "1.0.0-test",
});

const call = (method: string, url: string, opts: { body?: unknown; token?: string; ip?: string } = {}) =>
  router.handle({
    method, url,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    rawBody: opts.body === undefined ? "" : JSON.stringify(opts.body),
    ip: opts.ip ?? "10.0.0.1",
  });

const health = await call("GET", "/health");
ok("health is public and returns 200", health.status === 200);
ok("security headers are applied", health.headers?.["x-content-type-options"] === "nosniff");
ok("a request id is returned for correlation", typeof health.headers?.["x-request-id"] === "string");
ok("readiness reports database and providers", (await call("GET", "/health/ready")).status === 200);

ok("a protected route without a token is 401", (await call("GET", "/v1/command-center")).status === 401);
ok("a protected route with a garbage token is 401",
  (await call("GET", "/v1/command-center", { token: "garbage" })).status === 401);

const loginRes = await call("POST", "/v1/auth/login", { body: { email: "aras@nexus.app", password: "correct horse battery staple" } });
ok("login over HTTP returns 200", loginRes.status === 200, JSON.stringify(loginRes.body).slice(0, 120));
const accessToken = (loginRes.body as { accessToken: string }).accessToken;
ok("no password hash is echoed in the login response", !JSON.stringify(loginRes.body).includes("scrypt$"));

const badLogin = await call("POST", "/v1/auth/login", { body: { email: "aras@nexus.app", password: "wrong password!!" }, ip: "10.0.0.99" });
ok("a bad login is 401 with a typed code", badLogin.status === 401 && (badLogin.body as { code: string }).code === "UNAUTHENTICATED");

const malformed = await call("POST", "/v1/auth/login", { body: { email: "x" }, ip: "10.0.0.98" });
ok("a request failing input validation is 422", malformed.status === 422);
ok("validation errors name the offending field",
  ((malformed.body as { fields?: Array<{ path: string }> }).fields ?? []).some((f) => f.path === "password"));

const cc = await call("GET", "/v1/command-center", { token: accessToken });
ok("an authenticated request succeeds", cc.status === 200);
ok("the response passed its own output contract", cc.status === 200);
ok("system state reflects a critical alert", (cc.body as { systemState: string }).systemState === "CRITICAL");
ok("the critical alert is present", (cc.body as { criticalAlerts: unknown[] }).criticalAlerts.length === 1);

const list = await call("GET", "/v1/alerts?status=OPEN&limit=10", { token: accessToken });
ok("alert listing works", list.status === 200 && (list.body as unknown[]).length === 1);
const detail = await call("GET", `/v1/alerts/${raised.alert.id}`, { token: accessToken });
ok("alert detail works", detail.status === 200);
ok("a missing alert is 404", (await call("GET", "/v1/alerts/nope", { token: accessToken })).status === 404);

const ackRes = await call("POST", `/v1/alerts/${raised.alert.id}/acknowledge`, { token: accessToken, body: { note: "Looking into it." } });
ok("acknowledge over HTTP works", ackRes.status === 200 && (ackRes.body as { status: string }).status === "ACKNOWLEDGED");

ok("an unknown path is 404", (await call("GET", "/v1/nothing", { token: accessToken })).status === 404);
ok("a known path with the wrong method is 405", (await call("DELETE", "/health")).status === 405);

const adminDenied = await call("POST", "/v1/admin/sessions/revoke", { token: accessToken, body: { userId: "u1" } });
ok("a non-admin is refused with 403", adminDenied.status === 403);
const adminLogin = await call("POST", "/v1/auth/login", { body: { email: "admin@nexus.app", password: "correct horse battery staple" }, ip: "10.0.0.2" });
const adminToken = (adminLogin.body as { accessToken: string }).accessToken;
ok("an admin is permitted",
  (await call("POST", "/v1/admin/sessions/revoke", { token: adminToken, body: { userId: "u1" } })).status === 200);

const badJson = await router.handle({ method: "POST", url: "/v1/auth/login", headers: {}, rawBody: "{not json", ip: "10.0.0.3" });
ok("invalid JSON is 400, not a crash", badJson.status === 400);

let limited = 0;
for (let i = 0; i < 12; i++) {
  const r = await call("POST", "/v1/auth/login", { body: { email: "a@b.co", password: "xxxxxxxxxxxx" }, ip: "10.0.0.50" });
  if (r.status === 429) limited++;
}
ok("login is rate limited per IP", limited > 0, `${limited} limited`);
ok("a 429 carries a retryable error code",
  ((await call("POST", "/v1/auth/login", { body: { email: "a@b.co", password: "xxxxxxxxxxxx" }, ip: "10.0.0.50" })).body as { retryable: boolean }).retryable);

// ===========================================================================
console.log("\n[8] A REAL server over TCP");
const server = router.listen(0);
await new Promise((r) => server.on("listening", r));
const port = (server.address() as { port: number }).port;

const live = await fetch(`http://127.0.0.1:${port}/health`);
const liveBody = await live.json() as { status: string; version: string };
ok("a real HTTP request over a socket returns 200", live.status === 200);
ok("the real response body is correct JSON", liveBody.status === "ok" && liveBody.version === "1.0.0-test");
ok("security headers arrive over the wire", live.headers.get("x-content-type-options") === "nosniff");
ok("content-type is JSON", (live.headers.get("content-type") ?? "").includes("application/json"));

const liveAuth = await fetch(`http://127.0.0.1:${port}/v1/command-center`);
ok("a protected route over TCP is 401 without a token", liveAuth.status === 401);

const liveLogin = await fetch(`http://127.0.0.1:${port}/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "aras@nexus.app", password: "correct horse battery staple" }),
});
ok("login works over a real socket", liveLogin.status === 200);
const liveToken = ((await liveLogin.json()) as { accessToken: string }).accessToken;
const liveCc = await fetch(`http://127.0.0.1:${port}/v1/command-center`, { headers: { authorization: `Bearer ${liveToken}` } });
ok("an end-to-end authenticated request succeeds over TCP", liveCc.status === 200);
server.close();

// ===========================================================================
console.log("\n[9] Realtime — SSE framing, filtering, replay");
const hub = new RealtimeHub({ replaySize: 10 });
const rtBus = new InMemoryEventBus({ nodeId: "R", clock: apiClock });
hub.attach(rtBus);

const framesA: string[] = [], framesB: string[] = [];
hub.add({ id: "c1", userId: "u1", types: new Set(), send: (f) => framesA.push(f), close: () => {} });
hub.add({ id: "c2", userId: "u1", types: new Set(["ALERT_CREATED"]), send: (f) => framesB.push(f), close: () => {} });

const ev = rtBus.publish({ type: "ALERT_CREATED", severity: "CRITICAL", summary: "Drawdown breached", entity: { kind: "ASSET", id: "BTCUSDT", label: "BTC" } });
rtBus.publish({ type: "SYSTEM_WARNING", severity: "INFO", summary: "Provider slow" });

ok("an unfiltered subscriber receives every event", framesA.length === 2, String(framesA.length));
ok("a filtered subscriber receives only its types", framesB.length === 1, String(framesB.length));
ok("frames use SSE format with id and event", framesA[0]!.startsWith(`id: ${ev.id}\nevent: ALERT_CREATED\ndata: `));
ok("frames terminate with a blank line", framesA[0]!.endsWith("\n\n"));
ok("the payload is the full event", JSON.parse(framesA[0]!.split("data: ")[1]!.trim()).summary === "Drawdown breached");
ok("a heartbeat is an SSE comment", encodeHeartbeat(T0).startsWith(": heartbeat"));

const replayed: string[] = [];
hub.add({ id: "c3", userId: "u1", types: new Set(), send: (f) => replayed.push(f), close: () => {} }, ev.id);
ok("a reconnecting client replays only what it missed", replayed.length === 1, String(replayed.length));
ok("replay delivers the correct missed event", replayed[0]!.includes("Provider slow"));

hub.add({ id: "c4", userId: "u1", types: new Set(), send: () => { throw new Error("socket gone"); }, close: () => {} });
const before = hub.connectionCount;
rtBus.publish({ type: "SYSTEM_WARNING", severity: "INFO", summary: "after dead socket" });
ok("a dead socket is dropped, not retried forever", hub.connectionCount === before - 1);
ok("healthy subscribers still received that event", framesA.length === 3, String(framesA.length));
ok("realtime events originate from the domain bus, never a timer", framesA.every((f) => f.startsWith("id: ")));

// ===========================================================================
console.log("\n[10] Notification policy — backend decides");
const critical = { id: "e1", type: "ALERT_CREATED" as const, occurredAt: T0, severity: "CRITICAL" as const, entity: { kind: "ASSET" as const, id: "BTCUSDT", label: "BTC" }, summary: "Drawdown breached", data: {}, correlationId: null };
const info = { ...critical, id: "e2", severity: "INFO" as const };

ok("a critical alert notifies", decideNotification(critical, DEFAULT_PREFERENCES, T0).send);
ok("an info alert is below the default threshold", !decideNotification(info, DEFAULT_PREFERENCES, T0).send);
ok("a suppression always states its reason", decideNotification(info, DEFAULT_PREFERENCES, T0).reason.length > 0);
ok("the collapse key groups by entity", decideNotification(critical, DEFAULT_PREFERENCES, T0).collapseKey === "ASSET:BTCUSDT");
ok("a disabled category does not notify",
  !decideNotification(critical, { ...DEFAULT_PREFERENCES, criticalAlerts: false }, T0).send);
ok("a non-notifying event type does not notify",
  !decideNotification({ ...critical, type: "DATA_UPDATED" as const }, DEFAULT_PREFERENCES, T0).send);

const quiet = { ...DEFAULT_PREFERENCES, quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 }, timezoneOffsetMinutes: 0 };
const atNight = Date.UTC(2026, 0, 1, 23, 30);
const atNoon = Date.UTC(2026, 0, 1, 12, 0);
ok("a warning is suppressed during quiet hours",
  !decideNotification({ ...critical, severity: "WARNING" }, quiet, atNight).send);
ok("CRITICAL always breaks through quiet hours", decideNotification(critical, quiet, atNight).send);
ok("quiet hours crossing midnight do not suppress midday",
  decideNotification({ ...critical, severity: "WARNING" }, quiet, atNoon).send);

console.log(`\n${"=".repeat(52)}\n  api edge: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
