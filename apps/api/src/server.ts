/**
 * Production entrypoint.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — drizzle-orm and mysql2 are not
 * installable and no database is reachable, so this file has never run.
 *
 * The one thing it does that matters: it fails fast. A missing or weak secret
 * stops the process at startup rather than surfacing as an authentication bug
 * in production.
 */

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { createApp } from "./app.ts";
import { IdSequence } from "@nexus/core";
import { createDrizzleRepositories, checkDatabase } from "./adapters/drizzle/repositories.ts";
import { DrizzleSafetyStateRepository } from "./adapters/drizzle/safetyRepository.ts";
import { SqlCounterStore } from "./adapters/drizzle/counterStore.ts";
import { SharedStoreRateLimiter } from "./platform/rateLimit.ts";
import { systemClock } from "./platform/events.ts";

function required(name: string, minBytes = 0): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required and was not set.`);
  }
  if (minBytes > 0 && Buffer.byteLength(value, "utf8") < minBytes) {
    throw new Error(`${name} must be at least ${minBytes} bytes.`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const jwtSecret = required("JWT_SECRET", 32);
  const nodeId = process.env.NEXUS_NODE_ID ?? "A1";
  const port = Number(process.env.PORT ?? 3000);

  const pool = mysql.createPool(databaseUrl);
  const db = drizzle(pool);
  const auditIds = new IdSequence(nodeId);

  const app = createApp({
    config: {
      jwtSecret,
      issuer: process.env.JWT_ISSUER ?? "nexus",
      audience: process.env.JWT_AUDIENCE ?? "nexus-mobile",
      nodeId,
      version: process.env.NEXUS_VERSION ?? "1.0.0",
      marketProviderId: "market",
      logLevel: (process.env.LOG_LEVEL as "info") ?? "info",
    },
    repositories: {
      ...createDrizzleRepositories(db),
      // Persistent: an active Emergency Stop must survive a restart.
      safety: new DrizzleSafetyStateRepository(db, () => auditIds.next(Date.now())),
    },
    // Shared across replicas, so N instances enforce one limit rather than N.
    rateLimiter: new SharedStoreRateLimiter({
      store: new SqlCounterStore(db),
      clock: systemClock,
    }),
    checkDatabase: () => checkDatabase(db),
  });

  const server = app.listen(port);
  app.logger.info("nexus api started", { port, nodeId });

  const shutdown = (signal: string): void => {
    app.logger.info("shutting down", { signal });
    app.shutdown();
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    // Do not wait forever for lingering SSE sockets to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({
    ts: new Date().toISOString(), level: "error", service: "nexus-api",
    msg: "startup failed", error: error instanceof Error ? error.message : String(error),
  }) + "\n");
  process.exit(1);
});
