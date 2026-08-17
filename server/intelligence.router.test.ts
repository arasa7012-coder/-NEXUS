import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const serviceMocks = vi.hoisted(() => ({
  getAssetIntelligence: vi.fn(),
  getMarketIntelligenceOverview: vi.fn(),
  getOpportunityScanner: vi.fn(),
}));

vi.mock("./services/marketIntelligence", async () => {
  const actual = await vi.importActual<typeof import("./services/marketIntelligence")>("./services/marketIntelligence");
  return { ...actual, ...serviceMocks };
});

import { appRouter } from "./routers";
import { MarketDataError } from "./services/marketData";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("intelligence router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes validated asset and timeframe inputs to the intelligence service", async () => {
    const payload = { assetId: "bitcoin", primaryTimeframe: "4h" } as never;
    serviceMocks.getAssetIntelligence.mockResolvedValue(payload);
    const caller = appRouter.createCaller(createContext());

    const result = await caller.intelligence.asset({
      assetId: "bitcoin",
      timeframes: ["1h", "4h", "1d"],
      preferredTimeframe: "4h",
    });

    expect(result).toEqual({ success: true, data: payload, error: null });
    expect(serviceMocks.getAssetIntelligence).toHaveBeenCalledWith({
      assetId: "bitcoin",
      timeframes: ["1h", "4h", "1d"],
      preferredTimeframe: "4h",
    });
  });

  it("rejects unsupported assets before invoking the intelligence service", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.intelligence.asset({
      assetId: "unsupported-asset" as never,
      timeframes: ["4h"],
      preferredTimeframe: "4h",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(serviceMocks.getAssetIntelligence).not.toHaveBeenCalled();
  });

  it("serializes provider failures into an explicit scanner error response", async () => {
    serviceMocks.getOpportunityScanner.mockRejectedValue(new MarketDataError("UNAVAILABLE", "Public exchange evidence is unavailable."));
    const caller = appRouter.createCaller(createContext());

    const result = await caller.intelligence.scanner({
      timeframe: "4h",
      minimumOpportunity: 0,
      maximumRisk: 100,
      minimumVolumeUsd: 0,
      limit: 8,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNAVAILABLE");
      expect(result.error.message).toBe("Public exchange evidence is unavailable.");
    }
  });
});
