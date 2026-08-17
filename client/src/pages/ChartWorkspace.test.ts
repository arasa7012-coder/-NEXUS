import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useLiveMarketData", () => ({ useLiveTradingContext: () => ({ isLoading: false, isOnline: true, data: { success: true, data: { isStale: false, cachedAt: 1_700_000_000_000, candles: { source: "coinbase", candles: [{ openTime: 1_700_000_000_000, closeTime: 1_700_003_600_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }] } } } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { intelligence: { asset: { useQuery: () => ({ data: undefined, isLoading: false }) } }, marketData: { candles: { useQuery: () => ({ data: undefined, isLoading: false, error: undefined }) } } } }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: (key: string) => ({ chartWorkspace: "Candlestick workspace", liveVerified: "Live verified market data" }[key] ?? key) }) }));
vi.mock("@/contexts/WorkspaceDensityContext", () => ({ useWorkspaceDensity: () => ({ density: "comfortable", setDensity: vi.fn() }) }));
vi.mock("@/components/ProgressiveLiveCandles", () => ({ default: ({ symbol, source }: { symbol: string; source: string }) => createElement("div", { "data-chart": `${symbol}:${source}` }, "verified progressive candles") }));

import ChartWorkspace from "./ChartWorkspace";

describe("Chart workspace", () => {
  it("uses the existing verified progressive chart with real supported controls and explicit provider boundary", () => {
    const html = renderToStaticMarkup(createElement(ChartWorkspace));
    expect(html).toContain("Candlestick workspace");
    expect(html).toContain('aria-label="asset"');
    expect(html).toContain("1M");
    expect(html).toContain("5M");
    expect(html).toContain("15M");
    expect(html).toContain("1W · unavailable");
    expect(html).toContain("Compact");
    expect(html).toContain('data-chart="BTC:coinbase"');
    expect(html).toContain("verified progressive candles");
  });
});
