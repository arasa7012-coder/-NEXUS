import crypto from "crypto";
import { ENV } from "../_core/env";

/**
 * Versioned credential encryption.
 *
 * FORMATS
 *   legacy : "<ivHex(32)>:<ciphertextHex>"                       AES-256-CBC, unauthenticated
 *   v2     : "v2:<ivHex(24)>:<authTagHex(32)>:<ciphertextHex>"   AES-256-GCM, authenticated
 *
 * The formats are self-describing, so no database column is needed to tell them
 * apart and NO SCHEMA MIGRATION IS REQUIRED to adopt v2.
 *
 * KEY DERIVATION is intentionally unchanged from the original implementation
 * (sha256 of the raw ENCRYPTION_KEY value). That is what keeps legacy records
 * written under a correctly configured key readable after this change.
 *
 * DELIBERATE OMISSION: the removed hard-coded fallback key is NOT reintroduced,
 * not even for classification. Re-embedding a publicly known key to identify the
 * data it "protected" would put the vulnerability back into source control. A
 * record that will not decrypt under the configured key is reported as
 * REQUIRES_REENTRY instead — those secrets were never meaningfully protected and
 * must be re-issued at the exchange regardless.
 */

const LEGACY_ALGORITHM = "aes-256-cbc";
const V2_ALGORITHM = "aes-256-gcm";
const V2_PREFIX = "v2";
const V2_IV_BYTES = 12; // GCM standard nonce length

export type CiphertextFormat = "V2_GCM" | "LEGACY_CBC" | "UNRECOGNISED";
export type CredentialErrorCode = "NOT_CONFIGURED" | "REQUIRES_REENTRY" | "MALFORMED";

export class CredentialCryptoError extends Error {
  constructor(public readonly code: CredentialErrorCode, message: string) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

function encryptionKey(): Buffer {
  if (!ENV.encryptionKey) {
    throw new CredentialCryptoError(
      "NOT_CONFIGURED",
      "ENCRYPTION_KEY is not configured. Stored exchange API credentials cannot be encrypted or decrypted."
    );
  }
  return crypto.createHash("sha256").update(String(ENV.encryptionKey)).digest();
}

/**
 * CBC ciphertexts written by legacy versions have no authentication tag, so a
 * wrong key can rarely produce valid padding. Exchange credentials are opaque
 * printable tokens; reject non-canonical output rather than passing arbitrary
 * bytes to a provider. GCM records remain the authoritative authenticated form.
 */
function decodeLegacyCredential(bytes: Buffer): string {
  const value = bytes.toString("utf8");
  const isCanonicalUtf8 = Buffer.from(value, "utf8").equals(bytes);
  const isPrintableToken = /^[\x21-\x7e]+$/.test(value);

  if (!isCanonicalUtf8 || !isPrintableToken) {
    throw new CredentialCryptoError(
      "REQUIRES_REENTRY",
      "Stored legacy credential could not be safely validated and must be re-entered."
    );
  }

  return value;
}

/** Identifies a stored value's format WITHOUT decrypting it and without the key. */
export function classifyCiphertext(value: string): CiphertextFormat {
  if (typeof value !== "string" || value.length === 0) return "UNRECOGNISED";
  const parts = value.split(":");
  if (parts[0] === V2_PREFIX) {
    return parts.length === 4 &&
      /^[0-9a-f]{24}$/.test(parts[1] ?? "") &&
      /^[0-9a-f]{32}$/.test(parts[2] ?? "") &&
      /^[0-9a-f]+$/.test(parts[3] ?? "")
      ? "V2_GCM"
      : "UNRECOGNISED";
  }
  return parts.length === 2 &&
    /^[0-9a-f]{32}$/.test(parts[0] ?? "") &&
    /^[0-9a-f]+$/.test(parts[1] ?? "")
    ? "LEGACY_CBC"
    : "UNRECOGNISED";
}

/** True when a stored value is not yet in the authenticated v2 format. */
export function requiresReencryption(value: string): boolean {
  return classifyCiphertext(value) === "LEGACY_CBC";
}

/** Always writes the current (v2, authenticated) format. */
export function encryptApiKey(plainText: string): string {
  const iv = crypto.randomBytes(V2_IV_BYTES);
  const cipher = crypto.createCipheriv(V2_ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${V2_PREFIX}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Reads both formats. Throws a typed error rather than returning garbage. */
export function decryptApiKey(encryptedText: string): string {
  const format = classifyCiphertext(encryptedText);
  const key = encryptionKey();

  if (format === "UNRECOGNISED") {
    throw new CredentialCryptoError(
      "MALFORMED",
      "Stored credential is not in a recognised encryption format and must be re-entered."
    );
  }

  try {
    if (format === "V2_GCM") {
      const [, ivHex, tagHex, dataHex] = encryptedText.split(":");
      const decipher = crypto.createDecipheriv(V2_ALGORITHM, key, Buffer.from(ivHex!, "hex"));
      // GCM verifies integrity on final(): a wrong key or tampered ciphertext
      // throws instead of yielding plausible-looking bytes.
      decipher.setAuthTag(Buffer.from(tagHex!, "hex"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataHex!, "hex")),
        decipher.final(),
      ]).toString("utf8");
    }

    const [ivHex, dataHex] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, Buffer.from(ivHex!, "hex"));
    return decodeLegacyCredential(Buffer.concat([
      decipher.update(Buffer.from(dataHex!, "hex")),
      decipher.final(),
    ]));
  } catch {
    throw new CredentialCryptoError(
      "REQUIRES_REENTRY",
      "Stored credential could not be decrypted with the configured ENCRYPTION_KEY. It must be re-entered."
    );
  }
}

/**
 * Re-encrypts a legacy record to v2 in memory. Returns null when already v2.
 * Throws REQUIRES_REENTRY when the legacy value cannot be read — the caller must
 * NOT delete the row; it should be surfaced to the user for re-entry.
 */
export function reencryptToCurrentFormat(encryptedText: string): string | null {
  if (classifyCiphertext(encryptedText) === "V2_GCM") return null;
  return encryptApiKey(decryptApiKey(encryptedText));
}

/** Confirms a value round-trips under the current key, without exposing plaintext. */
export function canDecrypt(encryptedText: string): boolean {
  try {
    decryptApiKey(encryptedText);
    return true;
  } catch {
    return false;
  }
}
