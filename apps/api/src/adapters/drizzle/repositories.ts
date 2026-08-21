/**
 * Remaining Drizzle adapters plus the production factory.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT. drizzle-orm and mysql2 are not installable
 * here and no database is reachable, so none of this has executed. Each class
 * has one precise obligation: pass the same `runAlertRepositoryContract` /
 * `runSessionRepositoryContract` suites the in-memory reference passes.
 *
 * Where the reference throws, these throw. Where the reference returns null,
 * these return null. Any divergence is an adapter defect, never a reason to
 * relax the domain contract.
 */

import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { EntityKind, EntityRef } from "@nexus/contracts";
import type { SessionRecord, SessionRepository, UserRecord, UserRepository } from "../../auth/session.ts";
import type { RiskEvaluationRecord, RiskRepository } from "../../domain/risk/riskService.ts";
import type { EntityRecord, EntityRepository } from "../../domain/entities/entityService.ts";
import type { AlertRepository } from "../../domain/alerts/alertService.ts";
import type { MonitorRepository } from "../../domain/monitoring/scheduler.ts";
import { DrizzleAlertRepository } from "./alertRepository.ts";
import { DrizzleMonitorRepository } from "./monitorRepository.ts";
import { entitiesTable, riskEvaluationsTable, sessionsTable, usersTable } from "./schema.ts";

/** mysql2 exposes affected row counts on the result header. */
function affected(result: unknown): number {
  return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

export class DrizzleSessionRepository implements SessionRepository {
  private readonly db: MySql2Database;
  constructor(db: MySql2Database) { this.db = db; }

  async create(session: SessionRecord): Promise<void> {
    await this.db.insert(sessionsTable).values({
      sid: session.sid,
      userId: session.userId,
      refreshTokenHash: session.refreshTokenHash,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      lastUsedAt: session.lastUsedAt,
    });
  }

  async findBySid(sid: string): Promise<SessionRecord | null> {
    const rows = await this.db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      sid: row.sid,
      userId: row.userId,
      refreshTokenHash: row.refreshTokenHash,
      createdAt: Number(row.createdAt),
      expiresAt: Number(row.expiresAt),
      revokedAt: row.revokedAt === null ? null : Number(row.revokedAt),
      lastUsedAt: Number(row.lastUsedAt),
    };
  }

  async update(session: SessionRecord): Promise<void> {
    await this.db.update(sessionsTable).set({
      refreshTokenHash: session.refreshTokenHash,
      revokedAt: session.revokedAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
    }).where(eq(sessionsTable.sid, session.sid));
  }

  async revokeAllForUser(userId: string): Promise<number> {
    // The `isNull(revoked_at)` predicate is what makes the count match the
    // reference: already-revoked sessions must not be counted twice. It is
    // also satisfied directly by ix_sessions_user (user_id, revoked_at).
    const result = await this.db
      .update(sessionsTable)
      .set({ revokedAt: Date.now() })
      .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt)));
    return affected(result);
  }
}

export class DrizzleUserRepository implements UserRepository {
  private readonly db: MySql2Database;
  constructor(db: MySql2Database) { this.db = db; }

  private static toUser(row: typeof usersTable.$inferSelect): UserRecord {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      roles: row.roles,
      disabledAt: row.disabledAt === null ? null : Number(row.disabledAt),
    };
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    // Callers normalise to lower case before this point; uq_users_email makes
    // the lookup a single unique-index probe.
    const rows = await this.db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    return rows[0] ? DrizzleUserRepository.toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    return rows[0] ? DrizzleUserRepository.toUser(rows[0]) : null;
  }
}

export class DrizzleRiskRepository implements RiskRepository {
  private readonly db: MySql2Database;
  constructor(db: MySql2Database) { this.db = db; }

  async record(evaluation: RiskEvaluationRecord): Promise<void> {
    await this.db.insert(riskEvaluationsTable).values({
      id: evaluation.id,
      userId: null,
      entityKind: evaluation.entity?.kind ?? null,
      entityId: evaluation.entity?.id ?? null,
      evaluatedAt: evaluation.evaluatedAt,
      level: evaluation.level,
      // Stored as DECIMAL(5,2); the driver returns a string, so reads convert back.
      score: evaluation.score === null ? null : String(evaluation.score),
      coveragePercent: String(evaluation.coveragePercent),
      // Factors are persisted verbatim so a historical score stays explainable
      // with the evidence available at the time, never re-derived from today's.
      factors: evaluation.factors,
      unavailableReason: evaluation.unavailableReason,
      dataFreshness: evaluation.origin.freshness,
      providerId: evaluation.origin.providerId,
      emergencyStopActive: evaluation.emergencyStopActive ? 1 : 0,
    });
  }

  private static toRecord(row: typeof riskEvaluationsTable.$inferSelect): RiskEvaluationRecord {
    return {
      id: row.id,
      entity: row.entityKind && row.entityId
        ? { kind: row.entityKind as EntityKind, id: row.entityId, label: row.entityId }
        : null,
      evaluatedAt: Number(row.evaluatedAt),
      level: row.level as RiskEvaluationRecord["level"],
      score: row.score === null ? null : Number(row.score),
      coveragePercent: Number(row.coveragePercent),
      factors: (row.factors ?? []) as RiskEvaluationRecord["factors"],
      unavailableReason: row.unavailableReason,
      origin: {
        freshness: row.dataFreshness as RiskEvaluationRecord["origin"]["freshness"],
        providerId: row.providerId,
        observedAt: null,
        cachedAt: null,
        reason: row.unavailableReason,
      },
      emergencyStopActive: row.emergencyStopActive === 1,
    };
  }

  async history(entity: EntityRef, limit: number): Promise<RiskEvaluationRecord[]> {
    const rows = await this.db.select().from(riskEvaluationsTable)
      .where(and(eq(riskEvaluationsTable.entityKind, entity.kind), eq(riskEvaluationsTable.entityId, entity.id)))
      .orderBy(desc(riskEvaluationsTable.evaluatedAt))
      .limit(limit);
    return rows.map(DrizzleRiskRepository.toRecord);
  }

  async latest(entity: EntityRef | null): Promise<RiskEvaluationRecord | null> {
    const where = entity
      ? and(eq(riskEvaluationsTable.entityKind, entity.kind), eq(riskEvaluationsTable.entityId, entity.id))
      : and(isNull(riskEvaluationsTable.entityKind), isNull(riskEvaluationsTable.entityId));
    const rows = await this.db.select().from(riskEvaluationsTable).where(where)
      .orderBy(desc(riskEvaluationsTable.evaluatedAt)).limit(1);
    return rows[0] ? DrizzleRiskRepository.toRecord(rows[0]) : null;
  }
}

export class DrizzleEntityRepository implements EntityRepository {
  private readonly db: MySql2Database;
  constructor(db: MySql2Database) { this.db = db; }

  async upsert(entity: EntityRecord): Promise<void> {
    await this.db.insert(entitiesTable).values({
      kind: entity.kind, id: entity.id, label: entity.label,
      metadata: entity.metadata, createdAt: entity.updatedAt, updatedAt: entity.updatedAt,
    }).onDuplicateKeyUpdate({
      set: { label: entity.label, metadata: entity.metadata, updatedAt: entity.updatedAt },
    });
  }

  async find(kind: EntityKind, id: string): Promise<EntityRecord | null> {
    const rows = await this.db.select().from(entitiesTable)
      .where(and(eq(entitiesTable.kind, kind), eq(entitiesTable.id, id))).limit(1);
    const row = rows[0];
    return row
      ? { kind: row.kind as EntityKind, id: row.id, label: row.label, metadata: row.metadata, updatedAt: Number(row.updatedAt) }
      : null;
  }

  async search(term: string, limit: number): Promise<EntityRecord[]> {
    // Candidate retrieval only — final ranking is `rankSearchResults` in the
    // domain, so ordering policy stays testable and identical across adapters.
    const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db.select().from(entitiesTable)
      .where(or(like(entitiesTable.id, pattern), like(entitiesTable.label, pattern)))
      .limit(limit);
    return rows.map((row) => ({
      kind: row.kind as EntityKind, id: row.id, label: row.label,
      metadata: row.metadata, updatedAt: Number(row.updatedAt),
    }));
  }

  async listByKind(kind: EntityKind, limit: number): Promise<EntityRecord[]> {
    const rows = await this.db.select().from(entitiesTable).where(eq(entitiesTable.kind, kind)).limit(limit);
    return rows.map((row) => ({
      kind: row.kind as EntityKind, id: row.id, label: row.label,
      metadata: row.metadata, updatedAt: Number(row.updatedAt),
    }));
  }
}

/** Production repository set. The single place adapters are selected. */
export function createDrizzleRepositories(db: MySql2Database): {
  alerts: AlertRepository;
  monitors: MonitorRepository;
  sessions: SessionRepository;
  users: UserRepository;
  risk: RiskRepository;
  entities: EntityRepository;
} {
  return {
    alerts: new DrizzleAlertRepository(db),
    monitors: new DrizzleMonitorRepository(db),
    sessions: new DrizzleSessionRepository(db),
    users: new DrizzleUserRepository(db),
    risk: new DrizzleRiskRepository(db),
    entities: new DrizzleEntityRepository(db),
  };
}

/** Liveness probe for /health/ready. */
export async function checkDatabase(db: MySql2Database): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
