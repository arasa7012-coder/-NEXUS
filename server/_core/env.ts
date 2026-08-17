export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.NEXUS_JWT_SECRET || process.env.JWT_SECRET || "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  coinGeckoApiKey: process.env.COINGECKO_API_KEY ?? "",
  alchemyApiKey: process.env.ALCHEMY_API_KEY ?? "",
  alchemyWebhookSigningKey: process.env.ALCHEMY_WEBHOOK_SIGNING_KEY ?? "",
  twelveDataApiKey: process.env.TWELVE_DATA_API_KEY ?? "",
};

/**
 * Configuration the server cannot safely run without.
 *
 * `minBytes` is a floor, not a strength guarantee. It exists because WebCrypto
 * (which `jose` uses for HS256) only rejects a *zero-length* HMAC key — a
 * 5-byte secret is accepted and signs tokens normally. Without an explicit
 * floor, a weak JWT_SECRET fails silently rather than loudly.
 */
const REQUIRED_ENV: ReadonlyArray<{
  name: string;
  value: string;
  minBytes?: number;
  purpose: string;
}> = [
  { name: "NEXUS_JWT_SECRET or JWT_SECRET", value: ENV.cookieSecret, minBytes: 32, purpose: "signs and verifies session cookies" },
  { name: "DATABASE_URL", value: ENV.databaseUrl, purpose: "MySQL/TiDB connection string" },
  { name: "ENCRYPTION_KEY", value: ENV.encryptionKey, minBytes: 32, purpose: "encrypts stored exchange API credentials at rest" },
  { name: "OAUTH_SERVER_URL", value: ENV.oAuthServerUrl, purpose: "OAuth token exchange and user info endpoint" },
  { name: "VITE_APP_ID", value: ENV.appId, purpose: "OAuth client id and session audience" },
];

/**
 * Fails the process at startup when required configuration is absent or too
 * weak, reporting every problem at once rather than one per restart.
 *
 * Deliberately NOT executed on module import: `ENV` is imported by unit tests
 * and by tooling that does not need a full production configuration. Call this
 * explicitly from the server entrypoint.
 */
export function assertRequiredEnv(): void {
  const problems: string[] = [];

  for (const entry of REQUIRED_ENV) {
    const byteLength = Buffer.byteLength(entry.value, "utf8");
    if (byteLength === 0) {
      problems.push(`  - ${entry.name} is not set (${entry.purpose})`);
      continue;
    }
    if (entry.minBytes !== undefined && byteLength < entry.minBytes) {
      problems.push(
        `  - ${entry.name} is too short: ${byteLength} bytes, minimum ${entry.minBytes} (${entry.purpose})`
      );
    }
  }

  if (problems.length === 0) return;

  throw new Error(
    [
      "",
      "NEXUS cannot start: required configuration is missing or invalid.",
      "",
      ...problems,
      "",
      "Set these in the deployment environment (or a local .env file) and restart.",
      "See README-NEXUS-TRANSFER.md for the full variable list.",
      "",
      "Note: changing JWT_SECRET invalidates all existing sessions.",
      "Note: changing ENCRYPTION_KEY makes previously stored exchange API",
      "      credentials undecryptable. Do not change it without a planned",
      "      re-encryption or credential re-entry step.",
      "",
    ].join("\n")
  );
}
