-- NEXUS v1 — initial schema.
--
-- NOT EXECUTED IN THIS ENVIRONMENT. No database is reachable here, so this
-- migration has never been applied and its syntax has not been validated by a
-- server. Apply against a scratch MySQL/TiDB instance before trusting it.
--
-- Conventions:
--   * Ids are VARCHAR(24) holding the IdSequence format:
--       <10 char timestamp><4 char counter><1-4 char node>  => 15-18 chars.
--     Measured, not assumed. An earlier draft used CHAR(26) — the ULID width,
--     which this format is not — so every row would have been space-padded and
--     the column mis-sized. Time-ordered, so the primary key index is also a
--     chronological index and inserts append to the right of the B-tree.
--   * Timestamps are BIGINT epoch milliseconds, matching the contracts exactly.
--     DATETIME round-tripping through drivers is where timezone bugs are born.
--   * Every index below exists because a specific query in the domain layer
--     needs it; none is speculative.

-- ---------------------------------------------------------------------------
-- users & sessions
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id             VARCHAR(24)  NOT NULL,
  email          VARCHAR(254) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  roles          JSON         NOT NULL,
  disabled_at    BIGINT       NULL,
  created_at     BIGINT       NOT NULL,
  updated_at     BIGINT       NOT NULL,
  PRIMARY KEY (id),
  -- Login looks up by email; uniqueness is a correctness requirement, not a hint.
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE sessions (
  sid                 CHAR(32)     NOT NULL,
  user_id             VARCHAR(24)  NOT NULL,
  refresh_token_hash  CHAR(64)     NOT NULL,
  created_at          BIGINT       NOT NULL,
  expires_at          BIGINT       NOT NULL,
  revoked_at          BIGINT       NULL,
  last_used_at        BIGINT       NOT NULL,
  PRIMARY KEY (sid),
  -- revokeAllForUser scans by user; the revoked_at column is in the key so the
  -- "still live" filter is satisfied from the index.
  KEY ix_sessions_user (user_id, revoked_at),
  -- Expired-session reaping.
  KEY ix_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------

CREATE TABLE alerts (
  id               VARCHAR(24)  NOT NULL,
  dedupe_key       VARCHAR(160) NOT NULL,
  -- NULL means a system-wide alert not scoped to one user.
  user_id          VARCHAR(24)  NULL,
  created_at       BIGINT       NOT NULL,
  updated_at       BIGINT       NOT NULL,
  severity         ENUM('INFO','WATCH','WARNING','CRITICAL') NOT NULL,
  priority         SMALLINT UNSIGNED NOT NULL,
  title            VARCHAR(140) NOT NULL,
  explanation      VARCHAR(800) NOT NULL,
  source           VARCHAR(64)  NOT NULL,
  entity_kind      VARCHAR(24)  NULL,
  entity_id        VARCHAR(128) NULL,
  entity_label     VARCHAR(160) NULL,
  status           ENUM('OPEN','ACKNOWLEDGED','RESOLVED') NOT NULL,
  is_read          TINYINT(1)   NOT NULL DEFAULT 0,
  acknowledged_at  BIGINT       NULL,
  resolved_at      BIGINT       NULL,
  occurrences      INT UNSIGNED NOT NULL DEFAULT 1,
  history          JSON         NOT NULL,
  PRIMARY KEY (id),

  -- THE load-bearing index. findOpenByDedupeKey runs on every monitor
  -- evaluation — the hottest read in the system. Status is included so the
  -- "not RESOLVED" filter is answered from the index without touching rows.
  KEY ix_alerts_dedupe (dedupe_key, status),

  -- Backs the default list ordering: unread, severity, priority, newest.
  KEY ix_alerts_feed (status, is_read, severity, priority, created_at),

  -- Entity drill-down from a detail screen.
  KEY ix_alerts_entity (entity_kind, entity_id, created_at),

  -- Deleting a user must not strand their alerts as unreachable rows.
  CONSTRAINT fk_alerts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- monitors
-- ---------------------------------------------------------------------------

CREATE TABLE monitors (
  id                    VARCHAR(24)  NOT NULL,
  user_id               VARCHAR(24)  NULL,
  name                  VARCHAR(120) NOT NULL,
  target_kind           VARCHAR(24)  NOT NULL,
  target_id             VARCHAR(128) NOT NULL,
  target_label          VARCHAR(160) NOT NULL,
  state                 ENUM('ACTIVE','PAUSED','FAILING','STOPPED') NOT NULL,
  interval_seconds      INT UNSIGNED NOT NULL,
  last_run_at           BIGINT       NULL,
  next_run_at           BIGINT       NULL,
  last_outcome          ENUM('OK','TRIGGERED','ERROR') NULL,
  consecutive_failures  INT UNSIGNED NOT NULL DEFAULT 0,
  detail                VARCHAR(280) NULL,

  -- Distributed claim. MonitorRepository.claim() is a conditional UPDATE
  -- against this column; without it two API instances run the same check twice.
  claimed_until         BIGINT       NULL,

  PRIMARY KEY (id),
  -- listDue: state filter plus due-time ordering, answered entirely by the index.
  KEY ix_monitors_due (state, next_run_at),
  KEY ix_monitors_target (target_kind, target_id),
  CONSTRAINT fk_monitors_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

CREATE TABLE events (
  id              VARCHAR(24)  NOT NULL,
  type            VARCHAR(32)  NOT NULL,
  occurred_at     BIGINT       NOT NULL,
  severity        ENUM('INFO','WATCH','WARNING','CRITICAL') NOT NULL,
  entity_kind     VARCHAR(24)  NULL,
  entity_id       VARCHAR(128) NULL,
  entity_label    VARCHAR(160) NULL,
  summary         VARCHAR(400) NOT NULL,
  data            JSON         NOT NULL,
  correlation_id  VARCHAR(64)  NULL,
  PRIMARY KEY (id),
  -- Activity feed: newest first.
  KEY ix_events_recent (occurred_at),
  KEY ix_events_type (type, occurred_at),
  -- Tracing one causal chain across services.
  KEY ix_events_correlation (correlation_id)
);

-- ---------------------------------------------------------------------------
-- risk & intelligence snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE risk_evaluations (
  id                     VARCHAR(24)  NOT NULL,
  user_id                VARCHAR(24)  NULL,
  entity_kind            VARCHAR(24)  NULL,
  entity_id              VARCHAR(128) NULL,
  evaluated_at           BIGINT       NOT NULL,
  level                  ENUM('LOW','MODERATE','ELEVATED','HIGH','SEVERE') NULL,
  score                  DECIMAL(5,2) NULL,
  coverage_percent       DECIMAL(5,2) NOT NULL,
  -- Factors are stored verbatim so a historical score can always be explained
  -- with the evidence available at the time, not re-derived from current data.
  factors                JSON         NOT NULL,
  unavailable_reason     VARCHAR(400) NULL,
  data_freshness         ENUM('LIVE','CACHED','STALE','UNAVAILABLE') NOT NULL,
  provider_id            VARCHAR(64)  NULL,
  emergency_stop_active  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  -- History for one entity, newest first.
  KEY ix_risk_entity_time (entity_kind, entity_id, evaluated_at),
  KEY ix_risk_user_time (user_id, evaluated_at),
  CONSTRAINT fk_risk_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE intelligence_snapshots (
  id                 VARCHAR(24)  NOT NULL,
  entity_kind        VARCHAR(24)  NOT NULL,
  entity_id          VARCHAR(128) NOT NULL,
  generated_at       BIGINT       NOT NULL,
  primary_timeframe  VARCHAR(8)   NULL,
  timeframes         JSON         NOT NULL,
  explanation        TEXT         NULL,
  PRIMARY KEY (id),
  KEY ix_intel_entity_time (entity_kind, entity_id, generated_at)
);

-- ---------------------------------------------------------------------------
-- provider state
-- ---------------------------------------------------------------------------

CREATE TABLE provider_states (
  provider_id           VARCHAR(64)  NOT NULL,
  display_name          VARCHAR(80)  NOT NULL,
  state                 ENUM('OPERATIONAL','DEGRADED','RATE_LIMITED','FAILING','UNCONFIGURED') NOT NULL,
  last_success_at       BIGINT       NULL,
  last_failure_at       BIGINT       NULL,
  consecutive_failures  INT UNSIGNED NOT NULL DEFAULT 0,
  latency_ms            INT UNSIGNED NULL,
  detail                VARCHAR(280) NULL,
  updated_at            BIGINT       NOT NULL,
  PRIMARY KEY (provider_id)
);

-- ---------------------------------------------------------------------------
-- entities
-- ---------------------------------------------------------------------------

CREATE TABLE entities (
  kind        VARCHAR(24)  NOT NULL,
  id          VARCHAR(128) NOT NULL,
  label       VARCHAR(160) NOT NULL,
  metadata    JSON         NULL,
  created_at  BIGINT       NOT NULL,
  updated_at  BIGINT       NOT NULL,
  PRIMARY KEY (kind, id),
  -- Global search by label.
  KEY ix_entities_label (label)
);

-- ---------------------------------------------------------------------------
-- push devices
-- ---------------------------------------------------------------------------

CREATE TABLE push_devices (
  token         VARCHAR(255) NOT NULL,
  user_id       VARCHAR(24)  NOT NULL,
  platform      ENUM('ios','android') NOT NULL,
  created_at    BIGINT       NOT NULL,
  last_seen_at  BIGINT       NOT NULL,
  -- Set when the push service reports the token as permanently invalid, so a
  -- dead device is retired rather than retried on every critical alert.
  disabled_at   BIGINT       NULL,
  PRIMARY KEY (token),
  -- Fan-out reads every live device for one user.
  KEY ix_push_user (user_id, disabled_at),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- notification preferences
-- ---------------------------------------------------------------------------

CREATE TABLE notification_preferences (
  user_id                  VARCHAR(24) NOT NULL,
  minimum_severity         ENUM('INFO','WATCH','WARNING','CRITICAL') NOT NULL DEFAULT 'WARNING',
  critical_alerts          TINYINT(1)  NOT NULL DEFAULT 1,
  monitor_failures         TINYINT(1)  NOT NULL DEFAULT 1,
  provider_errors          TINYINT(1)  NOT NULL DEFAULT 0,
  quiet_hours_start_minute SMALLINT    NULL,
  quiet_hours_end_minute   SMALLINT    NULL,
  timezone_offset_minutes  SMALLINT    NOT NULL DEFAULT 0,
  updated_at               BIGINT      NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_notif_prefs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
