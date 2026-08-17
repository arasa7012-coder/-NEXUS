import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const stateRow = {
    id: 7,
    userId: 9,
    emergencyStopActive: 0,
    emergencyStopReason: null as string | null,
    emergencyStopActivatedAt: null as Date | null,
    emergencyStopResetAt: null as Date | null,
  };
  const activeOrders = [
    { id: 31, symbol: "BTC" },
    { id: 32, symbol: "ETH" },
  ];
  const updates: Array<Record<string, unknown>> = [];
  const eventWrites: Array<Record<string, unknown>> = [];

  const chain = (rows: unknown[]) => ({
    from: () => ({
      where: () => Object.assign([...rows], {
        limit: async () => rows,
      }),
    }),
  });
  const update = () => ({
    set: (values: Record<string, unknown>) => {
      updates.push(values);
      return { where: async () => undefined };
    },
  });
  const insert = () => ({
    values: async (values: Record<string, unknown>) => {
      eventWrites.push(values);
      return undefined;
    },
  });
  const tx = {
    select: (fields?: unknown) => fields ? chain(activeOrders) : chain([stateRow]),
    update,
    insert,
  };
  const db = {
    select: () => chain([stateRow]),
    insert,
    transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  };
  const getDb = vi.fn(async () => db);

  return { stateRow, activeOrders, updates, eventWrites, getDb };
});

vi.mock("../db", () => ({ getDb: mocked.getDb }));

import { setEmergencyStop } from "./safety";

describe("Emergency Stop persistence boundary", () => {
  beforeEach(() => {
    mocked.stateRow.emergencyStopActive = 0;
    mocked.stateRow.emergencyStopReason = null;
    mocked.stateRow.emergencyStopActivatedAt = null;
    mocked.stateRow.emergencyStopResetAt = null;
    mocked.updates.splice(0);
    mocked.eventWrites.splice(0);
    mocked.getDb.mockClear();
  });

  it("cancels every active pending paper order and writes unique cancellation plus stop events", async () => {
    const result = await setEmergencyStop({
      userId: 9,
      simulationPortfolioId: 4,
      currentEquityUsd: 100_000,
      reason: "Manual protection review",
      now: 1_723_000_001_000,
    });

    expect(result.changed).toBe(true);
    expect(mocked.updates).toHaveLength(3);
    expect(mocked.updates[0]).toMatchObject({ emergencyStopActive: 1, emergencyStopReason: "Manual protection review" });
    expect(mocked.updates.slice(1)).toEqual([
      expect.objectContaining({ status: "CANCELLED", cancelReason: "Cancelled by Emergency Stop before a paper fill." }),
      expect.objectContaining({ status: "CANCELLED", cancelReason: "Cancelled by Emergency Stop before a paper fill." }),
    ]);
    expect(mocked.eventWrites).toHaveLength(3);
    expect(mocked.eventWrites.map((event) => event.eventType)).toEqual([
      "PENDING_ORDER_CANCELLED",
      "PENDING_ORDER_CANCELLED",
      "EMERGENCY_STOP_ACTIVATED",
    ]);
    expect(mocked.eventWrites.map((event) => event.eventKey)).toEqual([
      "pending-cancel:emergency:7:31:1723000001000",
      "pending-cancel:emergency:7:32:1723000001000",
      "emergency-stop:activate:7:1723000001000",
    ]);
  });

  it("does not write duplicate cancellation or stop events after the safety state is active", async () => {
    mocked.stateRow.emergencyStopActive = 1;
    mocked.stateRow.emergencyStopReason = "Already active";
    mocked.stateRow.emergencyStopActivatedAt = new Date(1_723_000_000_000);

    const result = await setEmergencyStop({
      userId: 9,
      simulationPortfolioId: 4,
      currentEquityUsd: 100_000,
      reason: "Repeated request",
      now: 1_723_000_001_000,
    });

    expect(result.changed).toBe(false);
    expect(mocked.updates).toHaveLength(0);
    expect(mocked.eventWrites).toHaveLength(0);
  });
});
