import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { risk, listQuery, locale } = vi.hoisted(() => ({ risk: { initialEquityUsd: 100_000, riskPerTradePercent: 1, maxDailyLossPercent: 3, maxDailyDrawdownPercent: 5, maxOpenPositions: 3, maxPortfolioExposurePercent: 60, maxAssetExposurePercent: 30, stopMethod: "fixed", fixedStopPercent: 3, atrMultiplier: 2, structureBufferBps: 25, minimumRewardRisk: 1.5, consecutiveLossLimit: 3, cooldownMinutes: 30, feeBps: 10, slippageBps: 10, blockHighVolatility: true }, listQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })), locale: { current: "en" } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ strategyLab: { list: { invalidate: vi.fn() }, get: { invalidate: vi.fn() } } }),
    strategyLab: {
      getDefaults: { useQuery: () => ({ data: { risk, simulationOnly: true } }) }, list: { useQuery: listQuery }, get: { useQuery: () => ({ data: null }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, update: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, duplicate: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, archive: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, run: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, getDatasetCandles: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) },
    },
  },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: locale.current }) }));
import StrategyLab from "./StrategyLab";

describe("Strategy Lab rendered states", () => {
  it("states the historical simulation boundary and does not fabricate a starter strategy", () => {
    listQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    const html = renderToStaticMarkup(createElement(StrategyLab));
    expect(html).toContain("Historical paper simulation");
    expect(html).toContain("No strategy is stored for this account");
    expect(html).toContain("no sample strategy is fabricated");
    expect(html).toContain("Risk Engine 2.1 enforced");
  });
  it("distinguishes unavailable private data from an empty user account", () => {
    listQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error("not authenticated") });
    const html = renderToStaticMarkup(createElement(StrategyLab));
    expect(html).toContain("Private strategy data is unavailable");
    expect(html).not.toContain("No strategy is stored for this account");
  });
  it("renders the strategy boundary and empty-account state in Arabic", () => {
    locale.current = "ar";
    listQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    const html = renderToStaticMarkup(createElement(StrategyLab));
    expect(html).toContain("مختبر الاستراتيجيات");
    expect(html).toContain("لا توجد استراتيجية محفوظة لهذا الحساب");
    expect(html).toContain("يُفرض محرك المخاطر 2.1");
    locale.current = "en";
  });
});
