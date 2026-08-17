import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../services/entitlementService", () => ({
  entitlementAccountSummary: vi.fn(async () => ({ subscription: { plan: "FREE", state: "FREE", stateReason: "INITIAL_FREE", trialEndsAt: null, currentPeriodEndsAt: null }, plans: {}, features: [], paymentProviderConfigured: false, voiceProviderConfigured: false })),
  resolveEntitlement: vi.fn(async () => ({ featureKey: "parameter_search", allowed: false, reasonCode: "PLAN_FEATURE_DISABLED", requestedPlan: "FREE", effectivePlan: "FREE", subscriptionState: "FREE", requiredPlan: "PRO", subscription: { plan: "FREE", state: "FREE", stateReason: "INITIAL_FREE", trialEndsAt: null, currentPeriodEndsAt: null }, usage: { metric: "parameter_searches", limit: 0, used: 0, remaining: 0 } })),
}));
vi.mock("../voice/provider", () => ({ getNexusVoiceProvider: () => ({ getReadiness: () => ({ configured: false, status: "NOT_CONFIGURED" }) }) }));

import { subscriptionsRouter } from "./subscriptions";

const user = { id: 27, openId: "subscription-user", email: null, name: "Subscriber", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const context = (currentUser: TrpcContext["user"]): TrpcContext => ({ user: currentUser, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

describe("subscriptions router", () => {
  it("shows configurable plans without claiming payment configuration", async () => {
    const result = await subscriptionsRouter.createCaller(context(null)).plans();
    expect(result.paymentProviderConfigured).toBe(false);
    expect(result.paymentNotice).toContain("not configured");
    expect(result.plans.FREE.limits.strategies).toBe(3);
  });
  it("rejects client-side attempts to inspect account, check features, or preview upgrades without a session", async () => {
    const caller = subscriptionsRouter.createCaller(context(null));
    await expect(caller.account()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.check({ featureKey: "parameter_search" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.upgradePreview({ targetPlan: "ELITE" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns a server-backed informational upgrade preview without checkout", async () => {
    const result = await subscriptionsRouter.createCaller(context(user)).upgradePreview({ targetPlan: "PRO" });
    expect(result).toMatchObject({ targetPlan: "PRO", providerState: "NOT_CONFIGURED", canCheckout: false });
  });
  it("never exposes admin account inspection to a normal user", async () => {
    await expect(subscriptionsRouter.createCaller(context(user)).adminAccount({ userId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
