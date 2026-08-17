import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const liveHistoryQuery = vi.hoisted(() => vi.fn()); const activeCandleQuery = vi.hoisted(() => vi.fn()); const chartPreferenceQuery = vi.hoisted(() => vi.fn()); const savePreferenceMutation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trpc", () => ({ trpc: { marketData: { activeCandle: { useQuery: activeCandleQuery }, liveHistoryPage: { useQuery: liveHistoryQuery }, getChartViewPreference: { useQuery: chartPreferenceQuery }, saveChartViewPreference: { useMutation: savePreferenceMutation } } } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
import ProgressiveLiveCandles from "./ProgressiveLiveCandles";

describe("ProgressiveLiveCandles", () => {
  beforeEach(() => { activeCandleQuery.mockReturnValue({ data: undefined, error: null, isFetching: false }); liveHistoryQuery.mockReturnValue({ data: undefined, error: null, isFetching: false }); chartPreferenceQuery.mockReturnValue({ data: null }); savePreferenceMutation.mockReturnValue({ mutate: vi.fn() }); });
  it("labels the provider-owned UTC history and exposes adjacent page controls from validated initial OHLCV", () => {
    const html = renderToStaticMarkup(createElement(ProgressiveLiveCandles, { symbol: "BTC", interval: "1h", source: "coinbase", initialCandles: [{ openTime: 1_725_000_000_000, closeTime: 1_725_003_599_999, open: 100, high: 103, low: 99, close: 102, volume: 5 }] }));
    expect(html).toContain("Authenticated live provider history");
    expect(html).toContain("coinbase · UTC ranges");
    expect(html).toContain("Load older candles");
    expect(html).toContain("Load newer candles");
  });
});
