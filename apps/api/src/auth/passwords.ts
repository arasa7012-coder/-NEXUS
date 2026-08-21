/**
 * Password hashing — scrypt, via node:crypto.
 *
 * scrypt is memory-hard, so a GPU cluster gains far less over a CPU than it
 * would against PBKDF2 or a bare SHA. Parameters follow current OWASP guidance
 * (N=2^15, r=8, p=1) and are *stored in the hash string*, so raising them later
 * does not invalidate existing credentials — old hashes keep verifying with
 * their original parameters and can be upgraded on next successful login.
 *
 * Format: scrypt$N$r$p$<salt b64>$<derived b64>
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 32_768, R = 8, P = 1, KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  // Randomness is correct here: a salt's purpose is unpredictability, unlike
  // identity, where randomness was the defect we removed.
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");

  try {
    const derived = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash used weaker parameters and should be re-hashed. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  return parts[0] !== "scrypt" || Number(parts[1]) < N;
}
