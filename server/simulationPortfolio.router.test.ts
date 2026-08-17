import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./services/simulationPortfolio", async () => {
  const actual = await vi.importActual<typeof import("./services/simulationPortfolio")>("./services/simulationPortfolio");
  return {
    ...actual,
    getSimulationPortfolioState: vi.fn(),
    recordSimulationOrder: vi.fn(),
  };
});

import { appRouter } from "./routers";
import { getSimulationPortfolioState, recordSimulationOrder } from "./services/simulationPortfolio";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const sampleUser: AuthenticatedUser = {
  id: 42,
  openId: "simulation-user",
  email: "simulation@example.com",
  name: "Simulation User",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createContext(user: TrpcContext["user"] = sampleUser): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("simulationPortfolio router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the authenticated user ID and validated order input to the simulation ledger", async () => {
    vi.mocked(recordSimulationOrder).mockResolvedValue({
      simulation: true,
      portfolioId: 9,
      symbol: "BTC",
      side: "buy",
      orderType: "market",
      quantity: 0.25,
      referencePriceUsd: 60_000,
      notionalUsd: 15_000,
      marketSource: "coinbase",
      providerUpdatedAt: 1_700_000_000_000,
      isStale: false,
      cashBalanceUsd: 85_000,
    });
    const caller = appRouter.createCaller(createContext());

    const result = await caller.simulationPortfolio.confirmOrder({
      symbol: " btc ",
      side: "buy",
      orderType: "market",
      quantity: 0.25,
    });

    expect(result.simulation).toBe(true);
    expect(recordSimulationOrder).toHaveBeenCalledWith({
      userId: sampleUser.id,
      symbol: "btc",
      side: "buy",
      orderType: "market",
      quantity: 0.25,
    });
  });

  it("rejects invalid virtual order quantities before calling the ledger", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.simulationPortfolio.confirmOrder({
      symbol: "BTC",
      side: "buy",
      orderType: "market",
      quantity: 0,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(recordSimulationOrder).not.toHaveBeenCalled();
  });

  it("keeps simulation portfolio state behind the authenticated procedure boundary", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.simulationPortfolio.getState()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getSimulationPortfolioState).not.toHaveBeenCalled();
  });
});
