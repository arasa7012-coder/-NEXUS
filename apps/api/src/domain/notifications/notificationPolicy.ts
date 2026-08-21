/**
 * Push notification policy (§18).
 *
 * The backend decides whether an event deserves a notification; the mobile app
 * only receives and displays. That division matters beyond tidiness:
 * notification rules change often, and a rule living in the app cannot be
 * changed without an App Store release.
 *
 * The policy is a pure function of an event plus user preferences, so every
 * rule below is testable without a device or a push service.
 */

import type { NexusEvent, Severity } from "@nexus/contracts";

export interface NotificationPreferences {
  /** Nothing below this severity notifies. */
  minimumSeverity: Severity;
  criticalAlerts: boolean;
  monitorFailures: boolean;
  providerErrors: boolean;
  /** Local minutes-from-midnight window in which only CRITICAL breaks through. */
  quietHours: { startMinute: number; endMinute: number } | null;
  timezoneOffsetMinutes: number;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  minimumSeverity: "WARNING",
  criticalAlerts: true,
  monitorFailures: true,
  providerErrors: false,
  quietHours: null,
  timezoneOffsetMinutes: 0,
};

export interface NotificationDecision {
  send: boolean;
  /** Always populated — a suppressed notification is as worth explaining as a sent one. */
  reason: string;
  title?: string;
  body?: string;
  /** Collapse key: a repeat replaces the previous notification in the tray. */
  collapseKey?: string;
}

const RANK: Record<Severity, number> = { INFO: 0, WATCH: 1, WARNING: 2, CRITICAL: 3 };

function inQuietHours(prefs: NotificationPreferences, atMs: number): boolean {
  if (!prefs.quietHours) return false;
  const local = new Date(atMs + prefs.timezoneOffsetMinutes * 60_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const { startMinute, endMinute } = prefs.quietHours;
  // A window crossing midnight is the normal case, so handle it explicitly.
  return startMinute <= endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;
}

export function decideNotification(
  event: NexusEvent,
  prefs: NotificationPreferences,
  atMs: number,
): NotificationDecision {
  const notifiable: Record<string, boolean> = {
    ALERT_CREATED: prefs.criticalAlerts,
    MONITOR_STOPPED: prefs.monitorFailures,
    PROVIDER_ERROR: prefs.providerErrors,
    SYSTEM_ERROR: true,
  };

  if (!(event.type in notifiable)) {
    return { send: false, reason: `${event.type} is not a notifying event type.` };
  }
  if (!notifiable[event.type]) {
    return { send: false, reason: `The user has disabled notifications for ${event.type}.` };
  }
  if (RANK[event.severity] < RANK[prefs.minimumSeverity]) {
    return { send: false, reason: `Severity ${event.severity} is below the user's minimum of ${prefs.minimumSeverity}.` };
  }
  // CRITICAL always breaks through: quiet hours suppress noise, they do not
  // withhold the one class of event the product exists to deliver.
  if (inQuietHours(prefs, atMs) && event.severity !== "CRITICAL") {
    return { send: false, reason: "Suppressed by quiet hours; only CRITICAL breaks through." };
  }

  return {
    send: true,
    reason: `${event.severity} ${event.type} meets the user's notification policy.`,
    title: event.severity === "CRITICAL" ? "NEXUS — Critical" : "NEXUS",
    body: event.summary,
    // Collapse on the entity so a re-fired condition replaces rather than
    // stacks, mirroring alert de-duplication in the notification tray.
    collapseKey: event.entity ? `${event.entity.kind}:${event.entity.id}` : event.type,
  };
}
