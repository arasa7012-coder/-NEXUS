/**
 * Route table.
 *
 * Every route is one line of policy (auth, role, rate limit, input contract,
 * output contract) plus a handler that delegates immediately into a domain
 * service. If a handler here grows past a few lines it belongs in the domain
 * layer instead.
 */

import { object, str, optional, arrayOf } from "@nexus/contracts";
import type { Alert, CommandCenterView } from "@nexus/contracts";
import {
  alert as alertContract,
  assetIntelligenceView,
  commandCenterView,
  compareAlerts,
  emergencyStopView,
  monitor as monitorContract,
  monitorDraft,
  riskView,
} from "@nexus/contracts";

/**
 * Domain error -> HTTP status.
 *
 * A monitor belonging to another user surfaces as 404, never 403: telling a
 * caller "that exists but is not yours" is an enumeration oracle.
 */
function toHttp(error: unknown): HttpError {
  if (!(error instanceof MonitorError)) return error as HttpError;
  switch (error.reason) {
    case "NOT_FOUND":
    case "FORBIDDEN":
      return new HttpError(404, "NOT_FOUND", "That monitor does not exist.");
    case "LIMIT_REACHED":
      return new HttpError(409, "CONFLICT", error.message);
    case "UNKNOWN_TARGET":
    case "UNKNOWN_PROVIDER":
    case "UNSUPPORTED_TYPE":
    case "INVALID":
      return new HttpError(422, "VALIDATION", error.message, error.fields);
  }
}
import { HttpError, NexusRouter } from "./router.ts";
import type { RequestContext, RouteResult } from "./router.ts";
import { POLICIES } from "../platform/rateLimit.ts";
import { AuthError, SessionService } from "../auth/session.ts";
import type { AlertService, AlertRepository } from "../domain/alerts/alertService.ts";
import type { IntelligenceService } from "../domain/intelligence/intelligenceService.ts";
import type { RiskService } from "../domain/risk/riskService.ts";
import type { EntityService } from "../domain/entities/entityService.ts";
import type { ProviderRegistry } from "../domain/providers/registry.ts";
import type { MonitorService } from "../domain/monitoring/monitorService.ts";
import { MonitorError } from "../domain/monitoring/monitorService.ts";
import type { SafetyService } from "../domain/safety/safetyService.ts";
import type { InMemoryEventBus } from "../platform/events.ts";

const loginInput = object({
  email: str({ min: 3, max: 254 }),
  password: str({ min: 1, max: 400 }),
});

const refreshInput = object({
  sid: str({ min: 1, max: 64 }),
  refreshToken: str({ min: 1, max: 400 }),
});

const acknowledgeInput = object({
  note: optional(str({ max: 400 })),
});

export interface ApiDeps {
  sessions: SessionService;
  alerts: AlertService;
  alertRepo: AlertRepository;
  monitors: MonitorService;
  safety: SafetyService;
  providers: ProviderRegistry;
  events: InMemoryEventBus;
  intelligence: IntelligenceService;
  risk: RiskService;
  entities: EntityService;
  now: () => number;
  /** Reports whether the datastore is reachable. */
  checkDatabase: () => Promise<boolean>;
  version: string;
}

function authFailureStatus(reason: string): number {
  return reason === "ACCOUNT_DISABLED" ? 403 : 401;
}

export function registerRoutes(router: NexusRouter, deps: ApiDeps): NexusRouter {
  // --- health -------------------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/health",
    auth: "none",
    handler: async (): Promise<RouteResult> => {
      // Liveness only: answers "is this process up", never touches dependencies.
      // Mixing liveness with dependency checks makes an orchestrator restart a
      // healthy API because a provider is down.
      return { status: 200, body: { status: "ok", version: deps.version, at: deps.now() } };
    },
  });

  router.add({
    method: "GET",
    pattern: "/health/ready",
    auth: "none",
    handler: async (): Promise<RouteResult> => {
      const dbOk = await deps.checkDatabase();
      const providers = deps.providers.status();
      const failing = providers.filter((p) => p.state === "FAILING");
      // Providers being down does NOT make the API unready — NEXUS is designed
      // to report UNAVAILABLE rather than to stop serving. Only the datastore
      // is load-bearing for readiness.
      return {
        status: dbOk ? 200 : 503,
        body: {
          status: dbOk ? "ready" : "not_ready",
          database: dbOk ? "ok" : "unreachable",
          providers,
          degraded: failing.length > 0,
          at: deps.now(),
        },
      };
    },
  });

  // --- auth ---------------------------------------------------------------
  router.add({
    method: "POST",
    pattern: "/v1/auth/login",
    auth: "none",
    rateLimit: POLICIES.auth,
    input: loginInput,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const { email, password } = ctx.body as { email: string; password: string };
      try {
        const { tokens, user } = await deps.sessions.login(email, password);
        ctx.logger.info("login succeeded", { userId: user.id });
        return { status: 200, body: { ...tokens, user: { id: user.id, email: user.email, roles: user.roles } } };
      } catch (error) {
        if (error instanceof AuthError) {
          ctx.logger.warn("login failed", { reason: error.reason });
          throw new HttpError(authFailureStatus(error.reason), "UNAUTHENTICATED", error.message);
        }
        throw error;
      }
    },
  });

  router.add({
    method: "POST",
    pattern: "/v1/auth/refresh",
    auth: "none",
    rateLimit: POLICIES.auth,
    input: refreshInput,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const { sid, refreshToken } = ctx.body as { sid: string; refreshToken: string };
      try {
        return { status: 200, body: await deps.sessions.refresh(sid, refreshToken) };
      } catch (error) {
        if (error instanceof AuthError) {
          throw new HttpError(401, "UNAUTHENTICATED", error.message);
        }
        throw error;
      }
    },
  });

  router.add({
    method: "POST",
    pattern: "/v1/auth/logout",
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      await deps.sessions.logout(ctx.principal!.sid);
      return { status: 204, body: null };
    },
  });

  router.add({
    method: "GET",
    pattern: "/v1/auth/me",
    handler: async (ctx: RequestContext): Promise<RouteResult> => ({
      status: 200,
      body: { userId: ctx.principal!.userId, roles: ctx.principal!.roles },
    }),
  });

  // --- command center -----------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/v1/command-center",
    output: commandCenterView,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const userId = ctx.principal!.userId;
      const [criticalRaw, unread] = await Promise.all([
        deps.alertRepo.list({ status: "OPEN", limit: 20 }),
        deps.alertRepo.countUnread(),
      ]);
      const critical = criticalRaw
        .filter((a) => a.severity === "CRITICAL" || a.severity === "WARNING")
        .sort(compareAlerts)
        .slice(0, 10);

      const monitors = await deps.monitors.list(userId, 50);
      const providers = deps.providers.status();

      const anyCritical = critical.some((a) => a.severity === "CRITICAL");
      const anyFailing = providers.some((p) => p.state === "FAILING")
        || monitors.some((m) => m.state === "FAILING" || m.state === "STOPPED");

      const view: CommandCenterView = {
        generatedAt: deps.now(),
        systemState: anyCritical ? "CRITICAL" : anyFailing ? "DEGRADED" : "NOMINAL",
        criticalAlerts: critical,
        unreadAlertCount: unread,
        risk: null,
        monitors,
        providers,
        recentEvents: deps.events.recent(20),
      };
      return { status: 200, body: view };
    },
  });

  // --- alerts -------------------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/v1/alerts",
    output: arrayOf(alertContract, { max: 100 }),
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const statusParam = ctx.query.get("status");
      const limit = Math.min(Number(ctx.query.get("limit") ?? 50) || 50, 100);
      const filter = statusParam && ["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(statusParam)
        ? { status: statusParam as Alert["status"], limit }
        : { limit };
      const list = await deps.alertRepo.list(filter);
      return { status: 200, body: [...list].sort(compareAlerts) };
    },
  });

  router.add({
    method: "GET",
    pattern: "/v1/alerts/:id",
    output: alertContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const found = await deps.alertRepo.findById(ctx.params.id!);
      if (!found) throw new HttpError(404, "NOT_FOUND", "That alert no longer exists.");
      return { status: 200, body: found };
    },
  });

  router.add({
    method: "POST",
    pattern: "/v1/alerts/:id/acknowledge",
    input: acknowledgeInput,
    output: alertContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const note = (ctx.body as { note?: string } | undefined)?.note ?? null;
      try {
        return { status: 200, body: await deps.alerts.acknowledge(ctx.params.id!, note) };
      } catch {
        throw new HttpError(404, "NOT_FOUND", "That alert no longer exists.");
      }
    },
  });

  router.add({
    method: "POST",
    pattern: "/v1/alerts/:id/resolve",
    input: acknowledgeInput,
    output: alertContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const note = (ctx.body as { note?: string } | undefined)?.note ?? null;
      try {
        return { status: 200, body: await deps.alerts.resolve(ctx.params.id!, note) };
      } catch {
        throw new HttpError(404, "NOT_FOUND", "That alert no longer exists.");
      }
    },
  });

  // --- monitoring & providers --------------------------------------------
  // --- monitors -----------------------------------------------------------
  //
  // Every handler passes ctx.principal.userId into the service, which scopes
  // the query itself. Ownership is therefore enforced in the domain, not by a
  // check a route could forget.

  router.add({
    method: "GET",
    pattern: "/v1/monitors",
    output: arrayOf(monitorContract, { max: 100 }),
    handler: async (ctx: RequestContext): Promise<RouteResult> => ({
      status: 200,
      body: await deps.monitors.list(ctx.principal!.userId, 100),
    }),
  });

  router.add({
    method: "POST",
    pattern: "/v1/monitors",
    input: monitorDraft,
    output: monitorContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      try {
        const created = await deps.monitors.create(ctx.principal!.userId, ctx.body as never);
        ctx.logger.info("monitor created", { monitorId: created.id, type: created.type });
        return { status: 201, body: created };
      } catch (error) {
        throw toHttp(error);
      }
    },
  });

  router.add({
    method: "GET",
    pattern: "/v1/monitors/:id",
    output: monitorContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      try {
        return { status: 200, body: await deps.monitors.get(ctx.principal!.userId, ctx.params.id!) };
      } catch (error) {
        throw toHttp(error);
      }
    },
  });

  router.add({
    method: "PUT",
    pattern: "/v1/monitors/:id",
    input: monitorDraft,
    output: monitorContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      try {
        return { status: 200, body: await deps.monitors.update(ctx.principal!.userId, ctx.params.id!, ctx.body as never) };
      } catch (error) {
        throw toHttp(error);
      }
    },
  });

  router.add({
    method: "POST",
    pattern: "/v1/monitors/:id/enable",
    output: monitorContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      try {
        return { status: 200, body: await deps.monitors.setEnabled(ctx.principal!.userId, ctx.params.id!, true) };
      } catch (error) {
        throw toHttp(error);
      }
    },
  });

  router.add({
    method: "POST",
    pattern: "/v1/monitors/:id/disable",
    output: monitorContract,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      try {
        return { status: 200, body: await deps.monitors.setEnabled(ctx.principal!.userId, ctx.params.id!, false) };
      } catch (error) {
        throw toHttp(error);
      }
    },
  });

  router.add({
    method: "DELETE",
    pattern: "/v1/monitors/:id",
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      try {
        await deps.monitors.delete(ctx.principal!.userId, ctx.params.id!);
        return { status: 204, body: null };
      } catch (error) {
        throw toHttp(error);
      }
    },
  });

  // --- emergency stop -----------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/v1/safety/emergency-stop",
    output: emergencyStopView,
    handler: async (ctx: RequestContext): Promise<RouteResult> => ({
      status: 200,
      body: await deps.safety.current(ctx.principal!.userId),
    }),
  });

  router.add({
    method: "POST",
    pattern: "/v1/safety/emergency-stop",
    input: object({ reason: str({ min: 3, max: 280 }) }),
    output: emergencyStopView,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const { reason } = ctx.body as { reason: string };
      const userId = ctx.principal!.userId;
      // The actor is the authenticated principal, never a client-supplied
      // value: an audit trail an attacker can forge is worse than none.
      const view = await deps.safety.activate({ userId, reason, actor: userId });
      ctx.logger.warn("emergency stop activated", { userId });
      return { status: 200, body: view };
    },
  });

  router.add({
    method: "DELETE",
    pattern: "/v1/safety/emergency-stop",
    output: emergencyStopView,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const userId = ctx.principal!.userId;
      const view = await deps.safety.reset({ userId, actor: userId });
      ctx.logger.warn("emergency stop reset", { userId });
      return { status: 200, body: view };
    },
  });

  router.add({
    method: "GET",
    pattern: "/v1/providers",
    handler: async (): Promise<RouteResult> => ({ status: 200, body: deps.providers.status() }),
  });

  // --- admin --------------------------------------------------------------
  router.add({
    method: "POST",
    pattern: "/v1/admin/sessions/revoke",
    requireRole: "admin",
    input: object({ userId: str({ min: 1, max: 64 }) }),
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const { userId } = ctx.body as { userId: string };
      const revoked = await deps.sessions.logoutAll(userId);
      ctx.logger.info("sessions revoked by admin", { targetUserId: userId, revoked });
      return { status: 200, body: { revoked } };
    },
  });

  // --- intelligence -------------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/v1/intelligence/:kind/:id",
    output: assetIntelligenceView,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const entity = await deps.entities.resolve(ctx.params.kind!.toUpperCase() as never, ctx.params.id!);
      if (!entity) throw new HttpError(404, "NOT_FOUND", "That entity is not known to NEXUS.");
      // Every number in the response originates in @nexus/core. If providers
      // are down the view comes back with UNAVAILABLE scores and reasons —
      // this handler has no fallback path because there must not be one.
      return { status: 200, body: await deps.intelligence.forAsset(entity) };
    },
  });

  // --- risk ---------------------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/v1/risk/:kind/:id",
    output: riskView,
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const entity = await deps.entities.resolve(ctx.params.kind!.toUpperCase() as never, ctx.params.id!);
      if (!entity) throw new HttpError(404, "NOT_FOUND", "That entity is not known to NEXUS.");
      const drawdown = Number(ctx.query.get("dailyDrawdownPercent") ?? 0);
      if (!Number.isFinite(drawdown) || drawdown < 0 || drawdown > 100) {
        throw new HttpError(422, "VALIDATION", "dailyDrawdownPercent must be between 0 and 100.");
      }
      return {
        status: 200,
        body: await deps.risk.evaluate({
          userId: ctx.principal!.userId,
          entity,
          dailyDrawdownPercent: drawdown,
        }),
      };
    },
  });

  router.add({
    method: "GET",
    pattern: "/v1/risk/:kind/:id/history",
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const entity = await deps.entities.resolve(ctx.params.kind!.toUpperCase() as never, ctx.params.id!);
      if (!entity) throw new HttpError(404, "NOT_FOUND", "That entity is not known to NEXUS.");
      const limit = Math.min(Number(ctx.query.get("limit") ?? 30) || 30, 100);
      return { status: 200, body: await deps.risk.history(entity, limit) };
    },
  });

  // --- entities & search --------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/v1/search",
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const term = ctx.query.get("q") ?? "";
      if (term.trim().length === 0) return { status: 200, body: [] };
      const limit = Math.min(Number(ctx.query.get("limit") ?? 20) || 20, 50);
      return { status: 200, body: await deps.entities.search(term, limit) };
    },
  });

  router.add({
    method: "GET",
    pattern: "/v1/entities/:kind/:id",
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const entity = await deps.entities.resolve(ctx.params.kind!.toUpperCase() as never, ctx.params.id!);
      if (!entity) throw new HttpError(404, "NOT_FOUND", "That entity is not known to NEXUS.");
      return { status: 200, body: entity };
    },
  });

  // --- events -------------------------------------------------------------
  router.add({
    method: "GET",
    pattern: "/v1/events",
    handler: async (ctx: RequestContext): Promise<RouteResult> => {
      const limit = Math.min(Number(ctx.query.get("limit") ?? 50) || 50, 200);
      return { status: 200, body: deps.events.recent(limit) };
    },
  });

  return router;
}
