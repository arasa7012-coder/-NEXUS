import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  simulationPortfolios,
  simulationPositions,
  simulationRiskSettings,
  simulationSafetyStates,
  simulationTradeDecisions,
  simulationTransactions,
} from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("./marketData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./marketData")>();
  return { ...actual, getLiveQuote: vi.fn() };
});
vi.mock("./marketIntelligence", () => ({
  getAssetIntelligence: vi.fn(),
  supportedIntelligenceAssetIds: ["bitcoin"],
  supportedIntelligenceAssets: [{ id: "bitcoin", name: "Bitcoin", symbol: "BTC" }],
}));

import { getDb } from "../db";
import { getLiveQuote } from "./marketData";
import { getAssetIntelligence } from "./marketIntelligence";
import { getSimulationPortfolioState, recordSimulationOrder } from "./simulationPortfolio";
import { appRouter } from "../routers";

type Row = Record<string, unknown>;

function createMemoryDatabase() {
  const portfolios: Row[] = [];
  const positions: Row[] = [];
  const transactions: Row[] = [];
  const settings: Row[] = [];
  const safetyStates: Row[] = [];
  const decisions: Row[] = [];
  let nextPortfolioId = 1;
  let nextPositionId = 1;
  let nextTransactionId = 1;
  let nextSafetyId = 1;
  let nextDecisionId = 1;

  const rowsFor = (table: unknown) => table === simulationPortfolios ? portfolios
    : table === simulationPositions ? positions
      : table === simulationTransactions ? transactions
        : table === simulationRiskSettings ? settings
          : table === simulationSafetyStates ? safetyStates
            : decisions;
  const select = () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async (limit: number) => rowsFor(table).slice(0, limit),
        orderBy: () => ({ limit: async (limit: number) => [...rowsFor(table)].reverse().slice(0, limit) }),
      }),
    }),
  });
  const insert = (table: unknown) => ({
    values: async (values: Row) => {
      const row = { ...values };
      if (table === simulationPortfolios) { row.id = nextPortfolioId++; portfolios.push(row); }
      else if (table === simulationPositions) { row.id = nextPositionId++; positions.push(row); }
      else if (table === simulationTransactions) { row.id = nextTransactionId++; row.executedAt = new Date("2026-08-01T11:00:00.000Z"); transactions.push(row); }
      else if (table === simulationSafetyStates) { row.id = nextSafetyId++; safetyStates.push(row); }
      else if (table === simulationTradeDecisions) { row.id = nextDecisionId++; decisions.push(row); }
      return [{ insertId: row.id }];
    },
  });
  const update = (table: unknown) => ({
    set: (values: Row) => ({
      where: async () => {
        const target = rowsFor(table)[0];
        if (target) Object.assign(target, values);
      },
    }),
  });
  const remove = (table: unknown) => ({
    where: async () => { rowsFor(table).splice(0, 1); },
  });
  const transaction = async <T,>(callback: (tx: ReturnType<typeof createMemoryDatabase>["db"]) => Promise<T>) => callback(db);
  const db = { select, insert, update, delete: remove, transaction };
  return { db, portfolios, positions, transactions, settings, safetyStates, decisions };
}

function liveQuote(priceUsd = 50_000, stale = false) {
  return {
    quote: { symbol: "BTC", priceUsd, source: "coinbase" as const, providerUpdatedAt: 1_700_000_000_000 },
    isStale: stale,
  };
}

function liveIntelligence() {
  return {
    assetId: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    generatedAt: 1_700_000_000_000,
    primaryTimeframe: "4h" as const,
    timeframes: [{
      timeframe: "4h" as const,
      metadata: { quality: "LIVE" as const, source: "coinbase", providerUpdatedAt: 1_700_000_000_000 },
      indicators: { atr14: { status: "AVAILABLE" as const, value: { value: 1_000, percent: 2 } } },
      structure: { status: "AVAILABLE" as const, value: { support: [{ price: 48_000 }] } },
    }],
    multiTimeframe: { status: "AVAILABLE" as const, value: { alignment: "BULLISH_ALIGNMENT" } },
    regime: { status: "AVAILABLE" as const, value: { regime: "TRENDING_BULLISH" } },
    opportunityScore: { value: 70 },
    riskScore: { value: 10 },
    signalStrength: { value: 70 },
  };
}

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "simulation-e2e-user",
      email: "simulation-e2e@example.com",
      name: "Simulation E2E User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("simulation portfolio persistence boundary", () => {
  let memory: ReturnType<typeof createMemoryDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    memory = createMemoryDatabase();
    vi.mocked(getDb).mockResolvedValue(memory.db as never);
    vi.mocked(getLiveQuote).mockResolvedValue(liveQuote());
    vi.mocked(getAssetIntelligence).mockResolvedValue(liveIntelligence() as never);
  });

  it("persists a virtual buy and returns it as a live-valued position and immutable transaction", async () => {
    const confirmation = await recordSimulationOrder({ userId: 7, symbol: "BTC", side: "buy", orderType: "market", quantity: 0.5 });
    const state = await getSimulationPortfolioState(7);

    expect(confirmation).toMatchObject({ simulation: true, marketSource: "coinbase", decisionId: 1 });
    expect(confirmation.quantity).toBeGreaterThan(0);
    expect(confirmation.quantity).toBeLessThanOrEqual(0.5);
    expect(confirmation.notionalUsd).toBeLessThanOrEqual(25_000);
    expect(confirmation.cashBalanceUsd).toBeCloseTo(100_000 - confirmation.notionalUsd, 6);
    expect(state.portfolio.totalUnrealizedPnlUsd).toBe(0);
    expect(state.portfolio.cashBalanceUsd).toBeCloseTo(confirmation.cashBalanceUsd, 2);
    expect(state.portfolio.totalValueUsd).toBeCloseTo(100_000, 2);
    expect(state.positions).toEqual([expect.objectContaining({ symbol: "BTC", quantity: confirmation.quantity, marketValueUsd: confirmation.notionalUsd, source: "coinbase", unavailable: false })]);
    expect(state.transactions).toEqual([expect.objectContaining({ symbol: "BTC", side: "buy", quantity: confirmation.quantity, marketSource: "coinbase" })]);
    expect(state.transactions[0]?.notionalUsd).toBeCloseTo(confirmation.notionalUsd, 2);
  });

  it("refuses a new virtual order when only a cached quote is available", async () => {
    vi.mocked(getLiveQuote).mockResolvedValueOnce(liveQuote(50_000, true));
    await expect(recordSimulationOrder({ userId: 7, symbol: "BTC", side: "buy", orderType: "market", quantity: 0.5 }))
      .rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("updates cash and the durable position after a virtual sell while preserving transaction history", async () => {
    const buy = await recordSimulationOrder({ userId: 7, symbol: "BTC", side: "buy", orderType: "market", quantity: 0.5 });
    await recordSimulationOrder({ userId: 7, symbol: "BTC", side: "sell", orderType: "limit", quantity: 0.2 });
    const state = await getSimulationPortfolioState(7);

    expect(state.portfolio.cashBalanceUsd).toBeCloseTo(100_000 - buy.notionalUsd + 10_000, 2);
    expect(state.positions).toEqual([expect.objectContaining({ symbol: "BTC", quantity: buy.quantity - 0.2, marketValueUsd: (buy.quantity - 0.2) * 50_000 })]);
    expect(state.transactions).toHaveLength(2);
    expect(state.transactions[0]).toMatchObject({ side: "sell", orderType: "limit", quantity: 0.2 });
    expect(state.transactions[1]).toMatchObject({ side: "buy", orderType: "market", quantity: buy.quantity });
  });

  it("carries a confirmed virtual order from the protected tRPC mutation into the protected portfolio state", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const confirmation = await caller.simulationPortfolio.confirmOrder({ symbol: "BTC", side: "buy", orderType: "market", quantity: 0.5 });
    const state = await caller.simulationPortfolio.getState();

    expect(confirmation).toMatchObject({ simulation: true, symbol: "BTC" });
    expect(state.portfolio.totalValueUsd).toBeCloseTo(100_000, 2);
    expect(state.portfolio.cashBalanceUsd).toBeCloseTo(confirmation.cashBalanceUsd, 2);
    expect(state.positions).toEqual([expect.objectContaining({ symbol: "BTC", quantity: confirmation.quantity, marketValueUsd: confirmation.notionalUsd })]);
  });

  it("persists a rejected safety decision without mutating virtual cash, positions, or transactions", async () => {
    memory.safetyStates.push({
      id: 1,
      userId: 7,
      riskDayUtc: new Date().toISOString().slice(0, 10),
      dayStartEquityUsd: "100000.00",
      dayPeakEquityUsd: "100000.00",
      consecutiveLosses: 0,
      cooldownUntil: null,
      emergencyStopActive: 1,
      emergencyStopReason: "Manual safety review",
    });
    await expect(recordSimulationOrder({ userId: 7, symbol: "BTC", side: "buy", orderType: "market", quantity: 0.5, requestKey: "emergency-stop-test" }))
      .rejects.toMatchObject({ code: "INVALID_ORDER", message: "Manual safety review" });

    expect(memory.decisions).toEqual([expect.objectContaining({ decision: "REJECTED", rejectionReason: "Manual safety review" })]);
    expect(memory.transactions).toHaveLength(0);
    expect(memory.positions).toHaveLength(0);
    expect(memory.portfolios[0]).toMatchObject({ cashBalanceUsd: "100000.00" });
  });

  it("links an accepted immutable decision to the resulting virtual transaction", async () => {
    const confirmation = await recordSimulationOrder({ userId: 7, symbol: "BTC", side: "buy", orderType: "market", quantity: 0.5, requestKey: "accepted-link-test" });

    expect(confirmation.decisionId).toBe(1);
    expect(memory.decisions).toEqual([expect.objectContaining({ id: 1, decision: "ACCEPTED", transactionId: 1 })]);
    expect(memory.transactions).toEqual([expect.objectContaining({ id: 1, decisionId: 1 })]);
  });
});
