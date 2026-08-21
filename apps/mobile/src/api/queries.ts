/**
 * Typed API surface for the mobile app.
 *
 * Every call names its response contract, so a payload is validated before it
 * reaches a screen. There are no hand-written response models in the app —
 * the types come from @nexus/contracts, which is what makes a server change
 * a compile error rather than a runtime surprise.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT for React binding; the underlying client is
 * covered by verify.ts and the endpoints by the API's e2e suite.
 */

import {
  alert as alertContract,
  arrayOf,
  assetIntelligenceView,
  commandCenterView,
  monitor as monitorContract,
  nexusEvent,
  object,
  num,
  str,
  enumOf,
  riskView,
  providerStatus,
} from "@nexus/contracts";
import type { EntityRef, MonitorDraft } from "@nexus/contracts";
import { emergencyStopView } from "@nexus/contracts";
import { getClient } from "./session.ts";

const alertList = arrayOf(alertContract, { max: 100 });
/** 204 responses carry no body; nothing to validate. */
const nothing = { check: () => ({ ok: true as const, value: undefined }), safeParse: () => ({ ok: true as const, value: undefined }), parse: () => undefined };
const monitorList = arrayOf(monitorContract, { max: 100 });
const eventList = arrayOf(nexusEvent, { max: 200 });
const providerList = arrayOf(providerStatus, { max: 20 });
const searchResults = arrayOf(
  object({
    entity: object({ kind: str(), id: str(), label: str() }),
    score: num(),
    matchedOn: enumOf(["ID", "LABEL"] as const),
  }),
  { max: 50 },
);

export const api = {
  commandCenter: () => getClient().request("/v1/command-center", commandCenterView),

  alerts: (status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED") =>
    getClient().request(`/v1/alerts${status ? `?status=${status}` : ""}`, alertList),

  alert: (id: string) => getClient().request(`/v1/alerts/${id}`, alertContract),

  acknowledgeAlert: (id: string, note?: string) =>
    getClient().request(`/v1/alerts/${id}/acknowledge`, alertContract, {
      method: "POST",
      body: note === undefined ? {} : { note },
    }),

  resolveAlert: (id: string, note?: string) =>
    getClient().request(`/v1/alerts/${id}/resolve`, alertContract, {
      method: "POST",
      body: note === undefined ? {} : { note },
    }),

  intelligence: (entity: EntityRef) =>
    getClient().request(
      `/v1/intelligence/${entity.kind.toLowerCase()}/${encodeURIComponent(entity.id)}`,
      assetIntelligenceView,
    ),

  risk: (entity: EntityRef, dailyDrawdownPercent = 0) =>
    getClient().request(
      `/v1/risk/${entity.kind.toLowerCase()}/${encodeURIComponent(entity.id)}?dailyDrawdownPercent=${dailyDrawdownPercent}`,
      riskView,
    ),

  monitors: () => getClient().request("/v1/monitors", monitorList),

  createMonitor: (draft: MonitorDraft) =>
    getClient().request("/v1/monitors", monitorContract, { method: "POST", body: draft }),

  updateMonitor: (id: string, draft: MonitorDraft) =>
    getClient().request(`/v1/monitors/${id}`, monitorContract, { method: "PUT", body: draft }),

  setMonitorEnabled: (id: string, enabled: boolean) =>
    getClient().request(`/v1/monitors/${id}/${enabled ? "enable" : "disable"}`, monitorContract, { method: "POST" }),

  deleteMonitor: (id: string) =>
    getClient().request(`/v1/monitors/${id}`, nothing, { method: "DELETE" }),

  emergencyStop: () => getClient().request("/v1/safety/emergency-stop", emergencyStopView),

  activateEmergencyStop: (reason: string) =>
    getClient().request("/v1/safety/emergency-stop", emergencyStopView, { method: "POST", body: { reason } }),

  resetEmergencyStop: () =>
    getClient().request("/v1/safety/emergency-stop", emergencyStopView, { method: "DELETE" }),
  providers: () => getClient().request("/v1/providers", providerList),
  events: (limit = 50) => getClient().request(`/v1/events?limit=${limit}`, eventList),
  search: (term: string) =>
    getClient().request(`/v1/search?q=${encodeURIComponent(term)}`, searchResults),
};
