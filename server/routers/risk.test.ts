import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../services/simulationPortfolio", () => ({
  SimulationPortfolioError: class SimulationPortfolioError extends Error { constructor(public code: string, message: string) { super(message); } },
  getSimulationPortfolioProtection: vi.fn(),
  getSimulationPortfolioState: vi.fn(),
  monitorSimulationPositions: vi.fn(),
  previewSimulationOrder: vi.fn(),
  recordSimulationOrder: vi.fn(),
}));
vi.mock("../risk/safety", () => ({ getEmergencyStopState: vi.fn(), resetEmergencyStop: vi.fn(), setEmergencyStop: vi.fn() }));

import { getDb } from "../db";
import { monitorSimulationPositions, previewSimulationOrder, recordSimulationOrder } from "../services/simulationPortfolio";
import { riskRouter } from "./risk";

function context(): TrpcContext {
  return {
    user: { id: 44, openId: "risk-user", email: null, name: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function memoryDb() {
  const settings: Record<string, unknown>[] = [];
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => settings }) }) }),
    insert: () => ({ values: async (value: Record<string, unknown>) => { settings.push(value); return [{ insertId: 1 }]; } }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

describe("risk router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(memoryDb() as never);
  });

  it("builds a read-only guarded plan in the authenticated user's scope", async () => {
    vi.mocked(previewSimulationOrder).mockResolvedValue({ simulation: true, gate: { decision: "ACCEPTED" } } as never);
    const caller = riskRouter.createCaller(context());
    const plan = await caller.getTradePlanPreview({ requestKey: "preview-44", symbol: "BTC", side: "buy", orderType: "market", quantity: 0.1 });

    expect(plan).toMatchObject({ simulation: true });
    expect(previewSimulationOrder).toHaveBeenCalledWith(expect.objectContaining({ userId: 44, requestKey: "preview-44" }));
  });

  it("confirms only through the guarded service in the authenticated user's scope", async () => {
    vi.mocked(recordSimulationOrder).mockResolvedValue({ simulation: true, decisionId: 9 } as never);
    const caller = riskRouter.createCaller(context());
    const confirmation = await caller.confirmGuardedOrder({ requestKey: "confirm-44", symbol: "BTC", side: "buy", orderType: "market", quantity: 0.1 });

    expect(confirmation).toMatchObject({ decisionId: 9 });
    expect(recordSimulationOrder).toHaveBeenCalledWith(expect.objectContaining({ userId: 44, requestKey: "confirm-44" }));
  });

  it("rejects a configuration that would let one trade exceed daily loss protection", async () => {
    const caller = riskRouter.createCaller(context());
    await expect(caller.updateRiskSettings({ riskPerTradePercent: 4, maxDailyLossPercent: 3 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("runs monitoring only when the authenticated caller asks for it", async () => {
    vi.mocked(monitorSimulationPositions).mockResolvedValue({ simulation: true, evaluatedAt: 1, positions: [] });
    const caller = riskRouter.createCaller(context());
    await expect(caller.monitorPositions()).resolves.toMatchObject({ simulation: true, positions: [] });
    expect(monitorSimulationPositions).toHaveBeenCalledWith(44);
  });
});
