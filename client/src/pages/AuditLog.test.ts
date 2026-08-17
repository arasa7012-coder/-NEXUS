import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { locale } = vi.hoisted(() => ({ locale: { current: "ar" } }));
vi.mock("@/lib/trpc", () => ({ trpc: { risk: { getAuditHistory: { useQuery: () => ({ data: { decisions: [], events: [] }, isLoading: false, isFetching: false, refetch: vi.fn() }) } } } }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: locale.current }) }));
import AuditLog from "./AuditLog";

describe("Risk Audit Arabic rendered state", () => {
  it("renders Arabic audit headings and explicit empty evidence states", () => {
    const html = renderToStaticMarkup(createElement(AuditLog));
    expect(html).toContain("سجل تدقيق المخاطر");
    expect(html).toContain("لا توجد قرارات تداول ورقي مسجلة لهذا الحساب");
    expect(html).toContain("لا توجد أحداث سلامة مسجلة");
  });
});
