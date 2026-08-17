import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../services/paperPositionMonitoringService", () => ({ evaluatePaperPositionMonitoring: vi.fn(), listPaperPositionMonitoring: vi.fn() }));
vi.mock("../services/notificationReadinessService", () => ({ getNotificationReadiness: vi.fn(), updateNotificationReadiness: vi.fn(), registerDeviceReadiness: vi.fn(), revokeDeviceReadiness: vi.fn() }));
vi.mock("../services/entitlementService", () => ({ EntitlementError: class EntitlementError extends Error {}, requireEntitlement: vi.fn(), consumeEntitlementUsage: vi.fn() }));

import { evaluatePaperPositionMonitoring, listPaperPositionMonitoring } from "../services/paperPositionMonitoringService";
import { getNotificationReadiness, registerDeviceReadiness, revokeDeviceReadiness } from "../services/notificationReadinessService";
import { consumeEntitlementUsage, requireEntitlement } from "../services/entitlementService";
import { monitoringRouter } from "./monitoring";

const authenticated = (): TrpcContext => ({ user: { id: 88, openId: "monitor-user", email: null, name: "Monitor", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const anonymous = (): TrpcContext => ({ ...authenticated(), user: null });

describe("monitoring router", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not expose monitoring, consent, or device state to an anonymous caller", async () => {
    const caller = monitoringRouter.createCaller(anonymous());
    await expect(caller.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.notificationReadiness()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(listPaperPositionMonitoring).not.toHaveBeenCalled(); expect(getNotificationReadiness).not.toHaveBeenCalled();
  });
  it("scopes monitor evaluation and device readiness to the authenticated user", async () => {
    vi.mocked(evaluatePaperPositionMonitoring).mockResolvedValue({ simulation: true, positions: [], transitions: [], evaluatedAt: 1, execution: "USER_REQUESTED_ONLY" } as never);
    vi.mocked(registerDeviceReadiness).mockResolvedValue({ externalDeliveryActive: false } as never);
    vi.mocked(revokeDeviceReadiness).mockResolvedValue({ externalDeliveryActive: false } as never);
    const caller = monitoringRouter.createCaller(authenticated());
    await caller.evaluate(); await caller.registerDeviceReadiness({ devicePublicId: "browser-device-123", platform: "WEB", permissionState: "GRANTED" }); await caller.revokeDevice({ devicePublicId: "browser-device-123" });
    expect(requireEntitlement).toHaveBeenCalledWith(88, "continuous_monitoring");
    expect(evaluatePaperPositionMonitoring).toHaveBeenCalledWith(88);
    expect(consumeEntitlementUsage).toHaveBeenCalledWith(88, "continuous_monitoring");
    expect(registerDeviceReadiness).toHaveBeenCalledWith(88, { devicePublicId: "browser-device-123", platform: "WEB", permissionState: "GRANTED" });
    expect(revokeDeviceReadiness).toHaveBeenCalledWith(88, "browser-device-123");
  });
});
