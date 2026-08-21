/**
 * Persistent Emergency Stop storage.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — drizzle-orm and mysql2 are not
 * installable and no database is reachable, so this has never executed.
 *
 * This is the adapter `server.ts` must use instead of the in-memory one. The
 * in-memory repository loses an active stop on restart, which for a safety
 * control is the most dangerous failure available: the operator believes
 * trading is halted while the process has quietly forgotten.
 *
 * Current state and audit trail are separate tables on purpose. The audit is
 * append-only — a safety control whose history can be overwritten is not
 * auditable — and the actor always comes from the authenticated principal.
 */

import { and, desc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type {
  EmergencyStopRecord, SafetyStateRepository,
} from "../../domain/safety/safetyService.ts";
import { emergencyStopAuditTable, emergencyStopsTable } from "./schema.ts";

export class DrizzleSafetyStateRepository implements SafetyStateRepository {
  private readonly db: MySql2Database;
  private readonly nextId: () => string;

  constructor(db: MySql2Database, nextId: () => string) {
    this.db = db;
    this.nextId = nextId;
  }

  async find(userId: string): Promise<EmergencyStopRecord | null> {
    const rows = await this.db
      .select().from(emergencyStopsTable)
      .where(eq(emergencyStopsTable.userId, userId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.userId,
      active: row.active === 1,
      reason: row.reason,
      activatedAt: row.activatedAt === null ? null : Number(row.activatedAt),
      resetAt: row.resetAt === null ? null : Number(row.resetAt),
      actor: row.actor,
      updatedAt: Number(row.updatedAt),
    };
  }

  async save(record: EmergencyStopRecord): Promise<void> {
    // Upsert: a user may have no row until their first stop.
    await this.db.insert(emergencyStopsTable).values({
      userId: record.userId,
      active: record.active ? 1 : 0,
      reason: record.reason,
      activatedAt: record.activatedAt,
      resetAt: record.resetAt,
      actor: record.actor,
      updatedAt: record.updatedAt,
    }).onDuplicateKeyUpdate({
      set: {
        active: record.active ? 1 : 0,
        reason: record.reason,
        activatedAt: record.activatedAt,
        resetAt: record.resetAt,
        actor: record.actor,
        updatedAt: record.updatedAt,
      },
    });
  }

  async appendAudit(
    entry: EmergencyStopRecord & { transition: "ACTIVATED" | "RESET" },
  ): Promise<void> {
    // Insert only. There is deliberately no update or delete path.
    await this.db.insert(emergencyStopAuditTable).values({
      id: this.nextId(),
      userId: entry.userId,
      transition: entry.transition,
      reason: entry.reason,
      actor: entry.actor,
      occurredAt: entry.updatedAt,
    });
  }

  async history(
    userId: string, limit: number,
  ): Promise<Array<EmergencyStopRecord & { transition: string }>> {
    const rows = await this.db
      .select().from(emergencyStopAuditTable)
      .where(eq(emergencyStopAuditTable.userId, userId))
      .orderBy(desc(emergencyStopAuditTable.occurredAt))
      .limit(limit);

    return rows.map((row) => ({
      userId: row.userId,
      // The audit row records the transition, from which the state follows.
      active: row.transition === "ACTIVATED",
      reason: row.reason,
      activatedAt: row.transition === "ACTIVATED" ? Number(row.occurredAt) : null,
      resetAt: row.transition === "RESET" ? Number(row.occurredAt) : null,
      actor: row.actor,
      updatedAt: Number(row.occurredAt),
      transition: row.transition,
    }));
  }
}
