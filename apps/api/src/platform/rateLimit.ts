/**
 * Rate limiting — token bucket.
 *
 * Chosen over a fixed window because a fixed window permits a burst of 2N
 * requests across a boundary (N at 59.9s, N at 60.0s), which is exactly the
 * shape of a credential-stuffing run. A bucket smooths that out.
 *
 * The clock is injected, so limit and refill behaviour are assertable without
 * sleeping. In-memory for a single instance; the interface is the seam for a
 * Redis-backed implementation when the API runs more than one process.
 */

import type { Clock } from "./events.ts";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next token — for the Retry-After header. */
  retryAfterSec: number;
}

export interface RateLimitPolicy {
  /** Bucket size: the largest burst permitted. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
}

/**
 * The rate-limiting contract.
 *
 * Defined before any implementation, because the important property is not how
 * tokens are counted but *where the count lives*. An in-memory limiter behind
 * N replicas yields roughly N× the intended limit — the credential-stuffing
 * surface silently widens with every instance added.
 *
 *   RateLimiter (interface)
 *     ├─ InMemoryRateLimiter   single process: development, tests
 *     └─ SharedStoreRateLimiter  any atomic counter store: production
 *
 * The shared implementation deliberately does not name a vendor. It requires
 * one primitive — an atomic increment with expiry — which Redis, Valkey,
 * DynamoDB, Cloudflare KV and a SQL table can all provide. Committing to a
 * dependency here would be premature.
 */
export interface RateLimiter {
  check(key: string, policy: RateLimitPolicy, cost?: number): Promise<RateLimitDecision> | RateLimitDecision;
  /** Clears a key. Used after a successful login so one failure streak does not linger. */
  reset(key: string): Promise<void> | void;
}

/**
 * The single primitive a distributed backend must supply: increment a counter
 * within a fixed window and return the new total, atomically.
 *
 * Atomicity is the whole requirement. A read-then-write leaves a race in which
 * two replicas both observe "under the limit" and both allow the request.
 */
export interface CounterStore {
  /** @returns the counter value after incrementing, and when the window ends. */
  increment(key: string, windowMs: number, amount: number): Promise<{ count: number; resetAtMs: number }>;
  delete(key: string): Promise<void>;
}

/** Login is limited far harder than reads: it is the credential-guessing surface. */
export const POLICIES = {
  auth: { capacity: 5, refillPerSec: 5 / 300 },      // ~5 attempts per 5 minutes
  read: { capacity: 120, refillPerSec: 2 },           // 120 burst, 2/s sustained
  write: { capacity: 30, refillPerSec: 0.5 },
} as const satisfies Record<string, RateLimitPolicy>;

interface Bucket { tokens: number; lastRefillMs: number }

export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly clock: Clock;
  private lastSweep = 0;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  check(key: string, policy: RateLimitPolicy, cost = 1): RateLimitDecision {
    const now = this.clock.now();
    this.sweep(now);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: policy.capacity, lastRefillMs: now };
      this.buckets.set(key, bucket);
    }

    const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
    bucket.tokens = Math.min(policy.capacity, bucket.tokens + elapsedSec * policy.refillPerSec);
    bucket.lastRefillMs = now;

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSec: 0 };
    }

    const deficit = cost - bucket.tokens;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(deficit / policy.refillPerSec)),
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Drop idle buckets so a stream of unique keys cannot exhaust memory. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefillMs > 3_600_000) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}


/**
 * Replica-safe limiter over a shared atomic counter.
 *
 * Uses a fixed window rather than a token bucket, because a window needs only
 * one atomic operation per request while a distributed bucket needs a
 * read-modify-write (or a server-side script) to stay correct. The known
 * trade-off is burst tolerance at a window boundary; `capacity` is therefore
 * interpreted as "requests per window", and windows are kept short.
 *
 * NOT VERIFIED AGAINST A REAL STORE IN THIS ENVIRONMENT — no external store is
 * reachable here. The logic is verified against an in-process CounterStore
 * that several logical instances share, which is what proves replicas observe
 * one limit rather than one each.
 */
export class SharedStoreRateLimiter implements RateLimiter {
  private readonly store: CounterStore;
  private readonly clock: Clock;
  private readonly namespace: string;

  constructor(deps: { store: CounterStore; clock: Clock; namespace?: string }) {
    this.store = deps.store;
    this.clock = deps.clock;
    this.namespace = deps.namespace ?? "rl";
  }

  private windowMs(policy: RateLimitPolicy): number {
    // Derive the window from the policy so both implementations express the
    // same intent: capacity tokens refilled at refillPerSec.
    return Math.max(1000, Math.round((policy.capacity / policy.refillPerSec) * 1000));
  }

  async check(key: string, policy: RateLimitPolicy, cost = 1): Promise<RateLimitDecision> {
    const windowMs = this.windowMs(policy);
    const bucketStart = Math.floor(this.clock.now() / windowMs) * windowMs;
    const storeKey = `${this.namespace}:${key}:${bucketStart}`;

    const { count, resetAtMs } = await this.store.increment(storeKey, windowMs, cost);

    if (count <= policy.capacity) {
      return { allowed: true, remaining: Math.max(0, policy.capacity - count), retryAfterSec: 0 };
    }

    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((resetAtMs - this.clock.now()) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    // Only the current window is cleared; earlier windows expire on their own.
    const policyAgnosticWindow = 60_000;
    const bucketStart = Math.floor(this.clock.now() / policyAgnosticWindow) * policyAgnosticWindow;
    await this.store.delete(`${this.namespace}:${key}:${bucketStart}`);
  }
}

/**
 * In-process CounterStore.
 *
 * Not a production backend — it exists so the distributed *logic* is testable,
 * and so several logical "replicas" can be pointed at one store to prove they
 * share a limit.
 */
export class InMemoryCounterStore implements CounterStore {
  private readonly counters = new Map<string, { count: number; resetAtMs: number }>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  async increment(key: string, windowMs: number, amount: number): Promise<{ count: number; resetAtMs: number }> {
    const now = this.clock.now();
    const existing = this.counters.get(key);

    if (!existing || existing.resetAtMs <= now) {
      const fresh = { count: amount, resetAtMs: now + windowMs };
      this.counters.set(key, fresh);
      this.sweep(now);
      return fresh;
    }

    existing.count += amount;
    return existing;
  }

  async delete(key: string): Promise<void> {
    this.counters.delete(key);
  }

  private sweep(now: number): void {
    for (const [key, value] of this.counters) {
      if (value.resetAtMs <= now) this.counters.delete(key);
    }
  }

  get size(): number {
    return this.counters.size;
  }
}
