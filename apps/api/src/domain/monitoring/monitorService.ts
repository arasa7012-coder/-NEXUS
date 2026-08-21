/**
 * Monitor definition and management.
 *
 * The engine (scheduler, claim, backoff) already existed and is unchanged.
 * This is the definition layer that finally gives it inputs: users create
 * monitors, this validates and persists them, and the runner executes them.
 *
 * Two properties carry most of the weight:
 *
 *   1. **User isolation.** Every read and write is scoped by `userId` inside
 *      this service, not by the HTTP layer. A route that forgets to check
 *      ownership therefore cannot leak another user's monitors, because the
 *      query itself is scoped.
 *
 *   2. **Closed configuration.** A monitor is a user-supplied instruction the
 *      server executes on a schedule — the classic remote-execution surface.
 *      Targets are resolved against the entity registry and providers against
 *      the live registry; nothing user-supplied is ever used to build a URL,
 *      a path, or an expression.
 */

import type {
  EntityRef, Monitor, MonitorDraft, MonitorType,
} from "@nexus/contracts";
import { monitorDraft as monitorDraftContract, ValidationError } from "@nexus/contracts";
import type { Clock, EventPublisher } from "../../platform/events.ts";
import type { EntityService } from "../entities/entityService.ts";
import type { ProviderRegistry } from "../providers/registry.ts";
import { nextRunAt } from "./scheduler.ts";
import type { MonitorRepository } from "./scheduler.ts";

/** Storage for monitor *definitions*, scoped by owner. */
export interface MonitorDefinitionRepository extends MonitorRepository {
  create(monitor: Monitor): Promise<void>;
  findById(id: string): Promise<Monitor | null>;
  listByUser(userId: string, limit: number): Promise<Monitor[]>;
  delete(id: string): Promise<boolean>;
  countByUser(userId: string): Promise<number>;
}

export type MonitorFailureReason =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "UNSUPPORTED_TYPE"
  | "UNKNOWN_TARGET"
  | "UNKNOWN_PROVIDER"
  | "LIMIT_REACHED";

export class MonitorError extends Error {
  readonly reason: MonitorFailureReason;
  readonly fields: Array<{ path: string; message: string }>;

  constructor(reason: MonitorFailureReason, message: string, fields: Array<{ path: string; message: string }> = []) {
    super(message);
    this.reason = reason;
    this.fields = fields;
    this.name = "MonitorError";
  }
}

/**
 * Which entity kinds each monitor type may target.
 *
 * This is the security boundary for targets: a PROVIDER_HEALTH monitor cannot
 * be pointed at an arbitrary entity, and an ASSET_INTELLIGENCE monitor cannot
 * be pointed at something the intelligence engine has no runner for.
 */
const ALLOWED_TARGETS: Record<MonitorType, ReadonlyArray<EntityRef["kind"]>> = {
  ASSET_INTELLIGENCE: ["ASSET"],
  PROVIDER_HEALTH: ["PROVIDER"],
};

/** Bounds what one account can schedule against upstream providers. */
export const MAX_MONITORS_PER_USER = 50;

export class MonitorService {
  private readonly repo: MonitorDefinitionRepository;
  private readonly entities: EntityService;
  private readonly providers: ProviderRegistry;
  private readonly events: EventPublisher;
  private readonly clock: Clock;
  private readonly nextId: () => string;

  constructor(deps: {
    repo: MonitorDefinitionRepository;
    entities: EntityService;
    providers: ProviderRegistry;
    events: EventPublisher;
    clock: Clock;
    nextId: () => string;
  }) {
    this.repo = deps.repo;
    this.entities = deps.entities;
    this.providers = deps.providers;
    this.events = deps.events;
    this.clock = deps.clock;
    this.nextId = deps.nextId;
  }

  /**
   * Validate a draft against what the backend can actually execute.
   *
   * Structural validation happens in the contract; this adds the checks that
   * need live state — does the entity exist, is the provider registered, does
   * the target kind suit the type.
   */
  private async validate(draft: MonitorDraft): Promise<EntityRef> {
    let parsed: MonitorDraft;
    try {
      parsed = monitorDraftContract.parse(draft);
    } catch (error) {
      const issues = error instanceof ValidationError ? error.issues : [];
      throw new MonitorError("INVALID", "The monitor definition is invalid.", issues);
    }

    // The config discriminant must agree with the declared type, or a user
    // could submit a PROVIDER_HEALTH config under an ASSET_INTELLIGENCE type
    // and reach a code path the type check did not anticipate.
    if (parsed.config.type !== parsed.type) {
      throw new MonitorError("INVALID", "Monitor configuration does not match the monitor type.", [
        { path: "config.type", message: `expected ${parsed.type}` },
      ]);
    }

    const allowed = ALLOWED_TARGETS[parsed.type];
    if (!allowed.includes(parsed.target.kind)) {
      throw new MonitorError(
        "UNSUPPORTED_TYPE",
        `A ${parsed.type} monitor cannot target a ${parsed.target.kind}.`,
      );
    }

    // Bind the union to a local so the discriminant narrows: narrowing does
    // not survive repeated property access through `parsed`.
    const config = parsed.config;

    if (config.type === "PROVIDER_HEALTH") {
      // Resolved against the live registry — a monitor may only watch a
      // provider NEXUS actually operates.
      const known = this.providers.status().some((p) => p.providerId === config.providerId);
      if (!known) {
        throw new MonitorError("UNKNOWN_PROVIDER", "That data provider is not registered with NEXUS.");
      }
    }

    if (config.type === "ASSET_INTELLIGENCE") {
      const noTrigger =
        config.riskAtOrAbove === null
        && config.signalAtOrAbove === null
        && !config.onDataUnavailable;
      if (noTrigger) {
        // A monitor with no trigger would poll a provider forever and never
        // tell anyone anything.
        throw new MonitorError("INVALID", "A monitor must define at least one trigger condition.", [
          { path: "config", message: "no trigger condition set" },
        ]);
      }
    }

    // Targets must exist in the entity registry. This is what stops a user
    // inventing a symbol and having the server issue requests for it.
    const resolved = await this.entities.resolve(parsed.target.kind, parsed.target.id);
    if (!resolved) {
      throw new MonitorError("UNKNOWN_TARGET", "That target is not known to NEXUS.");
    }

    return resolved;
  }

  async create(userId: string, draft: MonitorDraft): Promise<Monitor> {
    const existing = await this.repo.countByUser(userId);
    if (existing >= MAX_MONITORS_PER_USER) {
      throw new MonitorError("LIMIT_REACHED", `A maximum of ${MAX_MONITORS_PER_USER} monitors is supported per account.`);
    }

    const target = await this.validate(draft);
    const now = this.clock.now();

    const monitor: Monitor = {
      id: this.nextId(),
      userId,
      name: draft.name.trim(),
      type: draft.type,
      // The registry's label wins over whatever the client sent, so a user
      // cannot mislabel an entity for everyone reading the alert later.
      target,
      config: draft.config,
      state: draft.enabled ? "ACTIVE" : "PAUSED",
      enabled: draft.enabled,
      intervalSeconds: draft.intervalSeconds,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: null,
      lastOutcome: null,
      lastFailureKind: null,
      consecutiveFailures: 0,
      detail: null,
    };
    // Due immediately when enabled: a user who just created a monitor should
    // see a result without waiting a full interval.
    monitor.nextRunAt = draft.enabled ? now : null;

    await this.repo.create(monitor);
    this.publish("MONITOR_CREATED", monitor, "INFO");
    return monitor;
  }

  /** Ownership check used by every single-monitor operation. */
  private async owned(userId: string, id: string): Promise<Monitor> {
    const monitor = await this.repo.findById(id);
    // A monitor belonging to someone else reports NOT_FOUND, never FORBIDDEN:
    // distinguishing the two confirms the id exists, which is an enumeration
    // oracle.
    if (!monitor || monitor.userId !== userId) {
      throw new MonitorError("NOT_FOUND", "That monitor does not exist.");
    }
    return monitor;
  }

  async list(userId: string, limit = 100): Promise<Monitor[]> {
    return this.repo.listByUser(userId, limit);
  }

  async get(userId: string, id: string): Promise<Monitor> {
    return this.owned(userId, id);
  }

  async update(userId: string, id: string, draft: MonitorDraft): Promise<Monitor> {
    const existing = await this.owned(userId, id);
    const target = await this.validate(draft);
    const now = this.clock.now();

    const updated: Monitor = {
      ...existing,
      name: draft.name.trim(),
      type: draft.type,
      target,
      config: draft.config,
      intervalSeconds: draft.intervalSeconds,
      enabled: draft.enabled,
      updatedAt: now,
      // Reconfiguring clears the failure streak: the previous failures relate
      // to a definition that no longer exists, and carrying the backoff over
      // would leave a fixed monitor waiting under a penalty it no longer earns.
      consecutiveFailures: 0,
      lastFailureKind: null,
      state: draft.enabled ? "ACTIVE" : "PAUSED",
    };
    updated.nextRunAt = draft.enabled ? now : null;

    await this.repo.save(updated);
    this.publish("MONITOR_UPDATED", updated, "INFO");
    return updated;
  }

  async setEnabled(userId: string, id: string, enabled: boolean): Promise<Monitor> {
    const existing = await this.owned(userId, id);
    if (existing.enabled === enabled) return existing;

    const now = this.clock.now();
    const updated: Monitor = {
      ...existing,
      enabled,
      state: enabled ? "ACTIVE" : "PAUSED",
      updatedAt: now,
      // Re-enabling clears the streak so a monitor that was stopped after
      // repeated failures gets a genuine fresh start.
      consecutiveFailures: enabled ? 0 : existing.consecutiveFailures,
      nextRunAt: enabled ? now : null,
    };

    await this.repo.save(updated);
    this.publish(enabled ? "MONITOR_ENABLED" : "MONITOR_DISABLED", updated, "INFO");
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const monitor = await this.owned(userId, id);
    await this.repo.delete(id);
    this.publish("MONITOR_DELETED", monitor, "INFO");
  }

  private publish(
    type: "MONITOR_CREATED" | "MONITOR_UPDATED" | "MONITOR_ENABLED" | "MONITOR_DISABLED" | "MONITOR_DELETED",
    monitor: Monitor,
    severity: "INFO" | "WATCH",
  ): void {
    this.events.publish({
      type,
      severity,
      summary: `Monitor "${monitor.name}" ${type.replace("MONITOR_", "").toLowerCase()}.`,
      entity: monitor.target,
      data: { monitorId: monitor.id, userId: monitor.userId, monitorType: monitor.type },
    });
  }
}

export { nextRunAt };
