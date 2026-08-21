/**
 * Drizzle/MySQL AlertRepository.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT. drizzle-orm and mysql2 cannot be installed
 * here and no database is reachable, so nothing in this file has been executed
 * against a server. Its obligation is precise and testable: pass
 * `runAlertRepositoryContract` — the same suite the in-memory reference passes.
 * Until that has been run against a real database, treat this as unproven.
 *
 * The domain never imports this file. It depends on the AlertRepository
 * interface, which is why swapping storage cannot reach the business logic.
 */

import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { Alert, AlertStatus, EntityRef, Severity } from "@nexus/contracts";
import type { AlertRepository } from "../../domain/alerts/alertService.ts";
import { alertsTable } from "./schema.ts";

type Row = typeof alertsTable.$inferSelect;

/** DB row -> contract. The single place the two representations meet. */
function toAlert(row: Row): Alert {
  const entity: EntityRef | null =
    row.entityKind && row.entityId
      ? { kind: row.entityKind as EntityRef["kind"], id: row.entityId, label: row.entityLabel ?? row.entityId }
      : null;

  return {
    id: row.id,
    dedupeKey: row.dedupeKey,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    severity: row.severity as Severity,
    priority: row.priority,
    title: row.title,
    explanation: row.explanation,
    source: row.source,
    entity,
    status: row.status as AlertStatus,
    read: row.isRead === 1,
    acknowledgedAt: row.acknowledgedAt === null ? null : Number(row.acknowledgedAt),
    resolvedAt: row.resolvedAt === null ? null : Number(row.resolvedAt),
    occurrences: row.occurrences,
    history: (row.history ?? []) as Alert["history"],
  };
}

function toRow(alert: Alert): Row {
  return {
    id: alert.id,
    dedupeKey: alert.dedupeKey,
    userId: null,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    severity: alert.severity,
    priority: alert.priority,
    title: alert.title,
    explanation: alert.explanation,
    source: alert.source,
    entityKind: alert.entity?.kind ?? null,
    entityId: alert.entity?.id ?? null,
    entityLabel: alert.entity?.label ?? null,
    status: alert.status,
    isRead: alert.read ? 1 : 0,
    acknowledgedAt: alert.acknowledgedAt,
    resolvedAt: alert.resolvedAt,
    occurrences: alert.occurrences,
    history: alert.history,
  } as Row;
}

/**
 * Severity ordering is expressed in SQL so the database can satisfy the
 * canonical sort from ix_alerts_feed. Sorting in the application would mean
 * fetching every candidate row first.
 */
const SEVERITY_ORDER = sql`FIELD(${alertsTable.severity}, 'CRITICAL', 'WARNING', 'WATCH', 'INFO')`;

export class DrizzleAlertRepository implements AlertRepository {
  constructor(private readonly db: MySql2Database) {}

  async findOpenByDedupeKey(key: string): Promise<Alert | null> {
    // Uses ix_alerts_dedupe (dedupe_key, status). Resolved alerts are excluded
    // so a recurring condition raises a new alert rather than reopening an old
    // one — the behaviour pinned by the contract suite.
    const rows = await this.db
      .select().from(alertsTable)
      .where(and(eq(alertsTable.dedupeKey, key), ne(alertsTable.status, "RESOLVED")))
      .limit(1);
    return rows[0] ? toAlert(rows[0]) : null;
  }

  async insert(alert: Alert): Promise<void> {
    // A plain insert, deliberately NOT an upsert: the unique primary key is
    // what surfaces a duplicate-id bug instead of hiding it.
    await this.db.insert(alertsTable).values(toRow(alert));
  }

  async update(alert: Alert): Promise<void> {
    const result = await this.db
      .update(alertsTable).set(toRow(alert))
      .where(eq(alertsTable.id, alert.id));
    // Drizzle/mysql2 exposes affectedRows on the result header.
    const affected = (result as unknown as { affectedRows?: number })?.affectedRows;
    if (affected === 0) throw new Error(`Alert ${alert.id} does not exist.`);
  }

  async findById(id: string): Promise<Alert | null> {
    const rows = await this.db.select().from(alertsTable).where(eq(alertsTable.id, id)).limit(1);
    return rows[0] ? toAlert(rows[0]) : null;
  }

  async list(filter: { status?: AlertStatus; limit: number }): Promise<Alert[]> {
    const query = this.db.select().from(alertsTable);
    const rows = await (filter.status ? query.where(eq(alertsTable.status, filter.status)) : query)
      .orderBy(alertsTable.isRead, SEVERITY_ORDER, desc(alertsTable.priority), desc(alertsTable.createdAt))
      .limit(filter.limit);
    return rows.map(toAlert);
  }

  async countUnread(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(alertsTable)
      .where(eq(alertsTable.isRead, 0));
    return Number(rows[0]?.count ?? 0);
  }
}
