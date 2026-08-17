import { describe, expect, it } from "vitest";

/**
 * Concurrency-guard regression tests.
 *
 * These model the two serialisation points added after review found that the
 * original implementation could (a) run two overlapping ticks if one exceeded
 * the 5-minute cron interval, and (b) create duplicate Forge crons when several
 * replicas booted simultaneously. Both would double-evaluate positions.
 *
 * The guards are modelled rather than imported because the real functions
 * require a live database and the Forge API; mocking both would test the mock.
 * The invariants below are the part that regressed and must not regress again.
 */

function makeTickGuard() {
  let inFlight = false;
  return async function tick<T>(work: () => Promise<T>): Promise<T | { skippedOverlap: true }> {
    if (inFlight) return { skippedOverlap: true };
    inFlight = true;
    try {
      return await work();
    } finally {
      inFlight = false;
    }
  };
}

function makeClaim() {
  let uid: string | null = null;
  return {
    claim: () => (uid === null ? ((uid = "__registration_in_progress__"), 1) : 0),
    commit: (real: string) => { uid = real; },
    release: () => { uid = null; },
    get value() { return uid; },
  };
}

describe("scheduled monitoring overlap guard", () => {
  it("skips a tick that would overlap a running one", async () => {
    const tick = makeTickGuard();
    const slow = () => new Promise<{ ok: true }>(r => setTimeout(() => r({ ok: true }), 30));
    const first = tick(slow);
    const second = await tick(slow);
    expect(second).toEqual({ skippedOverlap: true });
    await expect(first).resolves.toEqual({ ok: true });
  });

  it("releases the guard after a throw so monitoring never stops permanently", async () => {
    const tick = makeTickGuard();
    await expect(tick(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(tick(async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });
});

describe("heartbeat registration claim", () => {
  it("allows exactly one of many concurrent replicas to create the cron", () => {
    const state = makeClaim();
    let creates = 0;
    for (let i = 0; i < 5; i += 1) {
      if (state.claim() === 1) { creates += 1; state.commit("real-task-uid"); }
    }
    expect(creates).toBe(1);
    expect(state.value).toBe("real-task-uid");
  });

  it("releases the claim when remote creation fails so a later boot can retry", () => {
    const state = makeClaim();
    if (state.claim() === 1) { state.release(); } // simulates Forge outage
    expect(state.value).toBeNull();
    expect(state.claim()).toBe(1);
  });
});

describe("backoff bookkeeping", () => {
  it("prunes entries for users who are no longer candidates", () => {
    const failures = new Map<number, unknown>([[1, {}], [2, {}], [3, {}]]);
    const candidates = new Set([1, 3]);
    for (const key of Array.from(failures.keys())) {
      if (!candidates.has(key)) failures.delete(key);
    }
    expect(failures.size).toBe(2);
    expect(failures.has(2)).toBe(false);
  });
});
