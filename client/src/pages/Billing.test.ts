import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false, summary: null as any }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: state.authenticated }) }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { subscriptions: { account: { useQuery: () => ({ data: state.summary, isLoading: false, isFetching: false, refetch: vi.fn() }) }, voiceReadiness: { useQuery: () => ({ data: { configured: false } }) } } } }));

import Billing from "./Billing";

const summary = {
  subscription: { plan: "PRO", state: "ACTIVE", stateReason: "PROVIDER_CONFIRMED", currentPeriodEndsAt: new Date("2026-09-01T00:00:00.000Z") },
  features: [
    { featureKey: "ai_copilot_advanced", allowed: true, requiredPlan: "PRO", reasonCode: "PLAN_GRANTED", usage: { limit: 100, used: 20, remaining: 80 } },
    { featureKey: "parameter_search", allowed: false, requiredPlan: "ELITE", reasonCode: "PLAN_FEATURE_DISABLED", usage: { limit: 0, used: 0, remaining: 0 } },
    { featureKey: "market_basic", allowed: true, requiredPlan: "FREE", reasonCode: "PLAN_GRANTED", usage: { limit: 2_000_000_000, used: 0, remaining: 2_000_000_000 } },
  ],
};

describe("Billing subscription dashboard", () => {
  it("keeps plan and usage unavailable until an account is authenticated", () => {
    state.authenticated = false; state.summary = null;
    const html = renderToStaticMarkup(createElement(Billing));
    expect(html).toContain("Sign in to view your server-owned plan");
    expect(html).not.toContain("Feature access and usage");
  });
  it("renders server-owned plan status, available and locked features, and remaining capacity", () => {
    state.authenticated = true; state.summary = summary;
    const html = renderToStaticMarkup(createElement(Billing));
    expect(html).toContain("Nexus PRO");
    expect(html).toContain("Ai Copilot Advanced");
    expect(html).toContain("80 remaining of 100");
    expect(html).toContain("Parameter Search");
    expect(html).toContain("Requires ELITE");
    expect(html).toContain("Limit reached");
    expect(html).toContain("Configured unlimited");
    expect(html).toContain("Payment provider not configured");
    expect(html).not.toContain("Payment successful");
  });
});
