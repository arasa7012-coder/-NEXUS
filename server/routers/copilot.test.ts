import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../services/copilotService", () => ({
  getCopilotPreferences: vi.fn(), updateCopilotPreferences: vi.fn(), askCopilot: vi.fn(), generateDailyBriefing: vi.fn(),
  CopilotError: class CopilotError extends Error { constructor(public code: string, message: string) { super(message); } },
}));
vi.mock("../services/smartAlertService", () => ({ evaluateSmartAlerts: vi.fn(), listSmartAlerts: vi.fn(), markSmartAlertRead: vi.fn() }));
vi.mock("../services/entitlementService", () => ({ EntitlementError: class EntitlementError extends Error {}, requireEntitlement: vi.fn(), consumeEntitlementUsage: vi.fn() }));

import { askCopilot, getCopilotPreferences, updateCopilotPreferences } from "../services/copilotService";
import { evaluateSmartAlerts, listSmartAlerts } from "../services/smartAlertService";
import { consumeEntitlementUsage, requireEntitlement } from "../services/entitlementService";
import { copilotRouter } from "./copilot";

const authenticated = (): TrpcContext => ({ user: { id: 71, openId: "copilot-user", email: null, name: "Copilot", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const anonymous = (): TrpcContext => ({ ...authenticated(), user: null });

describe("copilot router", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not expose preferences or evidence services to an anonymous caller", async () => {
    const caller = copilotRouter.createCaller(anonymous());
    await expect(caller.getPreferences()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.ask({ question: "Explain BTC evidence" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getCopilotPreferences).not.toHaveBeenCalled(); expect(askCopilot).not.toHaveBeenCalled();
  });
  it("passes only the authenticated user identity and constrained request to the Copilot service", async () => {
    vi.mocked(askCopilot).mockResolvedValue({ answer: "Evidence only", mode: "DETERMINISTIC_FALLBACK", evidence: {}, evidenceRecordId: 1, cached: false, generatedAt: new Date() } as never);
    const caller = copilotRouter.createCaller(authenticated());
    await expect(caller.ask({ question: "Explain the paper trade rejection", kind: "RISK", symbol: "BTC", decisionId: 9 })).resolves.toMatchObject({ answer: "Evidence only" });
    expect(requireEntitlement).toHaveBeenCalledWith(71, "ai_copilot_basic");
    expect(askCopilot).toHaveBeenCalledWith(expect.objectContaining({ userId: 71, kind: "RISK", symbol: "BTC", decisionId: 9 }));
    expect(consumeEntitlementUsage).toHaveBeenCalledWith(71, "ai_copilot_basic");
  });
  it("scopes preference writes and alert reads to the authenticated user", async () => {
    const caller = copilotRouter.createCaller(authenticated());
    vi.mocked(updateCopilotPreferences).mockResolvedValue({ favoriteSymbols: ["BTC", "ETH"], preferredTimeframes: ["1h"], riskTolerance: "CONSERVATIVE", enabledAlertTypes: [], minimumAlertSeverity: "WATCH", alertCooldownMinutes: 60, dailyBriefingEnabled: true } as never);
    await expect(caller.updatePreferences({ favoriteSymbols: ["BTC", "ETH"], riskTolerance: "CONSERVATIVE", dailyBriefingEnabled: true })).resolves.toMatchObject({ favoriteSymbols: ["BTC", "ETH"], riskTolerance: "CONSERVATIVE", dailyBriefingEnabled: true });
    expect(updateCopilotPreferences).toHaveBeenCalledWith(71, { favoriteSymbols: ["BTC", "ETH"], riskTolerance: "CONSERVATIVE", dailyBriefingEnabled: true });
    vi.mocked(listSmartAlerts).mockResolvedValue([] as never); vi.mocked(evaluateSmartAlerts).mockResolvedValue({ createdAlertIds: [], evaluatedAt: 1, candidatesEvaluated: 0, execution: "USER_REQUESTED_ONLY", simulationOnly: true } as never);
    await caller.listAlerts(); await caller.evaluateAlerts();
    expect(listSmartAlerts).toHaveBeenCalledWith(71, 50); expect(requireEntitlement).toHaveBeenCalledWith(71, "smart_alerts"); expect(evaluateSmartAlerts).toHaveBeenCalledWith(71);
  });
});
