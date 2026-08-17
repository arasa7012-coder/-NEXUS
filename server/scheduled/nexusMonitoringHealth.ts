import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { runManagedMonitoringHealthCheck } from "../services/nexusCommandService";
import { runScheduledMonitoring } from "./scheduledMonitoringRunner";

/** Platform Heartbeat callback. It is deliberately project-scoped and does not impersonate or mutate a user portfolio. */
export async function nexusMonitoringHealthHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    // Execute monitoring FIRST, then report health. Ordering matters: the health
    // check measures freshness of stored observations, so running it before the
    // evaluation would always report the previous tick's staleness.
    const execution = await runScheduledMonitoring();
    const result = await runManagedMonitoringHealthCheck(user.taskUid, execution);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString(), context: { path: "/api/scheduled/nexus-monitoring-health" } });
  }
}
