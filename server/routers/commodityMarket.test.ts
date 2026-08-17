import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../market/providers/registry", () => ({ getMarketDataProvider: vi.fn() }));
vi.mock("../services/marketWatchlist", () => ({ listMarketWatchlist: vi.fn(), addGoldToMarketWatchlist: vi.fn(), removeGoldFromMarketWatchlist: vi.fn() }));
import { getMarketDataProvider } from "../market/providers/registry";
import { addGoldToMarketWatchlist, listMarketWatchlist } from "../services/marketWatchlist";
import { MarketDataProviderFailure } from "../market/providers/types";
import { commodityMarketRouter } from "./commodityMarket";

const authenticated = (): TrpcContext => ({ user: { id: 71, openId: "gold-user", email: null, name: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const anonymous = (): TrpcContext => ({ ...authenticated(), user: null });
const provider = { getCapabilities: vi.fn(), getQuote: vi.fn(), getCandles: vi.fn() };

describe("commodityMarket router", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getMarketDataProvider).mockReturnValue(provider as never); });

  it("keeps Gold identity public and classifies it as a commodity", async () => {
    await expect(commodityMarketRouter.createCaller(anonymous()).asset({ assetId: "xau-usd" })).resolves.toMatchObject({ asset: { symbol: "XAU/USD", assetType: "COMMODITY", supportsOnChainIntelligence: false } });
  });

  it("does not pass an unsupported timeframe to Twelve Data", async () => {
    const caller = commodityMarketRouter.createCaller(anonymous());
    await expect(caller.candles({ assetId: "xau-usd", timeframe: "30m" as never, limit: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(provider.getCandles).not.toHaveBeenCalled();
  });

  it("returns an honest provider failure payload instead of a substituted quote", async () => {
    provider.getQuote.mockRejectedValue(new MarketDataProviderFailure({ code: "PLAN_UPGRADE_REQUIRED", message: "PLAN UPGRADE REQUIRED", retryAfterSeconds: null }));
    await expect(commodityMarketRouter.createCaller(anonymous()).quote({ assetId: "xau-usd" })).resolves.toEqual({ success: false, data: null, error: { code: "PLAN_UPGRADE_REQUIRED", message: "PLAN UPGRADE REQUIRED", retryAfterSeconds: null } });
  });

  it("requires authentication for persistent Gold monitoring and scopes the save to the caller", async () => {
    await expect(commodityMarketRouter.createCaller(anonymous()).addGoldToWatchlist()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    vi.mocked(addGoldToMarketWatchlist).mockResolvedValue([] as never);
    vi.mocked(listMarketWatchlist).mockResolvedValue([] as never);
    const caller = commodityMarketRouter.createCaller(authenticated());
    await caller.addGoldToWatchlist();
    await caller.watchlist();
    expect(addGoldToMarketWatchlist).toHaveBeenCalledWith(71);
    expect(listMarketWatchlist).toHaveBeenCalledWith(71);
  });
});
