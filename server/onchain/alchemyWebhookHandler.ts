import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { onChainWallets, onChainWebhookDeliveries, userOnChainWalletWatchlists } from "../../drizzle/schema";
import { getDb } from "../db";
import { calculateAndPersistWalletAnalytics, syncPublicWallet } from "./walletSyncService";
import { isPublicEvmAddress, type OnChainChain } from "./providers/types";
import { verifyAlchemyWebhookSignature } from "./alchemyWebhookSecurity";

type RawBodyRequest = Request & { rawBody?: string };
type WebhookObservation = { eventId: string; eventType: string; chain: OnChainChain | null; addresses: string[] };

function normalizedAddress(value: unknown) { return typeof value === "string" && isPublicEvmAddress(value) ? value.toLowerCase() : null; }

export function extractAlchemyWebhookObservation(payload: unknown, rawBody: string): WebhookObservation {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const event = root.event && typeof root.event === "object" ? root.event as Record<string, unknown> : {};
  const network = String(event.network ?? root.network ?? "").toUpperCase();
  const chain: OnChainChain | null = network.includes("BASE") ? "base" : network.includes("ETH") ? "ethereum" : null;
  const activity = Array.isArray(event.activity) ? event.activity : [];
  const addresses = Array.from(new Set(activity.flatMap((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return [row.fromAddress, row.toAddress, row.from, row.to, row.address].map(normalizedAddress).filter((value): value is string => Boolean(value));
  })));
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const providedId = [root.id, root.eventId, root.webhookId].find((value): value is string => typeof value === "string" && value.length > 0);
  return { eventId: providedId ? `alchemy:${providedId}` : `alchemy:sha256:${payloadHash}`, eventType: String(root.type ?? event.type ?? "ADDRESS_ACTIVITY"), chain, addresses };
}

export async function alchemyWebhookHandler(req: RawBodyRequest, res: Response) {
  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
  const signature = req.header("X-Alchemy-Signature") ?? "";
  const verification = verifyAlchemyWebhookSignature(rawBody, signature);
  if (!verification.valid) return res.status(verification.status === "NOT_CONFIGURED" ? 503 : 401).json({ status: verification.status });
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return res.status(400).json({ status: "INVALID_PAYLOAD" }); }
  const observation = extractAlchemyWebhookObservation(payload, rawBody);
  const db = await getDb();
  if (!db) return res.status(503).json({ status: "STORAGE_UNAVAILABLE" });
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  try {
    await db.insert(onChainWebhookDeliveries).values({ provider: "alchemy", providerEventId: observation.eventId, eventType: observation.eventType, verificationState: "VERIFIED", processingState: "RECEIVED", payloadHash, affectedAddressesJson: JSON.stringify(observation.addresses) });
  } catch (error) {
    if (error instanceof Error && /duplicate|unique/i.test(error.message)) return res.status(200).json({ status: "DUPLICATE_IGNORED" });
    throw error;
  }
  if (!observation.chain || observation.addresses.length === 0) {
    await db.update(onChainWebhookDeliveries).set({ processingState: "IGNORED", processedAt: new Date(), errorCode: observation.chain ? "NO_PUBLIC_EVM_ADDRESS" : "UNSUPPORTED_NETWORK" }).where(and(eq(onChainWebhookDeliveries.provider, "alchemy"), eq(onChainWebhookDeliveries.providerEventId, observation.eventId)));
    return res.status(202).json({ status: "IGNORED" });
  }
  const watched = await db.select({ id: onChainWallets.id, chain: onChainWallets.chain, address: onChainWallets.address }).from(userOnChainWalletWatchlists).innerJoin(onChainWallets, eq(userOnChainWalletWatchlists.walletId, onChainWallets.id)).where(and(eq(onChainWallets.chain, observation.chain), inArray(onChainWallets.normalizedAddress, observation.addresses)));
  if (!watched.length) {
    await db.update(onChainWebhookDeliveries).set({ processingState: "IGNORED", processedAt: new Date(), errorCode: "NO_WATCHED_WALLET" }).where(and(eq(onChainWebhookDeliveries.provider, "alchemy"), eq(onChainWebhookDeliveries.providerEventId, observation.eventId)));
    return res.status(202).json({ status: "IGNORED" });
  }
  try {
    await Promise.all(watched.map(async (wallet) => { await syncPublicWallet({ chain: wallet.chain as OnChainChain, address: wallet.address, force: true }); await calculateAndPersistWalletAnalytics(wallet.id); }));
    await db.update(onChainWebhookDeliveries).set({ processingState: "PROCESSED", processedAt: new Date() }).where(and(eq(onChainWebhookDeliveries.provider, "alchemy"), eq(onChainWebhookDeliveries.providerEventId, observation.eventId)));
    return res.status(202).json({ status: "PROCESSED", watchedWallets: watched.length });
  } catch {
    await db.update(onChainWebhookDeliveries).set({ processingState: "FAILED", processedAt: new Date(), errorCode: "SYNC_FAILED" }).where(and(eq(onChainWebhookDeliveries.provider, "alchemy"), eq(onChainWebhookDeliveries.providerEventId, observation.eventId)));
    return res.status(503).json({ status: "SYNC_FAILED" });
  }
}
