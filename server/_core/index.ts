import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { assertRequiredEnv } from "./env";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { nexusMonitoringHealthHandler } from "../scheduled/nexusMonitoringHealth";
import { registerMonitoringHeartbeat } from "../scheduled/registerMonitoringHeartbeat";
import { alchemyWebhookHandler } from "../onchain/alchemyWebhookHandler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    // Graceful shutdown: stop accepting new connections and let in-flight
  // requests finish, with a hard cap so a stuck socket cannot block a deploy.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received, shutting down gracefully`);
    const forceExit = setTimeout(() => {
      console.warn("[Server] Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    server.close(closeError => {
      if (closeError) {
        console.error("[Server] Error during shutdown:", closeError.message);
        process.exit(1);
      }
      console.log("[Server] Closed cleanly");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Fail before binding a port, opening a pool, or serving a request.
  assertRequiredEnv();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb", verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8"); } }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Platform-managed Heartbeat callback. It must be mounted before Vite/static fallthrough.
  app.post("/api/scheduled/nexus-monitoring-health", nexusMonitoringHealthHandler);
  // Alchemy events are HMAC-verified against their raw body before an already watched public wallet can be re-synced.
  app.post("/api/webhooks/alchemy", alchemyWebhookHandler);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Registered only after the callback route is accepting requests, and
    // never awaited: a Forge outage must degrade monitoring health, not
    // prevent the server from serving traffic.
    void registerMonitoringHeartbeat()
      .then(outcome => {
        if (outcome.status === "FAILED" || outcome.status === "SKIPPED") {
          console.warn(`[Heartbeat] Monitoring registration ${outcome.status}: ${outcome.reason}`);
          return;
        }
        console.log(`[Heartbeat] Monitoring registration ${outcome.status} (taskUid=${outcome.taskUid})`);
      })
      .catch(error => {
        console.warn("[Heartbeat] Monitoring registration threw unexpectedly:", error);
      });
  });
}

startServer().catch(error => {
  // Exit non-zero so process managers and orchestrators treat a misconfigured
  // boot as a failure instead of a clean shutdown.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
