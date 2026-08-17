import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: false }));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.authenticated ? { id: 7 } : null, loading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/smart-money", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  onChain: {
    health: { useQuery: () => ({ data: { networks: [{ status: "CONNECTED", supportedChains: ["ethereum"] }, { status: "CONNECTED", supportedChains: ["base"] }] } }) },
    watchlist: { useQuery: () => ({ data: state.authenticated ? [{ watchlist: { id: 4 }, wallet: { id: 12, chain: "ethereum", address: "0x1111111111111111111111111111111111111111", dataQuality: "VERIFIED" }, latestScore: { classification: "WEAK", smartMoneyScore: "42" } }] : [], isFetching: false, refetch: vi.fn() }) },
    explainAccess: { useQuery: () => ({ data: { allowed: true, usage: { remaining: 3 } } }) },
    lookup: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    watch: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
} }));

import SmartMoney from "./SmartMoney";

describe("Smart Money Radar", () => {
  it("keeps wallet research behind an authenticated session", () => {
    state.authenticated = false;
    const html = renderToStaticMarkup(createElement(SmartMoney));
    expect(html).toContain("smartMoney");
    expect(html).toContain("Sign in to inspect public wallets");
    expect(html).not.toContain("0x1111111111111111111111111111111111111111");
  });

  it("renders only user-owned watchlist metadata and explicit source-backed status", () => {
    state.authenticated = true;
    const html = renderToStaticMarkup(createElement(SmartMoney));
    expect(html).toContain("providerConnected");
    expect(html).toContain("ethereum");
    expect(html).toContain("0x1111111111111111111111111111111111111111");
    expect(html).toContain("VERIFIED");
    expect(html).toContain("WEAK");
    expect(html).toContain("42");
    expect(html).toContain("Only wallets you deliberately add are visible");
    expect(html).toContain("DATA SOURCE NOT AVAILABLE");
    expect(html).toContain("Cluster / entity attribution");
  });
});
