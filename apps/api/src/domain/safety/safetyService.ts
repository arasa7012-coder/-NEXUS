/**
 * Emergency Stop — persistent, authoritative state.
 *
 * Previously an in-memory reader, which meant an API restart silently cleared
 * an active stop. For a system whose entire purpose is refusing to act when
 * something is wrong, that is the most dangerous possible failure mode: the
 * operator believes trading is halted while the process has quietly forgotten.
 *
 * Two rules follow from that:
 *
 *   1. **The repository is the single source of truth.** Nothing is cached in
 *      process memory, because a cache is exactly what a restart clears.
 *   2. **Failing to read the state means assume STOPPED.** If the database is
 *      unreachable we cannot prove the stop is clear, and proceeding on an
 *      unprovable assumption is how an emergency stop gets bypassed.
 *
 * The state transitions themselves are unchanged — they come from
 * @nexus/core's pure `activateEmergencyStopTransition` / `reset…`, which are
 * already tested. This service adds persistence, audit and event emission.
 */

import {
  activateEmergencyStopTransition,
  resetEmergencyStopTransition,
  SafetyStateError,
} from "@nexus/core";
import type { EmergencyStopState } from "@nexus/core";
import type { EmergencyStopView } from "@nexus/contracts";
import type { Clock, EventPublisher } from "../../platform/events.ts";
import type { Logger } from "../../platform/logger.ts";

/** One audit row per change. Append-only; nothing is ever overwritten. */
export interface EmergencyStopRecord {
  userId: string;
  active: boolean;
  reason: string | null;
  activatedAt: number | null;
  resetAt: number | null;
  /** Who caused the change — a user id, or a system component name. */
  actor: string | null;
  updatedAt: number;
}

export interface SafetyStateRepository {
  /** Current state, or null when the user has never had one. */
  find(userId: string): Promise<EmergencyStopRecord | null>;
  save(record: EmergencyStopRecord): Promise<void>;
  /** Append-only audit trail, newest first. */
  appendAudit(entry: EmergencyStopRecord & { transition: "ACTIVATED" | "RESET" }): Promise<void>;
  history(userId: string, limit: number): Promise<Array<EmergencyStopRecord & { transition: string }>>;
}

/** The reader the monitoring runner consults before executing anything. */
export interface SafetyStateReader {
  isEmergencyStopActive(userId: string): Promise<boolean>;
}

const CLEAR: EmergencyStopState = { active: false, reason: null, activatedAt: null, resetAt: null };

export class SafetyService implements SafetyStateReader {
  private readonly repo: SafetyStateRepository;
  private readonly events: EventPublisher;
  private readonly clock: Clock;
  private readonly logger: Logger | null;

  constructor(deps: {
    repo: SafetyStateRepository;
    events: EventPublisher;
    clock: Clock;
    logger?: Logger;
  }) {
    this.repo = deps.repo;
    this.events = deps.events;
    this.clock = deps.clock;
    this.logger = deps.logger ?? null;
  }

  private toState(record: EmergencyStopRecord | null): EmergencyStopState {
    if (!record) return CLEAR;
    return {
      active: record.active,
      reason: record.reason,
      activatedAt: record.activatedAt,
      resetAt: record.resetAt,
    };
  }

  /**
   * Fail closed.
   *
   * A read failure returns `true` (stopped). The alternative — treating an
   * unreachable database as "no stop configured" — would let an infrastructure
   * outage silently re-enable a system an operator had deliberately halted.
   */
  async isEmergencyStopActive(userId: string): Promise<boolean> {
    try {
      const record = await this.repo.find(userId);
      return record?.active ?? false;
    } catch (error) {
      this.logger?.error("emergency stop state unreadable; failing closed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  async current(userId: string): Promise<EmergencyStopView> {
    const record = await this.repo.find(userId);
    return {
      active: record?.active ?? false,
      reason: record?.reason ?? null,
      activatedAt: record?.activatedAt ?? null,
      resetAt: record?.resetAt ?? null,
      actor: record?.actor ?? null,
    };
  }

  async activate(input: { userId: string; reason: string; actor: string }): Promise<EmergencyStopView> {
    const now = this.clock.now();
    const existing = await this.repo.find(input.userId);

    // Validation and the transition rule both live in the core.
    const transition = activateEmergencyStopTransition(this.toState(existing), input.reason, now);

    if (!transition.changed) {
      // Already active. Re-activating is a no-op rather than an error: an
      // operator hitting the button twice under pressure must not see a
      // failure that suggests the stop did not take.
      return this.current(input.userId);
    }

    const record: EmergencyStopRecord = {
      userId: input.userId,
      active: true,
      reason: transition.state.reason,
      activatedAt: transition.state.activatedAt,
      resetAt: null,
      actor: input.actor,
      updatedAt: now,
    };

    await this.repo.save(record);
    await this.repo.appendAudit({ ...record, transition: "ACTIVATED" });

    this.events.publish({
      type: "EMERGENCY_STOP_ACTIVATED",
      severity: "CRITICAL",
      summary: `Emergency Stop activated: ${record.reason}`,
      data: { userId: input.userId, actor: input.actor, reason: record.reason },
    });
    this.logger?.warn("emergency stop activated", { userId: input.userId, actor: input.actor });

    return this.current(input.userId);
  }

  async reset(input: { userId: string; actor: string }): Promise<EmergencyStopView> {
    const now = this.clock.now();
    const existing = await this.repo.find(input.userId);
    const transition = resetEmergencyStopTransition(this.toState(existing), now);

    if (!transition.changed) return this.current(input.userId);

    const record: EmergencyStopRecord = {
      userId: input.userId,
      active: false,
      reason: null,
      activatedAt: transition.state.activatedAt,
      resetAt: now,
      actor: input.actor,
      updatedAt: now,
    };

    await this.repo.save(record);
    await this.repo.appendAudit({ ...record, transition: "RESET" });

    this.events.publish({
      type: "EMERGENCY_STOP_RESET",
      severity: "WARNING",
      summary: "Emergency Stop reset; monitoring resumes.",
      data: { userId: input.userId, actor: input.actor },
    });
    this.logger?.warn("emergency stop reset", { userId: input.userId, actor: input.actor });

    return this.current(input.userId);
  }

  async history(userId: string, limit = 50): Promise<Array<EmergencyStopRecord & { transition: string }>> {
    return this.repo.history(userId, limit);
  }
}

export { SafetyStateError };
