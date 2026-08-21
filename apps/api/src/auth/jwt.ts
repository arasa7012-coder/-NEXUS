/**
 * JWT (HS256) on node:crypto.
 *
 * Written directly against the primitive rather than pulled from a library
 * because `jose` cannot be installed here — and because the parts that matter
 * for security are exactly the parts worth having under test: constant-time
 * signature comparison, algorithm pinning, and expiry handling.
 *
 * Deliberate choices:
 *
 *   - The `alg` header is *pinned*, not read. Trusting the token's own header
 *     is the classic JWT vulnerability: an attacker sends `alg: none` or
 *     downgrades RS256 to HS256 and signs with the public key. This verifier
 *     refuses anything that is not the algorithm it was constructed with.
 *   - Signature comparison uses `timingSafeEqual`. A byte-by-byte early return
 *     leaks the correct signature through timing.
 *   - Clock skew is explicit and small. Tokens are not accepted "a bit early"
 *     by accident.
 *
 * On a networked machine this is a candidate for replacement by `jose`. The
 * interface is deliberately small enough that swapping it is contained.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type JwtFailure =
  | "MALFORMED"
  | "ALGORITHM_MISMATCH"
  | "SIGNATURE_INVALID"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "CLAIM_MISMATCH";

export class JwtError extends Error {
  readonly reason: JwtFailure;

  constructor(reason: JwtFailure, message: string) {
    super(message);
    this.reason = reason;
    this.name = "JwtError";
  }
}

export interface Claims {
  /** Subject — the user id. */
  sub: string;
  /** Issued at, seconds. */
  iat: number;
  /** Expires at, seconds. */
  exp: number;
  /** Not before, seconds. */
  nbf?: number;
  iss: string;
  aud: string;
  /** Session id, so a single session can be revoked without a global purge. */
  sid: string;
  roles: string[];
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface JwtConfig {
  secret: string;
  issuer: string;
  audience: string;
  /** Tolerance for clock drift between issuer and verifier, seconds. */
  clockToleranceSec?: number;
}

export class JwtService {
  private readonly secret: Buffer;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly tolerance: number;

  constructor(config: JwtConfig) {
    if (Buffer.byteLength(config.secret, "utf8") < 32) {
      // A short HMAC secret is brute-forceable offline. Refusing at construction
      // is the only place this can be caught before it reaches production.
      throw new Error("JWT secret must be at least 32 bytes.");
    }
    this.secret = Buffer.from(config.secret, "utf8");
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.tolerance = config.clockToleranceSec ?? 5;
  }

  private sign(data: string): string {
    return b64url(createHmac("sha256", this.secret).update(data).digest());
  }

  issue(claims: Omit<Claims, "iat" | "exp" | "iss" | "aud">, nowMs: number, ttlSec: number): string {
    const iat = Math.floor(nowMs / 1000);
    const payload: Claims = {
      ...claims,
      iat,
      exp: iat + ttlSec,
      iss: this.issuer,
      aud: this.audience,
    };
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(payload));
    const data = `${header}.${body}`;
    return `${data}.${this.sign(data)}`;
  }

  verify(token: string, nowMs: number): Claims {
    const parts = token.split(".");
    if (parts.length !== 3) throw new JwtError("MALFORMED", "Token is not a well-formed JWT.");
    const [header, body, signature] = parts as [string, string, string];

    let parsedHeader: { alg?: unknown };
    try {
      parsedHeader = JSON.parse(fromB64url(header).toString("utf8")) as { alg?: unknown };
    } catch {
      throw new JwtError("MALFORMED", "Token header is not valid JSON.");
    }

    // Pinned, never negotiated.
    if (parsedHeader.alg !== "HS256") {
      throw new JwtError("ALGORITHM_MISMATCH", "Only HS256 is accepted.");
    }

    const expected = this.sign(`${header}.${body}`);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new JwtError("SIGNATURE_INVALID", "Token signature does not verify.");
    }

    let claims: Claims;
    try {
      claims = JSON.parse(fromB64url(body).toString("utf8")) as Claims;
    } catch {
      throw new JwtError("MALFORMED", "Token payload is not valid JSON.");
    }

    const now = Math.floor(nowMs / 1000);
    if (typeof claims.exp !== "number" || now > claims.exp + this.tolerance) {
      throw new JwtError("EXPIRED", "Token has expired.");
    }
    if (typeof claims.nbf === "number" && now + this.tolerance < claims.nbf) {
      throw new JwtError("NOT_YET_VALID", "Token is not yet valid.");
    }
    if (claims.iss !== this.issuer || claims.aud !== this.audience) {
      throw new JwtError("CLAIM_MISMATCH", "Token was not issued for this service.");
    }
    if (typeof claims.sub !== "string" || typeof claims.sid !== "string") {
      throw new JwtError("MALFORMED", "Token is missing required claims.");
    }

    return claims;
  }
}
