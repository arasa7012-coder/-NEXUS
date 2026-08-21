/**
 * NEXUS identity.
 *
 * Randomness is not identity. The legacy client used `Math.random()` as an
 * alert id, which is collision-prone, unstable across renders, and makes
 * de-duplication impossible. Two strategies replace it, and neither uses a
 * random source:
 *
 *   1. Content-addressed keys (`dedupeKey`) — the identity of a *fact*.
 *      The same condition observed twice produces the same key, so the alert
 *      pipeline can recognise a repeat instead of emitting a duplicate.
 *
 *   2. Monotonic sequence ids (`IdSequence`) — the identity of a *record*.
 *      Time-ordered and unique within an issuing node. The clock is injected,
 *      never read internally, so the sequence is fully testable.
 *
 * Both are issued by the backend. The mobile app never mints identity.
 */

// ---------------------------------------------------------------------------
// Content addressing
// ---------------------------------------------------------------------------

/**
 * FNV-1a, 64-bit, computed in two 32-bit halves so it stays exact under
 * JavaScript number semantics without requiring BigInt on every runtime.
 *
 * This is a *fingerprint*, not a security primitive. It must never be used for
 * signatures, tokens, or anything an adversary would want to forge.
 */
export function fingerprint64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x5bf1;

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c & 0xff;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c >>> 8) & 0xff || c & 0xff;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }

  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Field separator chosen to be illegal inside the component values below. */
const SEP = "\u0000";

function assertComponent(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new IdentityError("INVALID_COMPONENT", `${label} must not be empty.`);
  }
  if (trimmed.includes(SEP)) {
    throw new IdentityError("INVALID_COMPONENT", `${label} must not contain a separator byte.`);
  }
  return trimmed;
}

export class IdentityError extends Error {
  readonly code: "INVALID_COMPONENT" | "CLOCK_REGRESSION" | "SEQUENCE_EXHAUSTED";

  constructor(code: IdentityError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "IdentityError";
  }
}

export interface DedupeKeyInput {
  /** What produced this — e.g. "risk.drawdown", "monitor.wallet". */
  producer: string;
  /** The rule or check that fired. */
  rule: string;
  /** The entity the fact is about — e.g. "asset:BTCUSDT". */
  entity: string;
  /**
   * Time bucket the fact belongs to. Two observations of the same condition in
   * the same bucket are the same fact. Omit for facts that should collapse
   * regardless of when they recur (e.g. a persistent configuration problem).
   */
  bucket?: string;
}

/**
 * Stable identity for a *condition*. Deterministic: same input, same key,
 * on any node, in any process, forever.
 */
export function dedupeKey(input: DedupeKeyInput): string {
  const parts = [
    assertComponent(input.producer, "producer"),
    assertComponent(input.rule, "rule"),
    assertComponent(input.entity, "entity"),
    input.bucket === undefined ? "" : assertComponent(input.bucket, "bucket"),
  ];
  return `${parts[0]}.${parts[1]}:${fingerprint64(parts.join(SEP))}`;
}

/**
 * Truncate a timestamp to a bucket boundary, for use as `dedupeKey.bucket`.
 * A 5-minute bucket means "alert me at most once per five minutes for this".
 */
export function timeBucket(epochMs: number, windowMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs < 0) {
    throw new IdentityError("INVALID_COMPONENT", "Bucket timestamp must be a finite, non-negative value.");
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new IdentityError("INVALID_COMPONENT", "Bucket window must be a positive whole number of milliseconds.");
  }
  return String(Math.floor(epochMs / windowMs) * windowMs);
}

// ---------------------------------------------------------------------------
// Monotonic record ids
// ---------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: number, length: number): string {
  let out = "";
  let n = value;
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

const MAX_COUNTER = 32 ** 4; // 1,048,576 ids per millisecond per node.

/**
 * Time-ordered unique id issuer.
 *
 * Format: `<10 char timestamp><4 char counter><node>` — lexicographically
 * sortable, so a database index on the id is also an index on creation order.
 *
 * Uniqueness comes from the (timestamp, counter, node) triple, not from
 * entropy. Two issuers must therefore never share a node id.
 */
export class IdSequence {
  private readonly node: string;
  private lastMs = -1;
  private counter = 0;

  constructor(node: string) {
    const normalized = assertComponent(node, "node").toUpperCase();
    if (!/^[0-9A-HJKMNP-TV-Z]{1,4}$/.test(normalized)) {
      throw new IdentityError(
        "INVALID_COMPONENT",
        "Node id must be 1-4 Crockford base32 characters and unique per issuing process.",
      );
    }
    this.node = normalized;
  }

  /**
   * @param nowMs Injected clock. Never read internally, so tests control time.
   */
  next(nowMs: number): string {
    if (!Number.isInteger(nowMs) || nowMs < 0) {
      throw new IdentityError("INVALID_COMPONENT", "Clock value must be a non-negative whole number.");
    }
    if (nowMs < this.lastMs) {
      // A backwards clock would let a later record sort before an earlier one.
      // Refusing is correct: silently continuing corrupts ordering guarantees.
      throw new IdentityError(
        "CLOCK_REGRESSION",
        `Clock moved backwards from ${this.lastMs} to ${nowMs}; identity ordering cannot be guaranteed.`,
      );
    }
    if (nowMs === this.lastMs) {
      this.counter += 1;
      if (this.counter >= MAX_COUNTER) {
        throw new IdentityError("SEQUENCE_EXHAUSTED", "Exhausted the per-millisecond id space for this node.");
      }
    } else {
      this.lastMs = nowMs;
      this.counter = 0;
    }
    return encodeBase32(nowMs, 10) + encodeBase32(this.counter, 4) + this.node;
  }
}
