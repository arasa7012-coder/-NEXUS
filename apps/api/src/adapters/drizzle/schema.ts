/**
 * Drizzle schema — the typed mirror of migrations/0001_nexus_core.sql.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT: drizzle-orm is not installable here, so
 * this file has never been compiled. It must be kept in step with the SQL by
 * hand until `drizzle-kit` can run.
 */

import {
  bigint, decimal, index, int, json, mysqlEnum, mysqlTable,
  primaryKey, smallint, tinyint, uniqueIndex, varchar,
} from "drizzle-orm/mysql-core";

/**
 * Id columns are VARCHAR(24), matching the measured IdSequence width of 15-18
 * characters. They were CHAR(26) — the ULID width, which this format is not.
 */

export const usersTable = mysqlTable("users", {
  id: varchar("id", { length: 24 }).primaryKey(),
  email: varchar("email", { length: 254 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  roles: json("roles").$type<string[]>().notNull(),
  disabledAt: bigint("disabled_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => ({ email: uniqueIndex("uq_users_email").on(t.email) }));

export const sessionsTable = mysqlTable("sessions", {
  sid: varchar("sid", { length: 32 }).primaryKey(),
  userId: varchar("user_id", { length: 24 }).notNull(),
  refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  revokedAt: bigint("revoked_at", { mode: "number" }),
  lastUsedAt: bigint("last_used_at", { mode: "number" }).notNull(),
}, (t) => ({
  user: index("ix_sessions_user").on(t.userId, t.revokedAt),
  expiry: index("ix_sessions_expiry").on(t.expiresAt),
}));

export const alertsTable = mysqlTable("alerts", {
  id: varchar("id", { length: 24 }).primaryKey(),
  dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
  userId: varchar("user_id", { length: 24 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  severity: mysqlEnum("severity", ["INFO", "WATCH", "WARNING", "CRITICAL"]).notNull(),
  priority: smallint("priority").notNull(),
  title: varchar("title", { length: 140 }).notNull(),
  explanation: varchar("explanation", { length: 800 }).notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  entityKind: varchar("entity_kind", { length: 24 }),
  entityId: varchar("entity_id", { length: 128 }),
  entityLabel: varchar("entity_label", { length: 160 }),
  status: mysqlEnum("status", ["OPEN", "ACKNOWLEDGED", "RESOLVED"]).notNull(),
  isRead: tinyint("is_read").notNull().default(0),
  acknowledgedAt: bigint("acknowledged_at", { mode: "number" }),
  resolvedAt: bigint("resolved_at", { mode: "number" }),
  occurrences: int("occurrences").notNull().default(1),
  history: json("history").$type<Array<{ at: number; status: string; note: string | null }>>().notNull(),
}, (t) => ({
  dedupe: index("ix_alerts_dedupe").on(t.dedupeKey, t.status),
  feed: index("ix_alerts_feed").on(t.status, t.isRead, t.severity, t.priority, t.createdAt),
  entity: index("ix_alerts_entity").on(t.entityKind, t.entityId, t.createdAt),
}));

export const monitorsTable = mysqlTable("monitors", {
  id: varchar("id", { length: 24 }).primaryKey(),
  userId: varchar("user_id", { length: 24 }),
  name: varchar("name", { length: 120 }).notNull(),
  targetKind: varchar("target_kind", { length: 24 }).notNull(),
  targetId: varchar("target_id", { length: 128 }).notNull(),
  targetLabel: varchar("target_label", { length: 160 }).notNull(),
  state: mysqlEnum("state", ["ACTIVE", "PAUSED", "FAILING", "STOPPED"]).notNull(),
  intervalSeconds: int("interval_seconds").notNull(),
  lastRunAt: bigint("last_run_at", { mode: "number" }),
  nextRunAt: bigint("next_run_at", { mode: "number" }),
  lastOutcome: mysqlEnum("last_outcome", ["OK", "TRIGGERED", "ERROR"]),
  consecutiveFailures: int("consecutive_failures").notNull().default(0),
  detail: varchar("detail", { length: 280 }),
  claimedUntil: bigint("claimed_until", { mode: "number" }),
}, (t) => ({
  due: index("ix_monitors_due").on(t.state, t.nextRunAt),
  target: index("ix_monitors_target").on(t.targetKind, t.targetId),
}));

export const eventsTable = mysqlTable("events", {
  id: varchar("id", { length: 24 }).primaryKey(),
  type: varchar("type", { length: 32 }).notNull(),
  occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
  severity: mysqlEnum("severity", ["INFO", "WATCH", "WARNING", "CRITICAL"]).notNull(),
  entityKind: varchar("entity_kind", { length: 24 }),
  entityId: varchar("entity_id", { length: 128 }),
  entityLabel: varchar("entity_label", { length: 160 }),
  summary: varchar("summary", { length: 400 }).notNull(),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  correlationId: varchar("correlation_id", { length: 64 }),
}, (t) => ({
  recent: index("ix_events_recent").on(t.occurredAt),
  byType: index("ix_events_type").on(t.type, t.occurredAt),
  correlation: index("ix_events_correlation").on(t.correlationId),
}));

export const riskEvaluationsTable = mysqlTable("risk_evaluations", {
  id: varchar("id", { length: 24 }).primaryKey(),
  userId: varchar("user_id", { length: 24 }),
  entityKind: varchar("entity_kind", { length: 24 }),
  entityId: varchar("entity_id", { length: 128 }),
  evaluatedAt: bigint("evaluated_at", { mode: "number" }).notNull(),
  level: mysqlEnum("level", ["LOW", "MODERATE", "HIGH", "EXTREME"]),
  score: decimal("score", { precision: 5, scale: 2 }),
  coveragePercent: decimal("coverage_percent", { precision: 5, scale: 2 }).notNull(),
  factors: json("factors").$type<Array<{
    id: string; label: string; points: number; maxPoints: number; description: string;
  }>>().notNull(),
  unavailableReason: varchar("unavailable_reason", { length: 400 }),
  dataFreshness: mysqlEnum("data_freshness", ["LIVE", "CACHED", "STALE", "UNAVAILABLE"]).notNull(),
  providerId: varchar("provider_id", { length: 64 }),
  emergencyStopActive: tinyint("emergency_stop_active").notNull().default(0),
}, (t) => ({
  entityTime: index("ix_risk_entity_time").on(t.entityKind, t.entityId, t.evaluatedAt),
  userTime: index("ix_risk_user_time").on(t.userId, t.evaluatedAt),
}));

export const entitiesTable = mysqlTable("entities", {
  kind: varchar("kind", { length: 24 }).notNull(),
  id: varchar("id", { length: 128 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.kind, t.id] }),
  label: index("ix_entities_label").on(t.label),
}));

export const providerStatesTable = mysqlTable("provider_states", {
  providerId: varchar("provider_id", { length: 64 }).primaryKey(),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  state: mysqlEnum("state", ["OPERATIONAL", "DEGRADED", "RATE_LIMITED", "FAILING", "UNCONFIGURED"]).notNull(),
  lastSuccessAt: bigint("last_success_at", { mode: "number" }),
  lastFailureAt: bigint("last_failure_at", { mode: "number" }),
  consecutiveFailures: int("consecutive_failures").notNull().default(0),
  latencyMs: int("latency_ms"),
  detail: varchar("detail", { length: 280 }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const pushDevicesTable = mysqlTable("push_devices", {
  token: varchar("token", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 24 }).notNull(),
  platform: mysqlEnum("platform", ["ios", "android"]).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastSeenAt: bigint("last_seen_at", { mode: "number" }).notNull(),
  disabledAt: bigint("disabled_at", { mode: "number" }),
}, (t) => ({ user: index("ix_push_user").on(t.userId, t.disabledAt) }));

export const emergencyStopsTable = mysqlTable("emergency_stops", {
  userId: varchar("user_id", { length: 24 }).primaryKey(),
  active: tinyint("active").notNull().default(0),
  reason: varchar("reason", { length: 280 }),
  activatedAt: bigint("activated_at", { mode: "number" }),
  resetAt: bigint("reset_at", { mode: "number" }),
  actor: varchar("actor", { length: 64 }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const emergencyStopAuditTable = mysqlTable("emergency_stop_audit", {
  id: varchar("id", { length: 24 }).primaryKey(),
  userId: varchar("user_id", { length: 24 }).notNull(),
  transition: mysqlEnum("transition", ["ACTIVATED", "RESET"]).notNull(),
  reason: varchar("reason", { length: 280 }),
  actor: varchar("actor", { length: 64 }),
  occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
}, (t) => ({ user: index("ix_stop_audit_user").on(t.userId, t.occurredAt) }));

export const rateLimitCountersTable = mysqlTable("rate_limit_counters", {
  counterKey: varchar("counter_key", { length: 191 }).primaryKey(),
  count: int("count").notNull().default(0),
  resetAt: bigint("reset_at", { mode: "number" }).notNull(),
}, (t) => ({ expiry: index("ix_rate_limit_expiry").on(t.resetAt) }));
