// Run: node --experimental-strip-types --conditions=nexus-source verify.hardening.ts
// Covers behaviour introduced or changed during the stabilization phase.
import { IdSequence } from "@nexus/core";
import { InMemoryEventBus } from "./src/platform/events.ts";
import type { Clock } from "./src/platform/events.ts";
import { RealtimeHub, encodeSseFrame } from "./src/http/realtime.ts";
import { createLogger } from "./src/platform/logger.ts";
import { InMemoryRateLimiter, POLICIES } from "./src/platform/rateLimit.ts";
import { JwtService } from "./src/auth/jwt.ts";
import { SessionService } from "./src/auth/session.ts";
import { hashPassword, verifyPassword } from "./src/auth/passwords.ts";
import { AlertService } from "./src/domain/alerts/alertService.ts";
import { NexusRouter, HttpError } from "./src/http/router.ts";
import {
  InMemoryAlertRepository, InMemorySessionRepository, InMemoryUserRepository,
} from "./src/adapters/memory/repositories.ts";
import { readFile } from "node:fs/promises";

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
console.log("\n[1] SSE cannot leak memory");

const clock = new TestClock();
const bus = new InMemoryEventBus({ nodeId: "H", clock });
const hub = new RealtimeHub({ replaySize: 5, maxConnectionsPerUser: 3, maxConnections: 10 });
hub.attach(bus);

const mk = (id: string, userId: string, sink: string[] = []) => ({
  id, userId, types: new Set<never>(), send: (f: string) => sink.push(f), close: () => {},
});

for (let i = 0; i < 3; i++) hub.add(mk(`c${i}`, "u1"));
ok("connections are tracked per user", hub.connectionsForUser("u1") === 3);

// A fourth from the same user evicts the oldest rather than being refused:
// a client reconnecting after a half-open socket must not be locked out by
// the corpses of its own earlier connections.
hub.add(mk("c3", "u1"));
ok("a per-user overflow evicts the oldest, not the newest", hub.connectionsForUser("u1") === 3);
ok("the total count reflects the eviction", hub.connectionCount === 3, String(hub.connectionCount));

for (let i = 0; i < 3; i++) hub.add(mk(`o${i}`, "u2"));
ok("other users are unaffected by one user's limit", hub.connectionsForUser("u2") === 3);

// The per-user index must be pruned on removal, or it grows forever.
for (let i = 0; i < 3; i++) hub.remove(`o${i}`);
ok("removing every connection clears the user index", hub.stats().users === 1, JSON.stringify(hub.stats()));

const dead = { id: "dead", userId: "u3", types: new Set<never>(), send: () => { throw new Error("EPIPE"); }, close: () => {} };
hub.add(dead);
bus.publish({ type: "SYSTEM_WARNING", severity: "INFO", summary: "probe" });
ok("a socket that throws on write is dropped", hub.connectionCount === 3, String(hub.connectionCount));
ok("and its user index entry is dropped with it", hub.connectionsForUser("u3") === 0);

const beat = { id: "beat", userId: "u4", types: new Set<never>(), send: () => { throw new Error("EPIPE"); }, close: () => {} };
hub.add(beat);
hub.heartbeat(clock.now());
ok("heartbeat reaps sockets that died without a close event", hub.connectionsForUser("u4") === 0);

for (let i = 0; i < 12; i++) bus.publish({ type: "DATA_UPDATED", severity: "INFO", summary: `e${i}` });
ok("the replay buffer stays bounded", hub.stats().replayBuffered === 5, String(hub.stats().replayBuffered));

const missed: string[] = [];
hub.add(mk("stale", "u5", missed), "an-id-that-has-scrolled-out-of-the-buffer");
ok("an unknown Last-Event-ID replays nothing rather than a misleading partial history",
  missed.length === 0, String(missed.length));

hub.closeAll();
ok("closeAll clears connections", hub.connectionCount === 0);
ok("closeAll clears the user index too", hub.stats().users === 0);
hub.detach();
const beforeDetach = hub.stats().replayBuffered;
bus.publish({ type: "DATA_UPDATED", severity: "INFO", summary: "after detach" });
ok("a detached hub stops consuming events", hub.stats().replayBuffered === beforeDetach);

// ===========================================================================
console.log("\n[2] Nothing sensitive reaches the logs");

const lines: string[] = [];
const logger = createLogger({ sink: (l) => lines.push(l), now: () => T0 });
logger.info("auth", {
  authorization: "Bearer abc.def.ghi",
  refreshToken: "secret-refresh",
  encryptionKey: "k",
  user: { password: "hunter2", email: "aras@nexus.app" },
  apiKey: "provider-key",
});
const line = lines[0]!;
ok("bearer tokens never appear", !line.includes("abc.def.ghi"));
ok("refresh tokens never appear", !line.includes("secret-refresh"));
ok("nested passwords never appear", !line.includes("hunter2"));
ok("provider api keys never appear", !line.includes("provider-key"));
ok("encryption keys never appear", JSON.parse(line).encryptionKey === "[redacted]");
ok("non-sensitive context survives for debugging", JSON.parse(line).user.email === "aras@nexus.app");

// ===========================================================================
console.log("\n[3] Internal failures do not leak implementation detail");

const router = new NexusRouter({
  logger: createLogger({ sink: () => {} }),
  rateLimiter: new InMemoryRateLimiter(clock),
  authenticate: async () => ({ userId: "u1", sid: "s1", roles: [] }),
  now: () => clock.now(),
});
router.add({
  method: "GET", pattern: "/boom", auth: "none",
  handler: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:3306 — db password rejected"); },
});

const boom = await router.handle({ method: "GET", url: "/boom", headers: {}, rawBody: "", ip: "1.1.1.1" });
const body = JSON.stringify(boom.body);
ok("an unhandled error becomes a 500", boom.status === 500);
ok("the internal message is not echoed", !body.includes("ECONNREFUSED") && !body.includes("password"));
ok("no stack trace is returned", !body.includes("at "));
ok("a trace id is returned so the log can be found", (boom.body as { traceId: string }).traceId.length > 0);
ok("security headers are present even on failure", boom.headers?.["x-content-type-options"] === "nosniff");
ok("responses are never cached", boom.headers?.["cache-control"] === "no-store");

const oversized = await router.handle({
  method: "GET", url: "/boom", headers: {}, rawBody: "x".repeat(300_000), ip: "1.1.1.2",
});
ok("an oversized body is rejected before parsing", oversized.status === 413);

// ===========================================================================
console.log("\n[4] Full alert lifecycle, including escalation and reopening");

const aClock = new TestClock();
const aBus = new InMemoryEventBus({ nodeId: "A", clock: aClock });
const repo = new InMemoryAlertRepository();
const alerts = new AlertService({ repo, events: aBus, ids: new IdSequence("A9"), clock: aClock });

const base = {
  source: "risk-engine", rule: "drawdown",
  entity: { kind: "ASSET" as const, id: "BTCUSDT", label: "BTC" },
};

const created = await alerts.raise({ ...base, severity: "WATCH", title: "Drawdown rising", explanation: "3.1% of 5%." });
ok("created: an alert opens unread", created.alert.status === "OPEN" && !created.alert.read);
ok("created: priority derives from severity", created.alert.priority === 300, String(created.alert.priority));
ok("created: timestamps are set", created.alert.createdAt === T0 && created.alert.updatedAt === T0);

aClock.advance(60_000);
const escalated = await alerts.raise({ ...base, severity: "CRITICAL", title: "Drawdown breached", explanation: "5.4% of 5%." });
ok("escalation raises severity in place", escalated.alert.severity === "CRITICAL" && !escalated.created);
ok("escalation preserves the original id", escalated.alert.id === created.alert.id);
ok("escalation advances updatedAt", escalated.alert.updatedAt === T0 + 60_000);
ok("escalation preserves createdAt", escalated.alert.createdAt === T0);
ok("occurrences accumulate across escalation", escalated.alert.occurrences === 2);

const softened = await alerts.raise({ ...base, severity: "INFO", title: "Easing", explanation: "3.9%." });
ok("severity is never silently downgraded", softened.alert.severity === "CRITICAL");
ok("priority is preserved through escalation", softened.alert.priority === created.alert.priority);

const acked = await alerts.acknowledge(created.alert.id, "On it.");
ok("acknowledged: status and read flag set", acked.status === "ACKNOWLEDGED" && acked.read);
ok("acknowledged: the note is retained in history", acked.history.at(-1)?.note === "On it.");

// An acknowledged condition that recurs must still collapse: the operator has
// seen it, and a second row would undo the acknowledgement.
const whileAcked = await alerts.raise({ ...base, severity: "WARNING", title: "Again", explanation: "4.4%." });
ok("a recurrence while acknowledged still collapses", !whileAcked.created);

const resolved = await alerts.resolve(created.alert.id, "Position closed.");
ok("resolved: status and timestamp set", resolved.status === "RESOLVED" && resolved.resolvedAt !== null);
ok("resolved: full history is retained", resolved.history.length === 3, String(resolved.history.length));

aClock.advance(3_600_000);
const reopened = await alerts.raise({ ...base, severity: "WARNING", title: "Returned", explanation: "4.8%." });
ok("a condition returning after resolution opens a NEW alert", reopened.created);
ok("the reopened alert has a distinct id", reopened.alert.id !== created.alert.id);
ok("the reopened alert starts its own occurrence count", reopened.alert.occurrences === 1);

const createdEvents = aBus.recent(100).filter((e) => e.type === "ALERT_CREATED");
ok("exactly one ALERT_CREATED per real alert — no notification spam",
  createdEvents.length === 2, String(createdEvents.length));

// ===========================================================================
console.log("\n[5] Session revocation is complete");

const sClock = new TestClock();
const jwt = new JwtService({ secret: "z".repeat(48), issuer: "nexus", audience: "nexus-mobile" });
const users = new InMemoryUserRepository();
const sessionRepo = new InMemorySessionRepository();
const hash = await hashPassword("correct horse battery staple");
users.seed({ id: "u1", email: "a@b.co", passwordHash: hash, roles: ["user"], disabledAt: null });
const sessions = new SessionService({ users, sessions: sessionRepo, jwt, clock: sClock, verifyPassword });

const s1 = await sessions.login("a@b.co", "correct horse battery staple");
const s2 = await sessions.login("a@b.co", "correct horse battery staple");
const s3 = await sessions.login("a@b.co", "correct horse battery staple");
ok("multiple concurrent sessions are supported", (await sessions.logoutAll("u1")) === 3);

for (const [label, session] of [["first", s1], ["second", s2], ["third", s3]] as const) {
  let revoked = false;
  try { await sessions.authenticate(session.tokens.accessToken); } catch { revoked = true; }
  ok(`logout-all revoked the ${label} session`, revoked);
}
ok("logout-all is idempotent", (await sessions.logoutAll("u1")) === 0);

// ===========================================================================
console.log("\n[6] Migration is structurally sound");

const sqlText = await readFile(new URL("./migrations/0001_nexus_core.sql", import.meta.url), "utf8");
const withoutComments = sqlText.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const tables = withoutComments.split(";").filter((s) => s.includes("CREATE TABLE"));

ok("every expected table is defined", tables.length === 11, String(tables.length));
ok("every table declares a primary key", tables.every((t) => t.includes("PRIMARY KEY")));
ok("every CREATE TABLE is balanced", tables.every((t) => (t.match(/\(/g) ?? []).length === (t.match(/\)/g) ?? []).length));
ok("email is uniquely constrained", sqlText.includes("UNIQUE KEY uq_users_email"));
ok("the dedupe index exists — the hottest read in the system", sqlText.includes("ix_alerts_dedupe"));
ok("the alert feed index matches the canonical ordering",
  sqlText.includes("ix_alerts_feed (status, is_read, severity, priority, created_at)"));
ok("the monitor due index exists", sqlText.includes("ix_monitors_due (state, next_run_at)"));
ok("monitors carry a distributed claim column", sqlText.includes("claimed_until"));

// Every user_id must be covered by a foreign key, or deleting a user strands rows.
const userIdTables = ["sessions", "alerts", "monitors", "risk_evaluations", "push_devices", "notification_preferences"];
const missingFk = userIdTables.filter((t) => {
  const stmt = tables.find((s) => s.includes(`CREATE TABLE ${t}`)) ?? "";
  return !stmt.includes("FOREIGN KEY (user_id) REFERENCES users (id)");
});
ok("every user-scoped table has a foreign key to users", missingFk.length === 0, missingFk.join(","));
ok("user deletion cascades rather than stranding rows",
  (sqlText.match(/ON DELETE CASCADE/g) ?? []).length === userIdTables.length,
  String((sqlText.match(/ON DELETE CASCADE/g) ?? []).length));

// Id columns must fit the measured IdSequence width (15-18 chars).
const probe = new IdSequence("A1B2").next(Date.now());
ok("ids fit the declared column width", probe.length <= 24, `${probe.length} chars`);
// Scan DDL only: the header comment legitimately mentions CHAR(26) while
// explaining why it was wrong.
ok("no id column is still CHAR(26)", !withoutComments.includes("CHAR(26)"));
ok("id columns are VARCHAR(24)", (withoutComments.match(/VARCHAR\(24\)/g) ?? []).length >= 7,
  String((withoutComments.match(/VARCHAR\(24\)/g) ?? []).length));

console.log("\n[7] Migration 0002 — monitor definitions and Emergency Stop");

const sql2 = await readFile(new URL("./migrations/0002_monitor_definitions.sql", import.meta.url), "utf8");
const clean2 = sql2.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const tables2 = clean2.split(";").filter((t) => t.includes("CREATE TABLE"));

ok("all three new tables are defined", tables2.length === 3, String(tables2.length));
ok("each declares a primary key", tables2.every((t) => t.includes("PRIMARY KEY")));
ok("each is balanced", tables2.every((t) => (t.match(/\(/g) ?? []).length === (t.match(/\)/g) ?? []).length));

// User-scoped tables cascade. rate_limit_counters deliberately does NOT: it is
// keyed by IP and route, not by user, and must keep throttling an
// unauthenticated flood that has no user to cascade from.
const userScoped2 = tables2.filter((t) => t.includes("user_id"));
ok("every user-scoped new table cascades from users",
  userScoped2.length === 2
  && userScoped2.every((t) => t.includes("FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE")),
  String(userScoped2.length));
ok("the rate-limit table is deliberately not user-scoped",
  clean2.includes("CREATE TABLE rate_limit_counters") && !tables2.find((t) => t.includes("rate_limit_counters"))!.includes("user_id"));
ok("rate-limit rows can be reaped by expiry", clean2.includes("ix_rate_limit_expiry (reset_at)"));

// The NOT NULL change must not destroy data.
ok("migration 0002 contains no destructive statement",
  !/DROP TABLE|DELETE FROM|TRUNCATE/i.test(clean2));
ok("ownerless monitor rows are called out before the NOT NULL change",
  sql2.includes("WHERE user_id IS NULL") && sql2.includes("NO DATA IS DELETED HERE"));
ok("ids keep the VARCHAR(24) convention", !clean2.includes("CHAR(26)") && clean2.includes("VARCHAR(24)"));

ok("monitor ownership becomes mandatory", clean2.includes("MODIFY COLUMN user_id VARCHAR(24) NOT NULL"));
ok("the monitor type column is a closed enum",
  clean2.includes("type ENUM('ASSET_INTELLIGENCE','PROVIDER_HEALTH')"));
ok("enabled is separate from state", clean2.includes("ADD COLUMN enabled"));
ok("the failure taxonomy is persisted", clean2.includes("last_failure_kind"));

ok("the due index leads with enabled — the scheduler's hot query",
  clean2.includes("ix_monitors_due ON monitors (enabled, state, next_run_at)"));
ok("the per-user list is indexed", clean2.includes("ix_monitors_user ON monitors (user_id, created_at)"));
ok("the stale due index is dropped, not duplicated", clean2.includes("DROP INDEX ix_monitors_due"));

ok("the Emergency Stop audit trail is a separate append-only table",
  clean2.includes("CREATE TABLE emergency_stop_audit"));
ok("the audit trail records the actor", clean2.includes("actor"));
ok("the audit trail is indexed for per-user history",
  clean2.includes("ix_stop_audit_user (user_id, occurred_at)"));

console.log(`\n${"=".repeat(52)}\n  hardening: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
