/**
 * SQL-backed CounterStore for the replica-safe rate limiter.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — no database is reachable here.
 *
 * No vendor is introduced. The project already has a SQL database, and the
 * limiter needs exactly one primitive: an atomic increment with an expiry.
 * `INSERT … ON DUPLICATE KEY UPDATE count = count + ?` is atomic in MySQL, so
 * a Redis dependency would buy nothing at NEXUS's current scale. If counter
 * write volume ever becomes the bottleneck, `CounterStore` is the seam — no
 * caller changes.
 */

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { CounterStore } from "../../platform/rateLimit.ts";

export class SqlCounterStore implements CounterStore {
  private readonly db: MySql2Database;
  private lastSweep = 0;

  constructor(db: MySql2Database) {
    this.db = db;
  }

  async increment(
    key: string, windowMs: number, amount: number,
  ): Promise<{ count: number; resetAtMs: number }> {
    const now = Date.now();
    const resetAtMs = now + windowMs;

    // One statement, so two replicas cannot both read "under the limit" and
    // both allow the request. A read-then-write here would reopen exactly the
    // race the shared store exists to close.
    await this.db.execute(sql`
      INSERT INTO rate_limit_counters (counter_key, count, reset_at)
      VALUES (${key}, ${amount}, ${resetAtMs})
      ON DUPLICATE KEY UPDATE
        count = IF(reset_at <= ${now}, ${amount}, count + ${amount}),
        reset_at = IF(reset_at <= ${now}, ${resetAtMs}, reset_at)
    `);

    const rows = await this.db.execute(sql`
      SELECT count, reset_at FROM rate_limit_counters WHERE counter_key = ${key}
    `);
    const row = (rows as unknown as Array<Array<{ count: number; reset_at: number }>>)[0]?.[0];

    await this.sweep(now);

    return {
      count: Number(row?.count ?? amount),
      resetAtMs: Number(row?.reset_at ?? resetAtMs),
    };
  }

  async delete(key: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM rate_limit_counters WHERE counter_key = ${key}`);
  }

  /** Expired rows are reaped occasionally so the table cannot grow forever. */
  private async sweep(now: number): Promise<void> {
    if (now - this.lastSweep < 300_000) return;
    this.lastSweep = now;
    await this.db.execute(sql`DELETE FROM rate_limit_counters WHERE reset_at <= ${now} LIMIT 1000`);
  }
}
