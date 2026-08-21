/**
 * In-memory adapters.
 *
 * These implement the domain ports without a database. Two uses:
 *   - they make the domain layer executable and testable in any environment;
 *   - they are the reference against which the Drizzle adapters must behave
 *     identically, which is what makes swapping storage safe.
 *
 * Not for production: no durability, no cross-process visibility.
 */

import type { Alert, AlertStatus, Monitor } from "@nexus/contracts";
import { compareAlerts } from "@nexus/contracts";
import type { AlertRepository } from "../../domain/alerts/alertService.ts";
import type {
  SessionRepository, SessionRecord, UserRepository, UserRecord,
} from "../../auth/session.ts";
import type { RiskRepository, RiskEvaluationRecord } from "../../domain/risk/riskService.ts";
import type { MonitorDefinitionRepository } from "../../domain/monitoring/monitorService.ts";
import type { EmergencyStopRecord, SafetyStateRepository } from "../../domain/safety/safetyService.ts";
import type { EntityRepository, EntityRecord } from "../../domain/entities/entityService.ts";
import type { EntityKind, EntityRef } from "@nexus/contracts";
import { entityKey } from "@nexus/contracts";

export class InMemoryAlertRepository implements AlertRepository {
  private readonly byId = new Map<string, Alert>();

  async findOpenByDedupeKey(key: string): Promise<Alert | null> {
    for (const alert of this.byId.values()) {
      // Only OPEN and ACKNOWLEDGED collapse. A resolved condition that returns
      // is new information and must open a fresh alert.
      if (alert.dedupeKey === key && alert.status !== "RESOLVED") return alert;
    }
    return null;
  }

  async insert(alert: Alert): Promise<void> {
    if (this.byId.has(alert.id)) throw new Error(`Duplicate alert id ${alert.id}.`);
    this.byId.set(alert.id, alert);
  }

  async update(alert: Alert): Promise<void> {
    if (!this.byId.has(alert.id)) throw new Error(`Alert ${alert.id} does not exist.`);
    this.byId.set(alert.id, alert);
  }

  async findById(id: string): Promise<Alert | null> {
    return this.byId.get(id) ?? null;
  }

  async list(filter: { status?: AlertStatus; limit: number }): Promise<Alert[]> {
    return [...this.byId.values()]
      .filter((a) => (filter.status ? a.status === filter.status : true))
      .sort(compareAlerts)
      .slice(0, filter.limit);
  }

  async countUnread(): Promise<number> {
    return [...this.byId.values()].filter((a) => !a.read).length;
  }

  get size(): number {
    return this.byId.size;
  }
}

export class InMemoryMonitorRepository implements MonitorDefinitionRepository {
  private readonly byId = new Map<string, Monitor>();
  private readonly claims = new Map<string, number>();
  private nowMs = () => Date.now();

  /** Test seam so claim expiry can be driven without waiting. */
  useClock(now: () => number): void {
    this.nowMs = now;
  }

  seed(monitor: Monitor): void {
    this.byId.set(monitor.id, monitor);
  }

  async create(monitor: Monitor): Promise<void> {
    if (this.byId.has(monitor.id)) throw new Error(`Duplicate monitor id ${monitor.id}.`);
    this.byId.set(monitor.id, monitor);
  }

  async findById(id: string): Promise<Monitor | null> {
    return this.byId.get(id) ?? null;
  }

  async listByUser(userId: string, limit: number): Promise<Monitor[]> {
    // Scoped at the query, so a caller cannot forget to filter.
    return [...this.byId.values()]
      .filter((m) => m.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async countByUser(userId: string): Promise<number> {
    return [...this.byId.values()].filter((m) => m.userId === userId).length;
  }

  async delete(id: string): Promise<boolean> {
    this.claims.delete(id);
    return this.byId.delete(id);
  }

  async listDue(now: number, limit: number): Promise<Monitor[]> {
    return [...this.byId.values()]
      // A disabled monitor is never due, whatever its state field says.
      .filter((m) => m.enabled && (m.state === "ACTIVE" || m.state === "FAILING"))
      .filter((m) => m.nextRunAt === null || m.nextRunAt <= now)
      .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
      .slice(0, limit);
  }

  async save(monitor: Monitor): Promise<void> {
    this.byId.set(monitor.id, monitor);
  }

  async claim(monitorId: string, until: number): Promise<boolean> {
    const held = this.claims.get(monitorId);
    if (held !== undefined && held > this.nowMs()) return false;
    this.claims.set(monitorId, until);
    return true;
  }

  async release(monitorId: string): Promise<void> {
    this.claims.delete(monitorId);
  }

  /** Test seam: simulate another worker already holding the claim. */
  forceClaim(monitorId: string, until: number): void {
    this.claims.set(monitorId, until);
  }

  get(id: string): Monitor | undefined {
    return this.byId.get(id);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly bySid = new Map<string, SessionRecord>();

  async create(session: SessionRecord): Promise<void> {
    this.bySid.set(session.sid, session);
  }

  async findBySid(sid: string): Promise<SessionRecord | null> {
    return this.bySid.get(sid) ?? null;
  }

  async update(session: SessionRecord): Promise<void> {
    this.bySid.set(session.sid, session);
  }

  async revokeAllForUser(userId: string): Promise<number> {
    let revoked = 0;
    const now = Date.now();
    for (const session of this.bySid.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        this.bySid.set(session.sid, { ...session, revokedAt: now });
        revoked += 1;
      }
    }
    return revoked;
  }
}

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserRecord>();

  seed(user: UserRecord): void {
    this.byId.set(user.id, user);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    for (const user of this.byId.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }
}


export class InMemoryRiskRepository implements RiskRepository {
  private readonly records: RiskEvaluationRecord[] = [];

  async record(evaluation: RiskEvaluationRecord): Promise<void> {
    this.records.push(evaluation);
  }

  async history(entity: EntityRef, limit: number): Promise<RiskEvaluationRecord[]> {
    const key = entityKey(entity);
    return this.records
      .filter((r) => r.entity && entityKey(r.entity) === key)
      .sort((a, b) => b.evaluatedAt - a.evaluatedAt)
      .slice(0, limit);
  }

  async latest(entity: EntityRef | null): Promise<RiskEvaluationRecord | null> {
    const key = entity ? entityKey(entity) : null;
    const matches = this.records
      .filter((r) => (key === null ? r.entity === null : r.entity && entityKey(r.entity) === key))
      .sort((a, b) => b.evaluatedAt - a.evaluatedAt);
    return matches[0] ?? null;
  }

  get size(): number {
    return this.records.length;
  }
}

export class InMemoryEntityRepository implements EntityRepository {
  private readonly byKey = new Map<string, EntityRecord>();

  async upsert(entity: EntityRecord): Promise<void> {
    this.byKey.set(`${entity.kind}:${entity.id}`, entity);
  }

  async find(kind: EntityKind, id: string): Promise<EntityRecord | null> {
    return this.byKey.get(`${kind}:${id}`) ?? null;
  }

  async search(term: string, limit: number): Promise<EntityRecord[]> {
    const needle = term.toLowerCase();
    return [...this.byKey.values()]
      .filter((e) => e.id.toLowerCase().includes(needle) || e.label.toLowerCase().includes(needle))
      .slice(0, limit);
  }

  async listByKind(kind: EntityKind, limit: number): Promise<EntityRecord[]> {
    return [...this.byKey.values()].filter((e) => e.kind === kind).slice(0, limit);
  }
}

export class InMemorySafetyStateRepository implements SafetyStateRepository {
  private readonly current = new Map<string, EmergencyStopRecord>();
  private readonly audit: Array<EmergencyStopRecord & { transition: "ACTIVATED" | "RESET" }> = [];

  async find(userId: string): Promise<EmergencyStopRecord | null> {
    return this.current.get(userId) ?? null;
  }

  async save(record: EmergencyStopRecord): Promise<void> {
    this.current.set(record.userId, record);
  }

  async appendAudit(entry: EmergencyStopRecord & { transition: "ACTIVATED" | "RESET" }): Promise<void> {
    this.audit.push(entry);
  }

  async history(userId: string, limit: number): Promise<Array<EmergencyStopRecord & { transition: string }>> {
    return this.audit
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  /**
   * Test seam: returns a NEW repository sharing the same backing maps.
   *
   * This models a process restart — the service object is rebuilt from
   * scratch while storage persists, which is exactly the scenario the old
   * in-memory reader failed.
   */
  reconnect(): InMemorySafetyStateRepository {
    const next = new InMemorySafetyStateRepository();
    for (const [key, value] of this.current) next.current.set(key, value);
    for (const entry of this.audit) next.audit.push(entry);
    return next;
  }
}

/** A repository whose reads always fail, for testing fail-closed behaviour. */
export class UnreachableSafetyStateRepository implements SafetyStateRepository {
  async find(): Promise<EmergencyStopRecord | null> {
    throw new Error("database unreachable");
  }
  async save(): Promise<void> {
    throw new Error("database unreachable");
  }
  async appendAudit(): Promise<void> {
    throw new Error("database unreachable");
  }
  async history(): Promise<Array<EmergencyStopRecord & { transition: string }>> {
    throw new Error("database unreachable");
  }
}
