/**
 * Repository contract suite.
 *
 * The in-memory adapters are the *reference implementation*. Any production
 * adapter — Drizzle/MySQL today, something else later — must pass this exact
 * suite. That is what makes swapping storage safe: the domain tests prove the
 * logic, and this proves the adapter behaves the way the logic assumes.
 *
 * Written as a plain function over a factory so it can run against an
 * in-memory instance here and against a real database on a machine that has
 * one, with no change to the assertions.
 */

import type { Alert } from "@nexus/contracts";
import type { AlertRepository } from "../domain/alerts/alertService.ts";
import type { SessionRepository, SessionRecord } from "../auth/session.ts";

export interface Assert {
  (name: string, condition: boolean, extra?: string): void;
}

const T = 1_760_000_000_000;

function mkAlert(o: Partial<Alert> = {}): Alert {
  return {
    id: "01K7AAAAAA0000A1",
    dedupeKey: "risk.drawdown:aaaabbbbccccdddd",
    createdAt: T, updatedAt: T,
    severity: "WARNING", priority: 600,
    title: "Drawdown approaching limit",
    explanation: "Drawdown reached 4.1% against a 5% limit.",
    source: "risk-engine",
    entity: { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin" },
    status: "OPEN", read: false,
    acknowledgedAt: null, resolvedAt: null,
    occurrences: 1,
    history: [{ at: T, status: "OPEN", note: null }],
    ...o,
  };
}

export async function runAlertRepositoryContract(
  make: () => AlertRepository,
  ok: Assert,
  label: string,
): Promise<void> {
  {
    const repo = make();
    await repo.insert(mkAlert({ id: "a1" }));
    const found = await repo.findById("a1");
    ok(`${label}: insert then findById round-trips`, found?.id === "a1");
    ok(`${label}: every field survives the round trip`,
      found?.explanation === "Drawdown reached 4.1% against a 5% limit." && found?.occurrences === 1);
    ok(`${label}: history survives the round trip`, found?.history.length === 1);
  }
  {
    const repo = make();
    await repo.insert(mkAlert({ id: "a1" }));
    let threw = false;
    try { await repo.insert(mkAlert({ id: "a1" })); } catch { threw = true; }
    ok(`${label}: duplicate id is rejected`, threw);
  }
  {
    const repo = make();
    ok(`${label}: missing id yields null, not a throw`, (await repo.findById("nope")) === null);
  }
  {
    const repo = make();
    await repo.insert(mkAlert({ id: "a1", dedupeKey: "k1" }));
    ok(`${label}: open alert is found by dedupe key`, (await repo.findOpenByDedupeKey("k1"))?.id === "a1");
    ok(`${label}: unknown dedupe key yields null`, (await repo.findOpenByDedupeKey("k9")) === null);
  }
  {
    // The behaviour the whole alert model depends on: a RESOLVED alert must not
    // be returned by dedupe lookup, or a recurring condition would silently
    // reopen the old record instead of raising a new one.
    const repo = make();
    await repo.insert(mkAlert({ id: "a1", dedupeKey: "k1", status: "RESOLVED", resolvedAt: T }));
    ok(`${label}: resolved alerts are excluded from dedupe lookup`,
      (await repo.findOpenByDedupeKey("k1")) === null);

    await repo.insert(mkAlert({ id: "a2", dedupeKey: "k2", status: "ACKNOWLEDGED", acknowledgedAt: T }));
    ok(`${label}: acknowledged alerts still collapse`, (await repo.findOpenByDedupeKey("k2"))?.id === "a2");
  }
  {
    const repo = make();
    await repo.insert(mkAlert({ id: "a1" }));
    await repo.update(mkAlert({ id: "a1", occurrences: 7, updatedAt: T + 500 }));
    const found = await repo.findById("a1");
    ok(`${label}: update persists`, found?.occurrences === 7 && found?.updatedAt === T + 500);

    let threw = false;
    try { await repo.update(mkAlert({ id: "ghost" })); } catch { threw = true; }
    ok(`${label}: updating a missing row is an error, not a silent insert`, threw);
  }
  {
    const repo = make();
    await repo.insert(mkAlert({ id: "a1", severity: "INFO", read: true, createdAt: T }));
    await repo.insert(mkAlert({ id: "a2", severity: "CRITICAL", read: false, createdAt: T + 1, dedupeKey: "k2" }));
    await repo.insert(mkAlert({ id: "a3", severity: "WATCH", read: false, createdAt: T + 2, dedupeKey: "k3", status: "RESOLVED" }));

    const all = await repo.list({ limit: 10 });
    ok(`${label}: list returns everything within the limit`, all.length === 3, String(all.length));
    ok(`${label}: list applies the canonical ordering`, all[0]!.id === "a2", all.map((a) => a.id).join(","));

    const open = await repo.list({ status: "OPEN", limit: 10 });
    ok(`${label}: list filters by status`, open.length === 2 && open.every((a) => a.status === "OPEN"));

    const limited = await repo.list({ limit: 1 });
    ok(`${label}: list honours the limit`, limited.length === 1);
    ok(`${label}: countUnread counts only unread`, (await repo.countUnread()) === 2);
  }
}

export async function runSessionRepositoryContract(
  make: () => SessionRepository,
  ok: Assert,
  label: string,
): Promise<void> {
  const mk = (o: Partial<SessionRecord> = {}): SessionRecord => ({
    sid: "s1", userId: "u1", refreshTokenHash: "hash1",
    createdAt: T, expiresAt: T + 1000, revokedAt: null, lastUsedAt: T, ...o,
  });

  {
    const repo = make();
    await repo.create(mk());
    ok(`${label}: session round-trips`, (await repo.findBySid("s1"))?.userId === "u1");
    ok(`${label}: unknown sid yields null`, (await repo.findBySid("s9")) === null);
  }
  {
    const repo = make();
    await repo.create(mk());
    await repo.update(mk({ refreshTokenHash: "hash2", lastUsedAt: T + 10 }));
    const found = await repo.findBySid("s1");
    ok(`${label}: refresh rotation persists`, found?.refreshTokenHash === "hash2");
  }
  {
    const repo = make();
    await repo.create(mk({ sid: "s1", userId: "u1" }));
    await repo.create(mk({ sid: "s2", userId: "u1" }));
    await repo.create(mk({ sid: "s3", userId: "u2" }));
    const revoked = await repo.revokeAllForUser("u1");
    ok(`${label}: revokeAllForUser reports the count`, revoked === 2, String(revoked));
    ok(`${label}: that user's sessions are revoked`, (await repo.findBySid("s1"))?.revokedAt !== null);
    ok(`${label}: other users are untouched`, (await repo.findBySid("s3"))?.revokedAt === null);
  }
  {
    const repo = make();
    await repo.create(mk({ revokedAt: T + 5 }));
    const revoked = await repo.revokeAllForUser("u1");
    ok(`${label}: already-revoked sessions are not double counted`, revoked === 0, String(revoked));
  }
}
