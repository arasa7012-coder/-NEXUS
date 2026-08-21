/**
 * Mobile state.
 *
 * Deliberately NOT one global store. Each domain owns its own slice with its
 * own loading and error state, because a failure fetching monitors must not
 * blank the alerts list, and a realtime alert must not invalidate risk.
 *
 * Written as plain observable stores rather than a state library: they hold no
 * React dependency, so every reducer below is directly testable, and the React
 * binding is a four-line `useSyncExternalStore` hook.
 *
 * The realtime reducers are the important part. An incoming event patches the
 * relevant slice in place — the app never refetches everything on every event,
 * which on a metered mobile connection would be both slow and expensive.
 */

import type {
  Alert,
  AssetIntelligenceView,
  CommandCenterView,
  EmergencyStopView,
  Monitor,
  NexusError,
  NexusEvent,
  RiskView,
} from "@nexus/contracts";
import { compareAlerts } from "@nexus/contracts";
import type { ConnectionState } from "../api/realtime.ts";

// --- store primitive -------------------------------------------------------

export type Listener = () => void;

export class Store<T> {
  private value: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    // Reference equality guards a re-render storm when an event changes nothing.
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const listener of this.listeners) listener();
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Every remote slice carries the same four states the UI must distinguish. */
export interface RemoteSlice<T> {
  data: T | null;
  error: NexusError | null;
  loading: boolean;
  /** When the data was received. Drives the stale indicator. */
  receivedAt: number | null;
}

export function emptySlice<T>(): RemoteSlice<T> {
  return { data: null, error: null, loading: false, receivedAt: null };
}

/**
 * Apply a fetch result.
 *
 * On failure, existing data is KEPT and the error surfaced alongside it, so
 * the UI can show last-known state behind a stale marker. Blanking the screen
 * discards information the user still has; presenting old data as current
 * violates §19. Returning both is the only correct option.
 */
export function applyResult<T>(
  slice: RemoteSlice<T>,
  result: { ok: true; data: T } | { ok: false; error: NexusError },
  now: number,
): RemoteSlice<T> {
  return result.ok
    ? { data: result.data, error: null, loading: false, receivedAt: now }
    : { ...slice, error: result.error, loading: false };
}

/** How old data may be before it must be labelled stale. */
export const STALE_AFTER_MS = 90_000;

export function isStale<T>(slice: RemoteSlice<T>, now: number): boolean {
  if (slice.receivedAt === null) return false;
  return now - slice.receivedAt > STALE_AFTER_MS;
}

// --- session ---------------------------------------------------------------

export interface SessionState {
  status: "UNKNOWN" | "AUTHENTICATED" | "ANONYMOUS";
  userId: string | null;
  roles: string[];
}

export const sessionStore = new Store<SessionState>({ status: "UNKNOWN", userId: null, roles: [] });

// --- connection ------------------------------------------------------------

export const connectionStore = new Store<ConnectionState>("IDLE");

// --- domain slices ---------------------------------------------------------

export const commandCenterStore = new Store<RemoteSlice<CommandCenterView>>(emptySlice());
export const alertsStore = new Store<RemoteSlice<Alert[]>>(emptySlice());
export const riskStore = new Store<RemoteSlice<RiskView>>(emptySlice());
export const intelligenceStore = new Store<RemoteSlice<AssetIntelligenceView>>(emptySlice());
export const monitorsStore = new Store<RemoteSlice<Monitor[]>>(emptySlice());
export const eventsStore = new Store<NexusEvent[]>([]);
export const emergencyStopStore = new Store<RemoteSlice<EmergencyStopView>>(emptySlice());

// --- realtime reducers -----------------------------------------------------

/**
 * Insert or replace an alert, preserving canonical ordering.
 *
 * Replacement by id is what makes de-duplication visible in the UI: when the
 * backend collapses a repeat and bumps `occurrences`, the existing row updates
 * in place rather than a second row appearing.
 */
export function upsertAlert(list: Alert[], incoming: Alert): Alert[] {
  const index = list.findIndex((a) => a.id === incoming.id);
  const next = index === -1 ? [incoming, ...list] : list.map((a) => (a.id === incoming.id ? incoming : a));
  return next.sort(compareAlerts);
}

export const MAX_EVENT_FEED = 50;

export interface RealtimeHandlers {
  /** Fetches one alert by id when an event references an alert we lack. */
  fetchAlert?: (alertId: string) => void;
  refreshRisk?: () => void;
  refreshIntelligence?: () => void;
  refreshMonitors?: () => void;
}

/**
 * Derives a monitor's new display state from the event alone.
 *
 * Only fields the event genuinely establishes are changed — the rest of the
 * row is left untouched rather than being blanked or invented.
 */
function patchMonitor(current: Monitor, event: NexusEvent): Monitor {
  switch (event.type) {
    case "MONITOR_STOPPED":
      return { ...current, state: "STOPPED" };
    case "MONITOR_STARTED":
    case "MONITOR_ENABLED":
      return { ...current, state: "ACTIVE", enabled: true };
    case "MONITOR_DISABLED":
      return { ...current, state: "PAUSED", enabled: false };
    case "MONITOR_FAILED":
      return {
        ...current,
        state: "FAILING",
        lastOutcome: "ERROR",
        lastFailureKind:
          typeof event.data?.failureKind === "string"
            ? (event.data.failureKind as Monitor["lastFailureKind"])
            : current.lastFailureKind,
        detail: typeof event.data?.detail === "string" ? event.data.detail : current.detail,
      };
    case "MONITOR_RECOVERED":
      return { ...current, state: "ACTIVE", consecutiveFailures: 0, lastFailureKind: null };
    default:
      return current;
  }
}

/**
 * Route one realtime event into the relevant slices.
 *
 * Returns which slices it touched, so tests can assert that an event does NOT
 * disturb unrelated state — the property that keeps the app from re-rendering
 * everything on every tick.
 */
export function applyRealtimeEvent(
  event: NexusEvent,
  handlers: RealtimeHandlers = {},
): string[] {
  const touched: string[] = [];

  // The activity feed receives everything; it is the audit surface.
  eventsStore.update((feed) => [event, ...feed].slice(0, MAX_EVENT_FEED));
  touched.push("events");

  switch (event.type) {
    case "ALERT_CREATED":
    case "ALERT_ACKNOWLEDGED":
    case "ALERT_RESOLVED": {
      const alertId = event.data?.alertId;
      if (typeof alertId === "string") {
        // The event carries identity, not the full alert. Fetching the one
        // record keeps the payload small and the client authoritative-free.
        handlers.fetchAlert?.(alertId);
        touched.push("alerts");
      }
      // The unread badge is derivable immediately; no round trip needed.
      commandCenterStore.update((slice) => {
        if (!slice.data || event.type !== "ALERT_CREATED") return slice;
        return {
          ...slice,
          data: { ...slice.data, unreadAlertCount: slice.data.unreadAlertCount + 1 },
        };
      });
      touched.push("commandCenter");
      break;
    }

    case "RISK_CHANGED": {
      handlers.refreshRisk?.();
      touched.push("risk");
      break;
    }

    case "SIGNAL_CREATED":
    case "SIGNAL_UPDATED": {
      handlers.refreshIntelligence?.();
      touched.push("intelligence");
      break;
    }

    case "MONITOR_STARTED":
    case "MONITOR_STOPPED":
    case "MONITOR_ENABLED":
    case "MONITOR_DISABLED":
    case "MONITOR_FAILED":
    case "MONITOR_RECOVERED": {
      // Patch the one row in place. Refetching the whole list on every monitor
      // tick would be wasteful on a metered connection and would blank a list
      // the user may be scrolling.
      const monitorId = event.data?.monitorId;
      if (typeof monitorId === "string") {
        monitorsStore.update((slice) => {
          if (!slice.data) return slice;
          return {
            ...slice,
            data: slice.data.map((m) => (m.id === monitorId ? patchMonitor(m, event) : m)),
          };
        });
        touched.push("monitors");
      }
      break;
    }

    case "MONITOR_CREATED":
    case "MONITOR_UPDATED": {
      // The event carries identity, not the full record: a created or
      // reconfigured monitor is fetched once rather than guessed at.
      const monitorId = event.data?.monitorId;
      if (typeof monitorId === "string") {
        handlers.refreshMonitors?.();
        touched.push("monitors");
      }
      break;
    }

    case "MONITOR_DELETED": {
      const monitorId = event.data?.monitorId;
      if (typeof monitorId === "string") {
        monitorsStore.update((slice) => {
          if (!slice.data) return slice;
          return { ...slice, data: slice.data.filter((m) => m.id !== monitorId) };
        });
        touched.push("monitors");
      }
      break;
    }

    case "EMERGENCY_STOP_ACTIVATED":
    case "EMERGENCY_STOP_RESET": {
      const active = event.type === "EMERGENCY_STOP_ACTIVATED";
      emergencyStopStore.update((slice) =>
        slice.data ? { ...slice, data: { ...slice.data, active } } : slice,
      );
      touched.push("emergencyStop");
      break;
    }

    case "PROVIDER_ERROR": {
      const providerId = event.data?.providerId;
      if (typeof providerId === "string") {
        commandCenterStore.update((slice) => {
          if (!slice.data) return slice;
          return {
            ...slice,
            data: {
              ...slice.data,
              systemState: slice.data.systemState === "CRITICAL" ? "CRITICAL" : "DEGRADED",
              providers: slice.data.providers.map((p) =>
                p.providerId === providerId ? { ...p, state: "FAILING" } : p,
              ),
            },
          };
        });
        touched.push("commandCenter");
      }
      break;
    }

    default:
      // DATA_UPDATED, SYSTEM_WARNING, SYSTEM_ERROR reach the feed only.
      break;
  }

  return touched;
}

/** Test seam: reset every slice between cases. */
export function resetAllStores(): void {
  commandCenterStore.set(emptySlice());
  alertsStore.set(emptySlice());
  riskStore.set(emptySlice());
  intelligenceStore.set(emptySlice());
  monitorsStore.set(emptySlice());
  emergencyStopStore.set(emptySlice());
  eventsStore.set([]);
  connectionStore.set("IDLE");
  sessionStore.set({ status: "UNKNOWN", userId: null, roles: [] });
}
