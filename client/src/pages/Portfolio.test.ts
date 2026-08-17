import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useLiveMarketData", () => ({
  useLiveSimulationPortfolio: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    risk: {
      getEmergencyStopStatus: { useQuery: vi.fn(() => ({ data: { active: false, reason: null }, refetch: vi.fn() })) },
      getPortfolioProtection: { useQuery: vi.fn(() => ({ data: null, refetch: vi.fn() })) },
      monitorPositions: { useQuery: vi.fn(() => ({ data: { evaluatedAt: 1_700_000_000_000, positions: [] }, refetch: vi.fn() })) },
      activateEmergencyStop: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      resetEmergencyStop: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    useUtils: vi.fn(() => ({ risk: { getEmergencyStopStatus: { invalidate: vi.fn() }, monitorPositions: { invalidate: vi.fn() } } })),
  },
}));

import Portfolio from "./Portfolio";
import { useLiveSimulationPortfolio } from "@/hooks/useLiveMarketData";

const populatedState = {
  simulation: true as const,
  portfolio: {
    id: 7,
    name: "Simulation Portfolio",
    quoteCurrency: "USD",
    initialCashUsd: 100_000,
    cashBalanceUsd: 55_000,
    cashAllocationPercent: 50,
    totalValueUsd: 110_000,
    totalCostBasisUsd: 50_000,
    totalUnrealizedPnlUsd: 5_000,
    totalUnrealizedPnlPercent: 10,
  },
  positions: [
    {
      symbol: "BTC",
      quantity: 0.5,
      averageCostUsd: 50_000,
      currentPriceUsd: 60_000,
      marketValueUsd: 30_000,
      costBasisUsd: 25_000,
      unrealizedPnlUsd: 5_000,
      unrealizedPnlPercent: 20,
      allocationPercent: 27.27,
      source: "coinbase" as const,
      providerUpdatedAt: 1_700_000_000_000,
      isStale: false,
      unavailable: false,
    },
    {
      symbol: "ETH",
      quantity: 2,
      averageCostUsd: 1_000,
      currentPriceUsd: null,
      marketValueUsd: 0,
      costBasisUsd: 2_000,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      allocationPercent: 0,
      source: null,
      providerUpdatedAt: null,
      isStale: true,
      unavailable: true,
    },
  ],
  transactions: [
    {
      id: 2,
      symbol: "BTC",
      side: "sell" as const,
      orderType: "limit" as const,
      quantity: 0.1,
      referencePriceUsd: 60_000,
      notionalUsd: 6_000,
      marketSource: "coinbase",
      executedAt: "2026-08-01T11:00:00.000Z",
    },
    {
      id: 1,
      symbol: "BTC",
      side: "buy" as const,
      orderType: "market" as const,
      quantity: 0.6,
      referencePriceUsd: 50_000,
      notionalUsd: 30_000,
      marketSource: "coinbase",
      executedAt: "2026-08-01T10:00:00.000Z",
    },
  ],
  source: "server-valued-simulation" as const,
  isStale: true,
  unavailableSymbols: ["ETH"],
};

function renderPortfolio(overrides: Record<string, unknown> = {}) {
  vi.mocked(useLiveSimulationPortfolio).mockReturnValue({
    data: populatedState,
    isOnline: true,
    isFetching: false,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as never);
  return renderToStaticMarkup(createElement(Portfolio));
}

describe("Portfolio populated simulation states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders protected virtual positions, allocation, P/L, and immutable history", () => {
    const html = renderPortfolio();

    expect(html).toContain("Simulation portfolio");
    expect(html).toContain("No exchange account");
    expect(html).toContain("$110,000.00");
    expect(html).toContain("+$5,000.00");
    expect(html).toContain("BTC");
    expect(html).toContain("27.3%");
    expect(html).toContain("Virtual transaction history");
    expect(html).toContain("Sell");
    expect(html).toContain("Buy");
    expect(html).toContain("Coinbase");
  });

  it("discloses stale and unavailable public valuation data instead of fabricating a price", () => {
    const html = renderPortfolio();

    expect(html).toContain("Latest valuation cached");
    expect(html).toContain("A current valuation is unavailable for ETH");
    expect(html).toContain("Live price unavailable");
    expect(html).toContain("Awaiting quote");
  });

  it("keeps the offline state and refresh boundary visible with populated holdings", () => {
    const html = renderPortfolio({ isOnline: false });

    expect(html).toContain("Offline");
    expect(html).toContain("Portfolio refresh is paused until the connection returns.");
    expect(html).toContain("disabled");
    expect(html).toContain("BTC");
  });
});
