/**
 * Provider abstraction and health tracking (§7, §27).
 *
 * Two jobs:
 *
 *   1. Keep external providers behind an adapter interface, so adding or
 *      replacing one never reaches the intelligence layer or the UI.
 *
 *   2. Refuse to hammer a failing provider, and — critically — never let a
 *      provider failure become invented data. A failed fetch returns an
 *      UNAVAILABLE origin with a stated reason. There is no code path here
 *      that substitutes a last-known value while claiming freshness.
 *
 * The breaker is deliberately simple: N consecutive failures opens it for a
 * cooldown, one trial request closes it. Clock is injected, so the whole thing
 * is testable without waiting in real time.
 */

import type { DataOrigin, ProviderState, ProviderStatus } from "@nexus/contracts";
import type { Clock, EventPublisher } from "../../platform/events.ts";

export interface ProviderResult<T> {
  data: T | null;
  origin: DataOrigin;
}

/** What every external data source must implement. Nothing else may vary. */
export interface DataProvider<TQuery, TData> {
  readonly id: string;
  readonly displayName: string;
  /** False when required configuration (an API key) is absent. */
  isConfigured(): boolean;
  fetch(query: TQuery): Promise<{ data: TData; observedAt: number | null }>;
}

interface Health {
  state: ProviderState;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  latencySamples: number[];
  detail: string | null;
  openedAt: number | null;
}

export interface BreakerPolicy {
  failureThreshold: number;
  cooldownMs: number;
  /** Above this, the provider is DEGRADED even while succeeding. */
  slowLatencyMs: number;
}

export const DEFAULT_BREAKER: BreakerPolicy = {
  failureThreshold: 3,
  cooldownMs: 60_000,
  slowLatencyMs: 2_000,
};

const LATENCY_WINDOW = 20;

export class ProviderRegistry {
  private readonly providers = new Map<string, DataProvider<unknown, unknown>>();
  private readonly health = new Map<string, Health>();
  private readonly clock: Clock;
  private readonly events: EventPublisher | null;
  private readonly policy: BreakerPolicy;

  constructor(deps: { clock: Clock; events?: EventPublisher; policy?: BreakerPolicy }) {
    this.clock = deps.clock;
    this.events = deps.events ?? null;
    this.policy = deps.policy ?? DEFAULT_BREAKER;
  }

  register<TQuery, TData>(provider: DataProvider<TQuery, TData>): void {
    this.providers.set(provider.id, provider as DataProvider<unknown, unknown>);
    this.health.set(provider.id, {
      state: provider.isConfigured() ? "OPERATIONAL" : "UNCONFIGURED",
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      latencySamples: [],
      detail: provider.isConfigured() ? null : "No credentials configured for this provider.",
      openedAt: null,
    });
  }

  /**
   * Execute a provider call. Never throws for provider-side failure — the
   * failure is expressed in the returned origin, because a thrown error tends
   * to get caught somewhere upstream and turned into a silent empty state.
   */
  async execute<TQuery, TData>(providerId: string, query: TQuery): Promise<ProviderResult<TData>> {
    const provider = this.providers.get(providerId) as DataProvider<TQuery, TData> | undefined;
    if (!provider) {
      return { data: null, origin: this.unavailable(null, `No provider is registered under "${providerId}".`) };
    }

    const health = this.health.get(providerId)!;
    const now = this.clock.now();

    if (!provider.isConfigured()) {
      return { data: null, origin: this.unavailable(providerId, "This provider has no credentials configured.") };
    }

    if (health.state === "FAILING" && health.openedAt !== null) {
      const elapsed = now - health.openedAt;
      if (elapsed < this.policy.cooldownMs) {
        const wait = Math.ceil((this.policy.cooldownMs - elapsed) / 1000);
        return {
          data: null,
          origin: this.unavailable(
            providerId,
            `Provider is in cooldown after ${health.consecutiveFailures} consecutive failures; retrying in ${wait}s.`,
          ),
        };
      }
      // Cooldown elapsed — allow exactly one trial request through.
    }

    const startedAt = this.clock.now();
    try {
      const { data, observedAt } = await provider.fetch(query);
      this.recordSuccess(providerId, this.clock.now() - startedAt);
      return {
        data,
        origin: {
          freshness: "LIVE",
          providerId,
          observedAt,
          cachedAt: this.clock.now(),
          reason: null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider failure.";
      this.recordFailure(providerId, message);
      return { data: null, origin: this.unavailable(providerId, `Provider request failed: ${message}`) };
    }
  }

  private unavailable(providerId: string | null, reason: string): DataOrigin {
    return { freshness: "UNAVAILABLE", providerId, observedAt: null, cachedAt: null, reason };
  }

  private recordSuccess(providerId: string, latencyMs: number): void {
    const health = this.health.get(providerId)!;
    const wasFailing = health.state === "FAILING";

    health.lastSuccessAt = this.clock.now();
    health.consecutiveFailures = 0;
    health.openedAt = null;
    health.latencySamples.push(latencyMs);
    if (health.latencySamples.length > LATENCY_WINDOW) health.latencySamples.shift();

    const slow = latencyMs > this.policy.slowLatencyMs;
    health.state = slow ? "DEGRADED" : "OPERATIONAL";
    health.detail = slow ? `Response took ${Math.round(latencyMs)}ms.` : null;

    if (wasFailing) {
      this.events?.publish({
        type: "SYSTEM_WARNING",
        severity: "INFO",
        summary: `Provider ${providerId} recovered.`,
        data: { providerId },
      });
    }
  }

  private recordFailure(providerId: string, message: string): void {
    const health = this.health.get(providerId)!;
    health.lastFailureAt = this.clock.now();
    health.consecutiveFailures += 1;
    health.detail = message.slice(0, 280);

    if (health.consecutiveFailures >= this.policy.failureThreshold) {
      const alreadyOpen = health.state === "FAILING";
      health.state = "FAILING";
      health.openedAt = this.clock.now();
      if (!alreadyOpen) {
        this.events?.publish({
          type: "PROVIDER_ERROR",
          severity: "WARNING",
          summary: `Provider ${providerId} is failing.`,
          data: { providerId, consecutiveFailures: health.consecutiveFailures, detail: health.detail },
        });
      }
    } else {
      health.state = "DEGRADED";
    }
  }

  status(): ProviderStatus[] {
    return [...this.providers.values()].map((provider) => {
      const health = this.health.get(provider.id)!;
      return {
        providerId: provider.id,
        displayName: provider.displayName,
        state: health.state,
        lastSuccessAt: health.lastSuccessAt,
        lastFailureAt: health.lastFailureAt,
        consecutiveFailures: health.consecutiveFailures,
        latencyMs: median(health.latencySamples),
        detail: health.detail,
      };
    });
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : Math.round(sorted[mid]!);
}
