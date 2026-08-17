import { describe, expect, it } from "vitest";
import { effectivePlanForState, isSubscriptionStateEntitled, planConfiguration } from "./catalog";

describe("Nexus V3.0 plan catalog", () => {
  it("keeps feature access and limits centralized by plan", () => {
    expect(planConfiguration.FREE.enabled).toContain("market_basic");
    expect(planConfiguration.FREE.enabled).not.toContain("parameter_search");
    expect(planConfiguration.PRO.enabled).toContain("parameter_search");
    expect(planConfiguration.ELITE.enabled).toContain("premium_voice");
    expect(planConfiguration.FREE.limits.strategies).toBe(3);
    expect(planConfiguration.PRO.limits.ai_requests).toBeGreaterThan(planConfiguration.FREE.limits.ai_requests);
  });

  it("does not grant a trial automatically and restricts past-due, canceled, and expired paid subscriptions", () => {
    expect(planConfiguration.FREE.trialDays).toBe(0);
    expect(isSubscriptionStateEntitled("FREE")).toBe(true);
    expect(isSubscriptionStateEntitled("TRIALING")).toBe(true);
    expect(isSubscriptionStateEntitled("ACTIVE")).toBe(true);
    expect(isSubscriptionStateEntitled("PAST_DUE")).toBe(false);
    expect(isSubscriptionStateEntitled("CANCELED")).toBe(false);
    expect(isSubscriptionStateEntitled("EXPIRED")).toBe(false);
    expect(effectivePlanForState("PRO", "ACTIVE")).toBe("PRO");
    expect(effectivePlanForState("ELITE", "TRIALING")).toBe("ELITE");
    expect(effectivePlanForState("PRO", "PAST_DUE")).toBe("FREE");
    expect(effectivePlanForState("ELITE", "CANCELED")).toBe("FREE");
    expect(effectivePlanForState("PRO", "EXPIRED")).toBe("FREE");
  });
});
