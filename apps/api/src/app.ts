/**
 * Composition root.
 *
 * The only place in the API where concrete implementations are chosen. Every
 * other module depends on interfaces, which is why the same domain code runs
 * against in-memory adapters in tests and Drizzle adapters in production
 * without a single conditional.
 *
 * Storage selection is the one branch, and it is made here, once.
 */

import { createServer, type Server } from "node:http";
import { IdSequence } from "@nexus/core";
import { InMemoryEventBus, systemClock } from "./platform/events.ts";
import type { Clock } from "./platform/events.ts";
import { createLogger } from "./platform/logger.ts";
import type { Logger } from "./platform/logger.ts";
import { InMemoryRateLimiter } from "./platform/rateLimit.ts";
import type { RateLimiter } from "./platform/rateLimit.ts";
import { JwtService } from "./auth/jwt.ts";
import { SessionService } from "./auth/session.ts";
import { verifyPassword } from "./auth/passwords.ts";
import { NexusRouter } from "./http/router.ts";
import { registerRoutes } from "./http/routes.ts";
import { RealtimeHub } from "./http/realtime.ts";
import { createSseHandler } from "./http/sseRoute.ts";
import { AlertService } from "./domain/alerts/alertService.ts";
import { ProviderRegistry } from "./domain/providers/registry.ts";
import { MonitorRunner } from "./domain/monitoring/scheduler.ts";
import { IntelligenceService } from "./domain/intelligence/intelligenceService.ts";
import { RiskService } from "./domain/risk/riskService.ts";
import { EntityService } from "./domain/entities/entityService.ts";
import { MonitorService } from "./domain/monitoring/monitorService.ts";
import { MonitorExecutor } from "./domain/monitoring/monitorExecutor.ts";
import { SafetyService } from "./domain/safety/safetyService.ts";
import type { AlertRepository } from "./domain/alerts/alertService.ts";
import type { RiskRepository } from "./domain/risk/riskService.ts";
import type { MonitorDefinitionRepository } from "./domain/monitoring/monitorService.ts";
import type { SafetyStateRepository } from "./domain/safety/safetyService.ts";
import type { EntityRepository } from "./domain/entities/entityService.ts";
import type { SessionRepository, UserRepository } from "./auth/session.ts";

export interface Repositories {
  alerts: AlertRepository;
  monitors: MonitorDefinitionRepository;
  sessions: SessionRepository;
  users: UserRepository;
  risk: RiskRepository;
  entities: EntityRepository;
  safety: SafetyStateRepository;
}

export interface AppConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
  /**
   * Unique per running process. IdSequence uniqueness depends on it — two
   * instances sharing a node id can mint colliding ids.
   */
  nodeId: string;
  version: string;
  marketProviderId: string;
  logLevel?: "debug" | "info" | "warn" | "error";
}

export interface NexusApp {
  router: NexusRouter;
  hub: RealtimeHub;
  bus: InMemoryEventBus;
  alerts: AlertService;
  providers: ProviderRegistry;
  runner: MonitorRunner;
  monitors: MonitorService;
  executor: MonitorExecutor;
  safety: SafetyService;
  /** Executes one scheduling cycle. Call from a timer or an external trigger. */
  runMonitorCycle(limit?: number): Promise<{ ran: number; triggered: number; failed: number; skippedLocked: number }>;
  intelligence: IntelligenceService;
  risk: RiskService;
  entities: EntityService;
  sessions: SessionService;
  logger: Logger;
  listen(port: number): Server;
  shutdown(): void;
}

export function createApp(input: {
  config: AppConfig;
  repositories: Repositories;
  clock?: Clock;
  logSink?: (line: string) => void;
  checkDatabase?: () => Promise<boolean>;
  /**
   * Defaults to the in-process token bucket, which is correct for a single
   * instance. Production passes SharedStoreRateLimiter so replicas observe one
   * authoritative limit — see docs/PRODUCTION.md.
   */
  rateLimiter?: RateLimiter;
}): NexusApp {
  const clock = input.clock ?? systemClock;
  const now = (): number => clock.now();
  const logger = createLogger({
    ...(input.config.logLevel ? { level: input.config.logLevel } : {}),
    ...(input.logSink ? { sink: input.logSink } : {}),
  });

  const bus = new InMemoryEventBus({
    nodeId: input.config.nodeId,
    clock,
    onError: (error, event, handlerName) =>
      logger.error("event handler failed", {
        handler: handlerName,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      }),
  });

  const hub = new RealtimeHub({ replaySize: 200 });
  // Realtime is a *subscriber* to the domain bus. Nothing publishes to it
  // directly, which is what guarantees every frame corresponds to a real
  // domain event rather than something synthesised for the UI.
  hub.attach(bus);

  const jwt = new JwtService({
    secret: input.config.jwtSecret,
    issuer: input.config.issuer,
    audience: input.config.audience,
  });

  const sessions = new SessionService({
    users: input.repositories.users,
    sessions: input.repositories.sessions,
    jwt, clock, verifyPassword,
  });

  const providers = new ProviderRegistry({ clock, events: bus });

  // Persistent and authoritative: consulted fresh before every monitor run, so
  // a process restart cannot clear an active stop.
  const safety = new SafetyService({ repo: input.repositories.safety, events: bus, clock, logger });

  const alertIds = new IdSequence(input.config.nodeId);
  const alerts = new AlertService({
    repo: input.repositories.alerts,
    events: bus,
    ids: alertIds,
    clock,
  });

  const runner = new MonitorRunner({
    repo: input.repositories.monitors,
    events: bus,
    clock,
  });

  const intelligence = new IntelligenceService({
    providers,
    providerId: input.config.marketProviderId,
    sourceName: "binance",
    now,
  });

  const riskIds = new IdSequence(input.config.nodeId);
  const risk = new RiskService({
    intelligence,
    repo: input.repositories.risk,
    safety,
    nextId: () => riskIds.next(now()),
    now,
  });

  const entities = new EntityService(input.repositories.entities);

  const monitorIds = new IdSequence(input.config.nodeId);
  const monitors = new MonitorService({
    repo: input.repositories.monitors,
    entities, providers, events: bus, clock,
    nextId: () => monitorIds.next(now()),
  });

  // The executor supplies the CheckFn the existing runner calls. The runner's
  // scheduling, claiming and backoff are untouched.
  const executor = new MonitorExecutor({ intelligence, risk, alerts, providers, safety });

  const router = new NexusRouter({
    logger,
    rateLimiter: input.rateLimiter ?? new InMemoryRateLimiter(clock),
    authenticate: (token) => sessions.authenticate(token),
    now,
  });

  registerRoutes(router, {
    sessions, alerts,
    alertRepo: input.repositories.alerts,
    monitors, safety,
    providers, events: bus, intelligence, risk, entities,
    now,
    checkDatabase: input.checkDatabase ?? (async () => true),
    version: input.config.version,
  });

  const sse = createSseHandler({
    hub,
    authenticate: (token) => sessions.authenticate(token),
    logger,
  });

  return {
    router, hub, bus, alerts, providers, runner, monitors, executor, safety,
    intelligence, risk, entities, sessions, logger,

    runMonitorCycle: (limit = 50) => runner.runCycle(executor.check, limit),

    listen(port: number): Server {
      const server = createServer((req, res) => {
        // SSE is routed before the JSON router: it owns the socket for the
        // lifetime of the stream and cannot go through request/response.
        if ((req.url ?? "").startsWith("/v1/realtime")) {
          void sse(req, res);
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            headers[k] = Array.isArray(v) ? v.join(",") : v;
          }
          void router.handle({
            method: req.method ?? "GET",
            url: req.url ?? "/",
            headers,
            rawBody: Buffer.concat(chunks).toString("utf8"),
            ip: req.socket.remoteAddress ?? "unknown",
          }).then((result) => {
            res.writeHead(result.status, { "content-type": "application/json", ...result.headers });
            res.end(JSON.stringify(result.body));
          });
        });
      });
      server.listen(port);
      return server;
    },

    shutdown(): void {
      hub.closeAll();
      hub.detach();
    },
  };
}
