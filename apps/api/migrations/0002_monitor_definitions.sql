-- NEXUS 0002 — monitor definitions and persistent Emergency Stop.
--
-- NOT EXECUTED IN THIS ENVIRONMENT. No database is reachable, so this has
-- never been applied and its syntax is unvalidated by a server.
--
-- Conventions carried forward from 0001: VARCHAR(24) ids matching the measured
-- IdSequence width, BIGINT epoch-millisecond timestamps, and every index
-- justified by a query the domain actually issues.

-- ---------------------------------------------------------------------------
-- monitors: definition columns
-- ---------------------------------------------------------------------------

-- SAFETY: `monitors.user_id` becomes NOT NULL below. If any pre-existing rows
-- have a NULL owner, this ALTER fails rather than silently assigning them --
-- which is the correct outcome, because guessing an owner for a monitor that
-- can raise alerts would be worse than stopping.
--
-- Check first:
--     SELECT id, name FROM monitors WHERE user_id IS NULL;
--
-- If any rows are returned, choose deliberately -- NO DATA IS DELETED HERE:
--   (a) assign them:  UPDATE monitors SET user_id = '<owner-id>' WHERE user_id IS NULL;
--   (b) retire them:  UPDATE monitors SET state = 'STOPPED', enabled = 0 WHERE user_id IS NULL;
--                     ...then assign to an operations account before re-running.
-- Only then re-run this migration.

ALTER TABLE monitors
  -- Ownership becomes mandatory: every monitor read is scoped by user, and a
  -- NULL owner would be a row no scoped query could ever return.
  MODIFY COLUMN user_id VARCHAR(24) NOT NULL,

  ADD COLUMN type ENUM('ASSET_INTELLIGENCE','PROVIDER_HEALTH') NOT NULL
    DEFAULT 'ASSET_INTELLIGENCE' AFTER name,

  -- Closed, validated shape enforced by the contract layer before it is
  -- written. Never free-form, never a URL or an expression.
  ADD COLUMN config JSON NOT NULL AFTER type,

  -- User intent, distinct from `state` (engine status). A disabled monitor is
  -- PAUSED; a monitor the engine gave up on is STOPPED while still enabled.
  -- Collapsing the two would make "why did this stop?" unanswerable.
  ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER state,

  ADD COLUMN last_failure_kind
    ENUM('PROVIDER_UNAVAILABLE','TIMEOUT','INVALID_RESPONSE','RATE_LIMITED','AUTH_FAILED','INTERNAL')
    NULL AFTER last_outcome,

  ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN updated_at BIGINT NOT NULL DEFAULT 0;

-- The scheduler's hot query is listDue: enabled monitors in a runnable state
-- whose next_run_at has passed. `enabled` leads because it is the most
-- selective filter once a user disables monitors.
DROP INDEX ix_monitors_due ON monitors;
CREATE INDEX ix_monitors_due ON monitors (enabled, state, next_run_at);

-- Backs the per-user list, which is every read the mobile app performs.
CREATE INDEX ix_monitors_user ON monitors (user_id, created_at);

-- ---------------------------------------------------------------------------
-- emergency stop: current state
-- ---------------------------------------------------------------------------

CREATE TABLE emergency_stops (
  user_id       VARCHAR(24)  NOT NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 0,
  reason        VARCHAR(280) NULL,
  activated_at  BIGINT       NULL,
  reset_at      BIGINT       NULL,
  -- Who changed it. Set from the authenticated principal, never from a
  -- client-supplied field: an audit trail an attacker can forge is worse
  -- than none.
  actor         VARCHAR(64)  NULL,
  updated_at    BIGINT       NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_emergency_stops_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- emergency stop: audit trail
-- ---------------------------------------------------------------------------

-- Append-only, deliberately separate from the mutable current state. A safety
-- control whose history can be overwritten is not auditable.
CREATE TABLE emergency_stop_audit (
  id            VARCHAR(24)  NOT NULL,
  user_id       VARCHAR(24)  NOT NULL,
  transition    ENUM('ACTIVATED','RESET') NOT NULL,
  reason        VARCHAR(280) NULL,
  actor         VARCHAR(64)  NULL,
  occurred_at   BIGINT       NOT NULL,
  PRIMARY KEY (id),
  -- History for one user, newest first.
  KEY ix_stop_audit_user (user_id, occurred_at),
  CONSTRAINT fk_stop_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- rate limiting counters
-- ---------------------------------------------------------------------------

-- Backs SharedStoreRateLimiter. No external store is introduced: the limiter
-- needs one atomic increment-with-expiry, and INSERT ... ON DUPLICATE KEY
-- UPDATE provides exactly that. Replicas therefore share one authoritative
-- limit instead of each enforcing its own.
CREATE TABLE rate_limit_counters (
  counter_key VARCHAR(191) NOT NULL,
  count       INT UNSIGNED NOT NULL DEFAULT 0,
  reset_at    BIGINT       NOT NULL,
  PRIMARY KEY (counter_key),
  -- Reaping expired windows.
  KEY ix_rate_limit_expiry (reset_at)
);
