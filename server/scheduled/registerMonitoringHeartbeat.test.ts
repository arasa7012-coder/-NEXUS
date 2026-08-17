import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  listHeartbeatJobs: vi.fn(),
  createHeartbeatJob: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../_core/heartbeat", () => ({
  listHeartbeatJobs: mocks.listHeartbeatJobs,
  createHeartbeatJob: mocks.createHeartbeatJob,
}));
vi.mock("../services/nexusCommandService", () => ({
  NEXUS_MONITORING_PATH: "/api/scheduled/nexus-monitoring",
  NEXUS_MONITORING_SCHEDULE_KEY: "nexus-monitoring",
}));

import { registerMonitoringHeartbeat } from "./registerMonitoringHeartbeat";

function makeDb() {
  const schedule = { id: 1, scheduleCronTaskUid: null };
  const where = vi.fn(async () => undefined);
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onDuplicateKeyUpdate: vi.fn(async () => undefined) })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [schedule]) })) })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
  };
}

describe("registerMonitoringHeartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue(makeDb());
  });

  it("records an explicit failure when Forge omits the jobs array", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({});

    await expect(registerMonitoringHeartbeat()).resolves.toEqual({
      status: "FAILED",
      reason: "Heartbeat service returned an invalid job-list response.",
    });
    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
  });
});
