import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { consumeEntitlementUsage, requireEntitlement } from "../services/entitlementService";
import { calculateAndPersistWalletAnalytics, addPublicWalletToWatchlist, listUserOnChainWatchlist, syncPublicWallet, userOwnedWalletEvidence } from "../onchain/walletSyncService";
import { primaryOnChainProvider } from "../onchain/providers/registry";
import { isPublicEvmAddress } from "../onchain/providers/types";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { onChainProviderSyncs } from "../../drizzle/schema";
import { desc } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const walletInput = z.object({ chain: z.enum(["ethereum", "base"]), address: z.string().trim().min(1).max(64), pageKey: z.string().max(512).optional() });

function assertPublicAddress(address: string) {
  if (!isPublicEvmAddress(address)) throw new TRPCError({ code: "BAD_REQUEST", message: "A public 0x EVM address is required. ENS and private credentials are not accepted." });
}

export const onChainRouter = router({
  health: protectedProcedure.input(z.object({ chain: z.enum(["ethereum", "base"]).optional() }).default({})).query(async ({ input }) => {
    const chains = input.chain ? [input.chain] : ["ethereum", "base"] as const;
    const networks = await Promise.all(chains.map((chain) => primaryOnChainProvider.health(chain)));
    return { provider: "alchemy", networks, webhook: { status: ENV.alchemyWebhookSigningKey ? "CONFIGURED" : "NOT_CONFIGURED", message: ENV.alchemyWebhookSigningKey ? "Webhook signing key is configured; activation remains controlled by an Alchemy dashboard webhook." : "No webhook signing key is configured, so Nexus accepts no provider events." } };
  }),
  adminHealth: adminProcedure.query(async () => {
    const networks = await Promise.all((["ethereum", "base"] as const).map((chain) => primaryOnChainProvider.health(chain)));
    const db = await getDb();
    const recent = db ? await db.select().from(onChainProviderSyncs).orderBy(desc(onChainProviderSyncs.createdAt)).limit(100) : [];
    return { provider: "alchemy", networks, webhook: { status: ENV.alchemyWebhookSigningKey ? "CONFIGURED" : "NOT_CONFIGURED" }, latestSyncAt: recent[0]?.createdAt ?? null, requests: recent.reduce((total, row) => total + row.requestCount, 0), errors: recent.filter((row) => row.status === "FAILED").length, rateLimits: recent.filter((row) => row.status === "RATE_LIMITED").length, recentSyncCount: recent.length };
  }),
  lookup: protectedProcedure.input(walletInput).mutation(async ({ ctx, input }) => {
    assertPublicAddress(input.address);
    await consumeEntitlementUsage(ctx.user.id, "smart_money_basic");
    const outcome = await syncPublicWallet({ ...input, maxTransfers: 50 });
    const analytics = outcome.walletId ? await calculateAndPersistWalletAnalytics(outcome.walletId) : null;
    return { ...outcome, analytics };
  }),
  watch: protectedProcedure.input(walletInput.extend({ label: z.string().trim().max(120).optional(), tags: z.array(z.string().trim().min(1).max(40)).max(12).optional() })).mutation(async ({ ctx, input }) => {
    assertPublicAddress(input.address);
    await consumeEntitlementUsage(ctx.user.id, "smart_money_advanced");
    const wallet = await addPublicWalletToWatchlist({ userId: ctx.user.id, chain: input.chain, address: input.address, label: input.label, tags: input.tags });
    const outcome = await syncPublicWallet({ chain: input.chain, address: input.address, maxTransfers: 50 });
    const analytics = await calculateAndPersistWalletAnalytics(wallet.id);
    return { wallet: { id: wallet.id, chain: wallet.chain, address: wallet.address }, outcome, analytics };
  }),
  watchlist: protectedProcedure.query(({ ctx }) => listUserOnChainWatchlist(ctx.user.id)),
  evidence: protectedProcedure.input(z.object({ walletId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireEntitlement(ctx.user.id, "smart_money_advanced");
    try { return await userOwnedWalletEvidence(ctx.user.id, input.walletId); }
    catch (error) { throw new TRPCError({ code: error instanceof Error && error.message === "ONCHAIN_WALLET_NOT_OWNED_BY_USER" ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR", message: "No owned public-wallet evidence is available for this request." }); }
  }),
  explainAccess: protectedProcedure.input(z.object({ advanced: z.boolean().default(false) })).query(({ ctx, input }) => requireEntitlement(ctx.user.id, input.advanced ? "smart_money_advanced" : "smart_money_basic")),
});
