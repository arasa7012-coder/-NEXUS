import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ monitoring: { list: { invalidate: vi.fn() }, liveSnapshot: { invalidate: vi.fn() } } }), monitoring: { liveSnapshot: { useQuery: () => ({}) }, list: { useQuery: () => ({}) }, evaluate: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));

import PaperMonitor from "./PaperMonitor";

describe("PaperMonitor access boundary", () => {
  it("shows an explicit sign-in boundary and paper-only disclosure before protected monitoring is available", () => {
    const html = renderToStaticMarkup(createElement(PaperMonitor));
    expect(html).toContain("Sign in to view your paper-position monitoring.");
    expect(html).toContain("Read-only · paper trading");
    expect(html).not.toContain("Execute");
  });
});
