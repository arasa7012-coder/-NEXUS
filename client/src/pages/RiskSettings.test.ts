import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { locale } = vi.hoisted(() => ({ locale: { current: "ar" } }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ risk: { getRiskSettings: { invalidate: vi.fn() } } }), risk: { getRiskSettings: { useQuery: () => ({ data: null }) }, updateRiskSettings: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: locale.current }) }));
import RiskSettings from "./RiskSettings";

describe("Risk Settings Arabic rendered state", () => {
  it("renders the protected loading state in Arabic without inventing settings", () => {
    const html = renderToStaticMarkup(createElement(RiskSettings));
    expect(html).toContain("جارٍ تحميل إعدادات حماية التداول الورقي");
  });
});
