import { afterEach, describe, expect, it, vi } from "vitest";

const REQUIRED = ["JWT_SECRET", "NEXUS_JWT_SECRET", "DATABASE_URL", "ENCRYPTION_KEY", "OAUTH_SERVER_URL", "VITE_APP_ID"] as const;
const original: Record<string, string | undefined> = {};
for (const key of REQUIRED) original[key] = process.env[key];

async function freshEnv() {
  vi.resetModules();
  return import("./env");
}

function setAll(values: Partial<Record<(typeof REQUIRED)[number], string>>) {
  for (const key of REQUIRED) delete process.env[key];
  Object.assign(process.env, values);
}

const VALID = {
  JWT_SECRET: "x".repeat(32),
  DATABASE_URL: "mysql://user@host/db",
  ENCRYPTION_KEY: "y".repeat(32),
  OAUTH_SERVER_URL: "https://oauth.example",
  VITE_APP_ID: "app-id",
};

describe("required environment validation", () => {
  afterEach(() => { Object.assign(process.env, original); });

  it("reports every missing variable at once rather than one per restart", async () => {
    setAll({});
    const { assertRequiredEnv } = await freshEnv();
    let message = "";
    try { assertRequiredEnv(); } catch (error) { message = (error as Error).message; }
    for (const key of REQUIRED) expect(message).toContain(key);
  });

  it("rejects secrets below the 32-byte floor", async () => {
    // WebCrypto only rejects a ZERO-length HMAC key, so a short secret would
    // otherwise sign tokens silently. This floor is the actual guard.
    setAll({ ...VALID, JWT_SECRET: "short" });
    const { assertRequiredEnv } = await freshEnv();
    expect(() => assertRequiredEnv()).toThrow(/JWT_SECRET is too short/);
  });

  it("uses the independent NEXUS session secret when the platform JWT secret is short", async () => {
    setAll({ ...VALID, JWT_SECRET: "short", NEXUS_JWT_SECRET: "n".repeat(32) });
    const { assertRequiredEnv } = await freshEnv();
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it("rejects a short ENCRYPTION_KEY", async () => {
    setAll({ ...VALID, ENCRYPTION_KEY: "tooshort" });
    const { assertRequiredEnv } = await freshEnv();
    expect(() => assertRequiredEnv()).toThrow(/ENCRYPTION_KEY is too short/);
  });

  it("passes with a fully valid configuration", async () => {
    setAll(VALID);
    const { assertRequiredEnv } = await freshEnv();
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it("never includes secret values in the error message", async () => {
    setAll({ ...VALID, JWT_SECRET: "sensitive-short-value" });
    const { assertRequiredEnv } = await freshEnv();
    let message = "";
    try { assertRequiredEnv(); } catch (error) { message = (error as Error).message; }
    expect(message).not.toContain("sensitive-short-value");
  });
});
