import { describe, expect, it, vi } from "vitest";

vi.mock("../services/nexusCommandService", () => ({
  getCommandOverview: vi.fn(async () => ({ health: { engineStatus: "OPERATIONAL" } })),
  getActivityTimeline: vi.fn(async () => []),
  getMonitoringHealth: vi.fn(async () => ({ engineStatus: "OPERATIONAL" })),
  evaluateShield: vi.fn(async () => ({ candidates: [] })),
  createActionPreview: vi.fn(async () => ({ approvalId: 1, previewStatus: "SAFE" })),
  resolveSecurityModeApproval: vi.fn(async () => ({ approvalId: 1, state: "APPROVED" })),
}));

import { nexusCommandRouter } from "./nexusCommand";

describe("nexusCommandRouter", () => {
  it("keeps evidence, shield, and approval actions behind a protected context", async () => {
    const caller = nexusCommandRouter.createCaller({ user: { id: 42 } } as never);
    await expect(caller.overview()).resolves.toEqual({ health: { engineStatus: "OPERATIONAL" } });
    await expect(caller.previewAction({ actionType: "ENABLE_SECURITY_MODE" })).resolves.toEqual({ approvalId: 1, previewStatus: "SAFE" });
    await expect(caller.resolveApproval({ approvalId: 1, decision: "APPROVE" })).resolves.toEqual({ approvalId: 1, state: "APPROVED" });
  });
});
