/**
 * HTTP edge.
 *
 * Built on node:http rather than Express. Two reasons, in order of importance:
 * it is executable in this environment, so every route, guard, and error path
 * below is actually tested rather than merely written; and the surface NEXUS
 * needs from a framework is small enough that the framework was mostly
 * ceremony. `NexusRouter` is under 100 lines and does exactly what is required.
 *
 * The layer is deliberately thin. It performs: request id assignment, logging,
 * security headers, rate limiting, authentication, body parsing, validation,
 * and error mapping. It contains no business logic — every handler delegates
 * into the domain services, which are independently tested.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ErrorCode, NexusError, Validator } from "@nexus/contracts";
import { ValidationError, isRetryable } from "@nexus/contracts";
import type { Logger } from "../platform/logger.ts";
import type { RateLimiter, RateLimitPolicy } from "../platform/rateLimit.ts";
import { POLICIES } from "../platform/rateLimit.ts";

export interface Principal {
  userId: string;
  sid: string;
  roles: string[];
}

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  principal: Principal | null;
  logger: Logger;
  ip: string;
}

export interface RouteResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export type Handler = (ctx: RequestContext) => Promise<RouteResult>;

export interface RouteDefinition {
  method: string;
  /** Supports `:param` segments. */
  pattern: string;
  handler: Handler;
  /** Authentication requirement. Default: required. */
  auth?: "required" | "optional" | "none";
  /** Role required in addition to authentication. */
  requireRole?: string;
  rateLimit?: RateLimitPolicy;
  /** Validates the request body before the handler runs. */
  input?: Validator<unknown>;
  /**
   * Validates the *response* before it leaves the process. A server that
   * breaks its own contract should fail here, in its own logs, rather than in
   * a user's app.
   */
  output?: Validator<unknown>;
}

/** HTTP error carrying a contract ErrorCode. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Array<{ path: string; message: string }>;

  constructor(status: number, code: ErrorCode, message: string, fields?: Array<{ path: string; message: string }>) {
    super(message);
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
    this.name = "HttpError";
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  // The API serves JSON only; these prevent a response being coerced into
  // something the browser will execute if one is ever opened directly.
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "cache-control": "no-store",
};

const MAX_BODY_BYTES = 256 * 1024;

interface CompiledRoute extends RouteDefinition {
  segments: string[];
}

export interface RouterDeps {
  logger: Logger;
  rateLimiter: RateLimiter;
  authenticate: (token: string) => Promise<Principal>;
  now: () => number;
}

export class NexusRouter {
  private readonly routes: CompiledRoute[] = [];
  private readonly deps: RouterDeps;

  constructor(deps: RouterDeps) {
    this.deps = deps;
  }

  add(route: RouteDefinition): this {
    this.routes.push({ ...route, segments: route.pattern.split("/").filter(Boolean) });
    return this;
  }

  private match(method: string, path: string): { route: CompiledRoute; params: Record<string, string> } | null {
    const parts = path.split("/").filter(Boolean);
    let pathMatched = false;

    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i]!;
        const part = parts[i]!;
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(part);
        else if (seg !== part) { ok = false; break; }
      }
      if (!ok) continue;
      pathMatched = true;
      if (route.method === method) return { route, params };
    }

    if (pathMatched) throw new HttpError(405, "NOT_FOUND", "That method is not allowed on this path.");
    return null;
  }

  /** Exposed for testing without binding a socket. */
  async handle(input: {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    rawBody: string;
    ip: string;
  }): Promise<RouteResult> {
    const requestId = input.headers["x-request-id"] ?? randomUUID();
    const url = new URL(input.url, "http://internal");
    const logger = this.deps.logger.child({ requestId, method: input.method, path: url.pathname });
    const startedAt = this.deps.now();

    try {
      const matched = this.match(input.method, url.pathname);
      if (!matched) throw new HttpError(404, "NOT_FOUND", "No such endpoint.");
      const { route, params } = matched;

      // --- rate limit (before auth: unauthenticated floods must be cheap) ---
      const policy = route.rateLimit ?? (input.method === "GET" ? POLICIES.read : POLICIES.write);
      const limitKey = `${route.pattern}:${input.ip}`;
      // The limiter may be shared-store backed, so the decision can be async.
      const decision = await this.deps.rateLimiter.check(limitKey, policy);
      if (!decision.allowed) {
        logger.warn("rate limit exceeded", { ip: input.ip, route: route.pattern });
        throw new HttpError(429, "RATE_LIMIT", "Too many requests.");
      }

      // --- authentication ---
      let principal: Principal | null = null;
      const authMode = route.auth ?? "required";
      if (authMode !== "none") {
        const header = input.headers.authorization ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (token) {
          try {
            principal = await this.deps.authenticate(token);
          } catch {
            // Never echo why: distinguishing "expired" from "forged" to an
            // unauthenticated caller is free information for an attacker.
            if (authMode === "required") throw new HttpError(401, "UNAUTHENTICATED", "Authentication required.");
          }
        } else if (authMode === "required") {
          throw new HttpError(401, "UNAUTHENTICATED", "Authentication required.");
        }
      }

      // --- authorization ---
      if (route.requireRole && !principal?.roles.includes(route.requireRole)) {
        logger.warn("authorization denied", { userId: principal?.userId, required: route.requireRole });
        throw new HttpError(403, "FORBIDDEN", "You do not have access to this.");
      }

      // --- body ---
      let body: unknown = undefined;
      if (input.rawBody) {
        if (Buffer.byteLength(input.rawBody) > MAX_BODY_BYTES) {
          throw new HttpError(413, "VALIDATION", "Request body is too large.");
        }
        try {
          body = JSON.parse(input.rawBody);
        } catch {
          throw new HttpError(400, "VALIDATION", "Request body is not valid JSON.");
        }
      }

      if (route.input) {
        try {
          body = route.input.parse(body);
        } catch (error) {
          const issues = error instanceof ValidationError ? error.issues : [];
          throw new HttpError(422, "VALIDATION", "The request was rejected as invalid.", issues);
        }
      }

      const ctx: RequestContext = {
        requestId,
        method: input.method,
        path: url.pathname,
        params,
        query: url.searchParams,
        body,
        principal,
        logger: principal ? logger.child({ userId: principal.userId }) : logger,
        ip: input.ip,
      };

      const result = await route.handler(ctx);

      // --- response contract enforcement ---
      if (route.output && result.status < 400) {
        try {
          route.output.parse(result.body);
        } catch (error) {
          const issues = error instanceof ValidationError ? error.issues : [];
          logger.error("response violated its own contract", { issues });
          throw new HttpError(500, "INTERNAL", "Internal response validation failed.");
        }
      }

      logger.info("request completed", {
        status: result.status,
        durationMs: this.deps.now() - startedAt,
      });

      return {
        ...result,
        headers: { ...SECURITY_HEADERS, ...result.headers, "x-request-id": requestId },
      };
    } catch (error) {
      const http = error instanceof HttpError
        ? error
        : new HttpError(500, "INTERNAL", "Something went wrong inside NEXUS.");

      if (http.status >= 500) {
        // Log the real cause; return the sanitised one.
        logger.error("request failed", {
          status: http.status,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } else {
        logger.warn("request rejected", { status: http.status, code: http.code });
      }

      const payload: NexusError = {
        code: http.code,
        message: http.message,
        retryable: isRetryable(http.code),
        traceId: requestId,
        ...(http.fields ? { fields: http.fields } : {}),
      };

      return {
        status: http.status,
        body: payload,
        headers: { ...SECURITY_HEADERS, "x-request-id": requestId },
      };
    }
  }

  /** Binds the router to a real node:http server. */
  listen(port: number): ReturnType<typeof createServer> {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          aborted = true;
          res.writeHead(413, { "content-type": "application/json", ...SECURITY_HEADERS });
          res.end(JSON.stringify({ code: "VALIDATION", message: "Request body is too large.", retryable: false, traceId: null }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (aborted) return;
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          headers[k] = Array.isArray(v) ? v.join(",") : v;
        }
        void this.handle({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          headers,
          rawBody: Buffer.concat(chunks).toString("utf8"),
          ip: req.socket.remoteAddress ?? "unknown",
        }).then((result) => {
          const payload = JSON.stringify(result.body);
          res.writeHead(result.status, { "content-type": "application/json", ...result.headers });
          res.end(payload);
        });
      });
    });

    server.listen(port);
    return server;
  }
}
