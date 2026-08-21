/**
 * SSE endpoint.
 *
 * Kept apart from the JSON router because it inverts the router's contract:
 * a normal handler returns once with a body, whereas this holds the socket
 * open and writes for as long as the client stays connected. Forcing it into
 * the same shape would have meant weakening the router's response handling for
 * every other route.
 *
 * Authentication runs before the stream is opened. An unauthenticated client
 * gets a normal 401 rather than an open socket that never delivers anything.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { EventType } from "@nexus/contracts";
import { EVENT_TYPES } from "@nexus/contracts";
import type { RealtimeHub } from "./realtime.ts";
import type { Logger } from "../platform/logger.ts";

export interface SseDeps {
  hub: RealtimeHub;
  authenticate: (token: string) => Promise<{ userId: string; sid: string; roles: string[] }>;
  logger: Logger;
  heartbeatMs?: number;
}

export function createSseHandler(deps: SseDeps) {
  return async function handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://internal");
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
      res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ code: "UNAUTHENTICATED", message: "Authentication required.", retryable: false, traceId: null }));
      return;
    }

    let principal: { userId: string };
    try {
      principal = await deps.authenticate(token);
    } catch {
      res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ code: "UNAUTHENTICATED", message: "Authentication required.", retryable: false, traceId: null }));
      return;
    }

    // Only known event types are honoured; an unknown filter would silently
    // subscribe the client to nothing at all.
    const requested = (url.searchParams.get("types") ?? "")
      .split(",").map((t) => t.trim()).filter(Boolean)
      .filter((t): t is EventType => (EVENT_TYPES as readonly string[]).includes(t));

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
      // Defeats proxy buffering, which otherwise holds frames until a buffer
      // fills and makes a working stream look dead.
      "x-accel-buffering": "no",
    });

    const connectionId = randomUUID();
    const lastEventId = (req.headers["last-event-id"] as string | undefined) ?? url.searchParams.get("lastEventId") ?? undefined;

    const connection = {
      id: connectionId,
      userId: principal.userId,
      types: new Set(requested),
      send: (frame: string) => { res.write(frame); },
      close: () => { res.end(); },
    };

    deps.hub.add(connection, lastEventId);
    deps.logger.info("realtime connected", {
      userId: principal.userId, connectionId, filters: requested.length,
    });

    // A comment frame immediately, so the client sees bytes and can move to
    // OPEN without waiting for the first real event.
    res.write(`: connected ${connectionId}\n\n`);

    const heartbeat = setInterval(() => {
      try { res.write(`: heartbeat ${Date.now()}\n\n`); }
      catch { clearInterval(heartbeat); }
    }, deps.heartbeatMs ?? 20_000);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      deps.hub.remove(connectionId);
      deps.logger.info("realtime disconnected", { userId: principal.userId, connectionId });
    };

    req.on("close", cleanup);
    req.on("error", cleanup);
  };
}
