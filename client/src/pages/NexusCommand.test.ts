import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ nexusCommand: { overview: { invalidate: vi.fn() }, timeline: { invalidate: vi.fn() } } }), nexusCommand: { overview: { useQuery: () => ({}) }, timeline: { useQuery: () => ({}) }, evaluateShield: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, previewAction: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, resolveApproval: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));

import NexusCommand from "./NexusCommand";

describe("NexusCommand access boundary", () => {
  it("shows an explicit protected evidence boundary without a trading-execution surface", () => {
    const html = renderToStaticMarkup(createElement(NexusCommand));
    expect(html).toContain("Sign in to inspect your account evidence");
    expect(html).toContain("Nexus Command");
    expect(html).not.toContain("Execute trade");
  });
});
