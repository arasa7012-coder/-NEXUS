/**
 * Alert domain service (§12).
 *
 * The behaviour that matters is de-duplication. A monitor evaluating every
 * 30 seconds will observe the same condition repeatedly; naively that produces
 * an alert per evaluation, the user stops reading them, and the system becomes
 * worse than useless precisely when it matters.
 *
 * Instead every raised condition carries a content-addressed `dedupeKey` from
 * @nexus/core. Raising an existing open condition increments `occurrences` and
 * refreshes `updatedAt` — it does not create a second alert. Raising a
 * *resolved* condition opens a new one, because a condition that cleared and
 * returned is genuinely new information.
 *
 * The service owns policy only. Storage sits behind AlertRepository, so this
 * file is fully testable without a database.
 */

import { dedupeKey, IdSequence, timeBucket } from "@nexus/core";
import type { Alert, AlertStatus, EntityRef, Severity } from "@nexus/contracts";
import { entityKey } from "@nexus/contracts";
import type { Clock, EventPublisher } from "../../platform/events.ts";

export interface AlertRepository {
  findOpenByDedupeKey(key: string): Promise<Alert | null>;
  insert(alert: Alert): Promise<void>;
  update(alert: Alert): Promise<void>;
  findById(id: string): Promise<Alert | null>;
  list(filter: { status?: AlertStatus; limit: number }): Promise<Alert[]>;
  countUnread(): Promise<number>;
}

export interface RaiseAlertInput {
  /** Subsystem raising this — "risk-engine", "monitor", "provider-health". */
  source: string;
  /** The specific check that fired. Part of the identity. */
  rule: string;
  severity: Severity;
  title: string;
  /** Required. An alert that cannot explain itself should not be raised. */
  explanation: string;
  entity?: EntityRef | null;
  priority?: number;
  /**
   * Collapse window. Within it, repeats fold into one alert. Omit to collapse
   * for as long as the alert stays open, regardless of elapsed time.
   */
  collapseWindowMs?: number;
  correlationId?: string | null;
}

const DEFAULT_PRIORITY: Record<Severity, number> = {
  CRITICAL: 900,
  WARNING: 600,
  WATCH: 300,
  INFO: 100,
};

export class AlertService {
  private readonly repo: AlertRepository;
  private readonly events: EventPublisher;
  private readonly ids: IdSequence;
  private readonly clock: Clock;

  constructor(deps: { repo: AlertRepository; events: EventPublisher; ids: IdSequence; clock: Clock }) {
    this.repo = deps.repo;
    this.events = deps.events;
    this.ids = deps.ids;
    this.clock = deps.clock;
  }

  /**
   * Raise a condition. Returns the alert and whether it was newly created,
   * so callers can decide whether a notification is warranted — a repeat
   * usually is not.
   */
  async raise(input: RaiseAlertInput): Promise<{ alert: Alert; created: boolean }> {
    if (!input.explanation.trim()) {
      throw new Error("An alert must carry an explanation; refusing to raise an unexplained alert.");
    }

    const now = this.clock.now();
    const key = dedupeKey({
      producer: input.source,
      rule: input.rule,
      entity: input.entity ? entityKey(input.entity) : "system",
      ...(input.collapseWindowMs === undefined
        ? {}
        : { bucket: timeBucket(now, input.collapseWindowMs) }),
    });

    const existing = await this.repo.findOpenByDedupeKey(key);
    if (existing) {
      const updated: Alert = {
        ...existing,
        updatedAt: now,
        occurrences: existing.occurrences + 1,
        // An escalating condition must be allowed to raise its own severity,
        // but a repeat must never quietly downgrade an existing warning.
        severity: rank(input.severity) > rank(existing.severity) ? input.severity : existing.severity,
      };
      await this.repo.update(updated);
      return { alert: updated, created: false };
    }

    const alert: Alert = {
      id: this.ids.next(now),
      dedupeKey: key,
      createdAt: now,
      updatedAt: now,
      severity: input.severity,
      priority: input.priority ?? DEFAULT_PRIORITY[input.severity],
      title: input.title,
      explanation: input.explanation,
      source: input.source,
      entity: input.entity ?? null,
      status: "OPEN",
      read: false,
      acknowledgedAt: null,
      resolvedAt: null,
      occurrences: 1,
      history: [{ at: now, status: "OPEN", note: null }],
    };

    await this.repo.insert(alert);
    this.events.publish({
      type: "ALERT_CREATED",
      severity: alert.severity,
      summary: alert.title,
      entity: alert.entity,
      data: { alertId: alert.id, dedupeKey: alert.dedupeKey, rule: input.rule },
      correlationId: input.correlationId ?? null,
    });

    return { alert, created: true };
  }

  async acknowledge(id: string, note: string | null = null): Promise<Alert> {
    const alert = await this.mustFind(id);
    if (alert.status !== "OPEN") return alert;

    const now = this.clock.now();
    const updated: Alert = {
      ...alert,
      status: "ACKNOWLEDGED",
      acknowledgedAt: now,
      updatedAt: now,
      read: true,
      history: [...alert.history, { at: now, status: "ACKNOWLEDGED", note }],
    };
    await this.repo.update(updated);
    this.events.publish({
      type: "ALERT_ACKNOWLEDGED",
      severity: "INFO",
      summary: `Acknowledged: ${alert.title}`,
      entity: alert.entity,
      data: { alertId: alert.id },
    });
    return updated;
  }

  async resolve(id: string, note: string | null = null): Promise<Alert> {
    const alert = await this.mustFind(id);
    if (alert.status === "RESOLVED") return alert;

    const now = this.clock.now();
    const updated: Alert = {
      ...alert,
      status: "RESOLVED",
      resolvedAt: now,
      updatedAt: now,
      read: true,
      history: [...alert.history, { at: now, status: "RESOLVED", note }],
    };
    await this.repo.update(updated);
    this.events.publish({
      type: "ALERT_RESOLVED",
      severity: "INFO",
      summary: `Resolved: ${alert.title}`,
      entity: alert.entity,
      data: { alertId: alert.id, occurrences: alert.occurrences },
    });
    return updated;
  }

  private async mustFind(id: string): Promise<Alert> {
    const alert = await this.repo.findById(id);
    if (!alert) throw new Error(`Alert ${id} was not found.`);
    return alert;
  }
}

function rank(severity: Severity): number {
  return { INFO: 0, WATCH: 1, WARNING: 2, CRITICAL: 3 }[severity];
}
