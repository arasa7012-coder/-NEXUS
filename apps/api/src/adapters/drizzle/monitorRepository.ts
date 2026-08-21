/**
 * Drizzle/MySQL MonitorRepository.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — see alertRepository.ts.
 *
 * The claim/release pair is the reason this adapter cannot be a naive
 * translation of the in-memory one. With two API instances running, `claim`
 * MUST be a single conditional UPDATE: a read-then-write leaves a window in
 * which both instances observe the monitor as free and run the same check.
 */

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { EntityRef, Monitor } from "@nexus/contracts";
import type { MonitorRepository } from "../../domain/monitoring/scheduler.ts";
import { monitorsTable } from "./schema.ts";

type Row = typeof monitorsTable.$inferSelect;

function toMonitor(row: Row): Monitor {
  return {
    id: row.id,
    name: row.name,
    target: {
      kind: row.targetKind as EntityRef["kind"],
      id: row.targetId,
      label: row.targetLabel,
    },
    state: row.state as Monitor["state"],
    intervalSeconds: row.intervalSeconds,
    lastRunAt: row.lastRunAt === null ? null : Number(row.lastRunAt),
    nextRunAt: row.nextRunAt === null ? null : Number(row.nextRunAt),
    lastOutcome: row.lastOutcome as Monitor["lastOutcome"],
    consecutiveFailures: row.consecutiveFailures,
    detail: row.detail,
  };
}

export class DrizzleMonitorRepository implements MonitorRepository {
  constructor(private readonly db: MySql2Database) {}

  async listDue(now: number, limit: number): Promise<Monitor[]> {
    const rows = await this.db
      .select().from(monitorsTable)
      .where(and(
        or(eq(monitorsTable.state, "ACTIVE"), eq(monitorsTable.state, "FAILING")),
        or(isNull(monitorsTable.nextRunAt), lte(monitorsTable.nextRunAt, now)),
      ))
      .orderBy(monitorsTable.nextRunAt)
      .limit(limit);
    return rows.map(toMonitor);
  }

  async save(monitor: Monitor): Promise<void> {
    await this.db.update(monitorsTable).set({
      state: monitor.state,
      lastRunAt: monitor.lastRunAt,
      nextRunAt: monitor.nextRunAt,
      lastOutcome: monitor.lastOutcome,
      consecutiveFailures: monitor.consecutiveFailures,
      detail: monitor.detail,
    }).where(eq(monitorsTable.id, monitor.id));
  }

  async claim(monitorId: string, until: number): Promise<boolean> {
    // Atomic: the WHERE clause and the write happen in one statement, so only
    // one instance can observe claimed_until as free and take it. affectedRows
    // reports whether this instance won.
    const result = await this.db
      .update(monitorsTable)
      .set({ claimedUntil: until })
      .where(and(
        eq(monitorsTable.id, monitorId),
        or(isNull(monitorsTable.claimedUntil), lte(monitorsTable.claimedUntil, sql`UNIX_TIMESTAMP() * 1000`)),
      ));
    return ((result as unknown as { affectedRows?: number })?.affectedRows ?? 0) > 0;
  }

  async release(monitorId: string): Promise<void> {
    await this.db.update(monitorsTable).set({ claimedUntil: null }).where(eq(monitorsTable.id, monitorId));
  }
}
