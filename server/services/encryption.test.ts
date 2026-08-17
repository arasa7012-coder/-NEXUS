import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "test-encryption-key-value-at-least-32-bytes";

async function loadModule() {
  process.env.ENCRYPTION_KEY = KEY;
  vi.resetModules();
  return import("./encryption");
}

/** Produces a record in the pre-v2 (AES-256-CBC) format under an arbitrary key. */
function legacyCiphertext(plain: string, secret: string): string {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let out = cipher.update(plain, "utf8", "hex");
  out += cipher.final("hex");
  return `${iv.toString("hex")}:${out}`;
}

describe("credential encryption format", () => {
  const original = process.env.ENCRYPTION_KEY;
  beforeEach(() => { process.env.ENCRYPTION_KEY = KEY; });
  afterEach(() => { process.env.ENCRYPTION_KEY = original; });

  it("classifies both formats without needing the key", async () => {
    const { classifyCiphertext, encryptApiKey } = await loadModule();
    expect(classifyCiphertext(legacyCiphertext("s", KEY))).toBe("LEGACY_CBC");
    expect(classifyCiphertext(encryptApiKey("s"))).toBe("V2_GCM");
    expect(classifyCiphertext("garbage")).toBe("UNRECOGNISED");
  });

  it("writes v2 and still reads legacy records written under the same key", async () => {
    const { encryptApiKey, decryptApiKey } = await loadModule();
    const secret = "BinanceSecret_abc123";
    expect(encryptApiKey(secret).startsWith("v2:")).toBe(true);
    expect(decryptApiKey(encryptApiKey(secret))).toBe(secret);
    expect(decryptApiKey(legacyCiphertext(secret, KEY))).toBe(secret);
  });

  it("rejects tampered v2 ciphertext instead of returning corrupted plaintext", async () => {
    const { encryptApiKey, decryptApiKey } = await loadModule();
    const parts = encryptApiKey("BinanceSecret_abc123").split(":");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("ff") ? "ee" : "ff");
    expect(() => decryptApiKey(parts.join(":"))).toThrow();
  });

  it("never silently returns garbage for records encrypted under a different key", async () => {
    const { decryptApiKey } = await loadModule();
    // Regression guard: unauthenticated CBC could decrypt to plausible bytes
    // roughly 1 in 256 times when padding happened to validate.
    let garbage = 0;
    for (let i = 0; i < 300; i += 1) {
      try {
        const out = decryptApiKey(legacyCiphertext("BinanceSecret_abc123", "a-different-key"));
        if (out !== "BinanceSecret_abc123") garbage += 1;
      } catch { /* expected: REQUIRES_REENTRY */ }
    }
    expect(garbage).toBe(0);
  });

  it("flags legacy records for re-encryption and migrates them losslessly", async () => {
    const { requiresReencryption, reencryptToCurrentFormat, decryptApiKey, encryptApiKey } = await loadModule();
    const secret = "BinanceSecret_abc123";
    const legacy = legacyCiphertext(secret, KEY);
    expect(requiresReencryption(legacy)).toBe(true);
    const migrated = reencryptToCurrentFormat(legacy)!;
    expect(migrated.startsWith("v2:")).toBe(true);
    expect(decryptApiKey(migrated)).toBe(secret);
    expect(reencryptToCurrentFormat(encryptApiKey(secret))).toBeNull();
  });

  it("fails loudly when ENCRYPTION_KEY is absent", async () => {
    const { encryptApiKey } = await loadModule();
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
    const fresh = await import("./encryption");
    expect(() => fresh.encryptApiKey("x")).toThrow(/ENCRYPTION_KEY is not configured/);
    expect(typeof encryptApiKey).toBe("function");
  });
});
