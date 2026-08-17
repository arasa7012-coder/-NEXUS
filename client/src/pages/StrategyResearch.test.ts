import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { privateError, locale } = vi.hoisted(() => ({ privateError: { current: null as Error | null }, locale: { current: "en" } }));
vi.mock("@/lib/trpc", () => ({
  trpc: (() => {
    const query = (data: unknown = undefined) => () => ({ data, isLoading: false, error: privateError.current });
    return { useUtils: () => ({ strategyLab: { listDatasets: { invalidate: vi.fn() } } }), strategyLab: {
      list: { useQuery: query([]) }, listDatasets: { useQuery: query([]) }, listRuns: { useQuery: query([]) }, getFeatureEntitlements: { useQuery: query([]) }, listTrustedPublisherKeys: { useQuery: query([]) },
      importCsvDataset: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, previewCsvAuthentication: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, registerTrustedPublisherKey: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, revokeTrustedPublisherKey: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, launchParameterSearch: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, compareRuns: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    }, subscriptions: { check: { useQuery: () => ({ data: { decision: { allowed: true } }, isLoading: false, error: null }) } } };
    },
  )(),
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: locale.current }) }));
import StrategyResearch from "./StrategyResearch";

describe("Strategy Research rendered states", () => {
  it("discloses CSV verification, bounded research, and unavailable historical order book without fabricated data", () => {
    privateError.current = null;
    const html = renderToStaticMarkup(createElement(StrategyResearch));
    expect(html).toContain("Import documented OHLCV CSV");
    expect(html).toContain("Controlled parameter search");
    expect(html).toContain("No verified dataset is stored for this account");
    expect(html).toContain("Unavailable historical microstructure");
    expect(html).toContain("do not prove future performance");
  });
  it("distinguishes unavailable private research data from a user's empty dataset list", () => {
    privateError.current = new Error("not authenticated");
    const html = renderToStaticMarkup(createElement(StrategyResearch));
    expect(html).toContain("Private research data is unavailable");
    expect(html).not.toContain("No verified dataset is stored for this account");
  });
  it("renders CSV import, bounded search, and research boundary in Arabic", () => {
    privateError.current = null;
    locale.current = "ar";
    const html = renderToStaticMarkup(createElement(StrategyResearch));
    expect(html).toContain("استيراد CSV موثق");
    expect(html).toContain("بحث مقيد للمعلمات");
    expect(html).toContain("لا توجد مجموعة بيانات متحققة محفوظة لهذا الحساب");
    expect(html).toContain("البنية الدقيقة التاريخية غير متاحة");
    locale.current = "en";
  });
});
