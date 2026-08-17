import { describe, expect, it } from "vitest";
import { defaultFeatureAccess, featureEntitlementDefinitions } from "./entitlements";

describe("Version 2.4 feature entitlement definitions", () => {
  it("defines Copilot and smart-alert feature seams without enforcing billing access", () => {
    expect(featureEntitlementDefinitions.copilot_basic.requiredTier).toBe("FREE");
    expect(featureEntitlementDefinitions.copilot_advanced.requiredTier).toBe("PRO");
    expect(featureEntitlementDefinitions.strategy_ai_analysis.requiredTier).toBe("ELITE");
    expect(defaultFeatureAccess("smart_alerts")).toMatchObject({ enabled: true, enforcement: "NOT_ENFORCED", requiredTier: "FREE" });
    expect(defaultFeatureAccess("advanced_alerts")).toMatchObject({ enabled: true, enforcement: "NOT_ENFORCED", requiredTier: "PRO" });
  });
});
