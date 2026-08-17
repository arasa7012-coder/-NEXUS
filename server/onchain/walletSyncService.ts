import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { onChainBalanceSnapshots, onChainProviderSyncs, onChainTokenBalances, onChainTransactions, onChainWalletScores, onChainWallets, userOnChainWalletWatchlists } from "../../drizzle/schema";
import { getDb } from "../db";
import { analyzeObservedWalletActivity } from "./analytics";
import { primaryOnChainProvider } from "./providers/registry";
import { isPublicEvmAddress, type OnChainChain, type WalletSnapshot } from "./providers/types";

const cacheWindowMs = 45_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export type WalletSyncOutcome = {
  walletId: number | null;
  snapshot: WalletSnapshot;
  fromCache: boolean;
  persistedTransfers: number;
  persistenceAvailable: boolean;
};

function syncStatus(status: WalletSnapshot["status"]) {
  if (status === "CONNECTED") return "SUCCEEDED" as const;
  if (status === "RATE_LIMITED") return "RATE_LIMITED" as const;
  if (status === "NOT_CONFIGURED") return "NOT_CONFIGURED" as const;
  return "FAILED" as const;
}

function normalizeAddress(address: string) { return address.trim().toLowerCase(); }
function transferKey(walletId: number, transactionHash: string, from: string | null, to: string | null, category: string, index: number) { return hash(`${walletId}:${transactionHash}:${from ?? ""}:${to ?? ""}:${category}:${index}`); }

export async function getOrCreatePublicWallet(chain: OnChainChain, address: string) {
  const normalizedAddress = normalizeAddress(address);
  if (!isPublicEvmAddress(address)) throw new Error("INVALID_PUBLIC_EVM_ADDRESS");
  const db = await getDb();
  if (!db) return null;
  await db.insert(onChainWallets).values({ chain, address: address.trim(), normalizedAddress, provider: "alchemy", dataQuality: "UNAVAILABLE", providerStatus: "NOT_CONFIGURED", lastRequestedAt: new Date() }).onDuplicateKeyUpdate({ set: { address: address.trim(), lastRequestedAt: new Date() } });
  const rows = await db.select().from(onChainWallets).where(and(eq(onChainWallets.chain, chain), eq(onChainWallets.normalizedAddress, normalizedAddress))).limit(1);
  return rows[0] ?? null;
}

export async function getRecentWalletSnapshot(chain: OnChainChain, address: string) {
  const db = await getDb();
  if (!db) return null;
  const wallet = await getOrCreatePublicWallet(chain, address);
  if (!wallet?.lastSuccessfulSyncAt || Date.now() - wallet.lastSuccessfulSyncAt.getTime() > cacheWindowMs) return null;
  const [balances, transfers] = await Promise.all([
    db.select().from(onChainTokenBalances).where(eq(onChainTokenBalances.walletId, wallet.id)),
    db.select().from(onChainTransactions).where(eq(onChainTransactions.walletId, wallet.id)).orderBy(desc(onChainTransactions.observedAt)).limit(50),
  ]);
  const native = await db.select().from(onChainBalanceSnapshots).where(eq(onChainBalanceSnapshots.walletId, wallet.id)).orderBy(desc(onChainBalanceSnapshots.observedAt)).limit(1);
  return {
    provider: "alchemy" as const,
    chain,
    address: wallet.address,
    fetchedAt: wallet.lastSuccessfulSyncAt,
    status: "CONNECTED" as const,
    dataQuality: wallet.dataQuality as WalletSnapshot["dataQuality"],
    nativeBalanceWei: native[0]?.nativeBalanceWei ?? null,
    tokenBalances: balances.map((balance) => ({ provider: "alchemy" as const, chain, fetchedAt: balance.observedAt, status: "CONNECTED" as const, dataQuality: "VERIFIED" as const, contractAddress: balance.contractAddress, tokenBalance: balance.tokenBalance, decimals: balance.decimals, symbol: balance.symbol, name: balance.tokenName })),
    transfers: transfers.map((transfer) => ({ provider: "alchemy" as const, chain, fetchedAt: transfer.createdAt, status: "CONNECTED" as const, dataQuality: "VERIFIED" as const, transactionHash: transfer.transactionHash, blockNumber: transfer.blockNumber, timestamp: transfer.observedAt, from: transfer.fromAddress, to: transfer.toAddress, asset: transfer.asset, value: transfer.value, category: transfer.category, contractAddress: transfer.contractAddress })),
    nextPageKey: null,
    sourceLimitations: ["Returned from Nexus provider-isolated cache; no balance valuation or P&L is inferred."],
  } satisfies WalletSnapshot;
}

async function persistSnapshot(walletId: number, snapshot: WalletSnapshot) {
  const db = await getDb();
  if (!db) return { persistedTransfers: 0, persistenceAvailable: false };
  const observedAt = snapshot.fetchedAt;
  await db.update(onChainWallets).set({ provider: snapshot.provider, dataQuality: snapshot.dataQuality, providerStatus: snapshot.status, lastRequestedAt: observedAt, lastSuccessfulSyncAt: snapshot.status === "CONNECTED" ? observedAt : undefined, lastErrorCode: snapshot.status === "CONNECTED" ? null : snapshot.status }).where(eq(onChainWallets.id, walletId));
  let persistedTransfers = 0;
  if (snapshot.status === "CONNECTED" && snapshot.nativeBalanceWei !== null) {
    try { await db.insert(onChainBalanceSnapshots).values({ walletId, provider: snapshot.provider, nativeBalanceWei: snapshot.nativeBalanceWei, observedAt }); } catch (error) { if (!(error instanceof Error) || !/duplicate|unique/i.test(error.message)) throw error; }
    for (const balance of snapshot.tokenBalances) {
      await db.insert(onChainTokenBalances).values({ walletId, provider: balance.provider, contractAddress: balance.contractAddress.toLowerCase(), tokenBalance: balance.tokenBalance, decimals: balance.decimals, symbol: balance.symbol, tokenName: balance.name, observedAt }).onDuplicateKeyUpdate({ set: { tokenBalance: balance.tokenBalance, decimals: balance.decimals, symbol: balance.symbol, tokenName: balance.name, observedAt } });
    }
    for (let index = 0; index < snapshot.transfers.length; index += 1) {
      const transfer = snapshot.transfers[index]!;
      try {
        await db.insert(onChainTransactions).values({ walletId, provider: transfer.provider, transferKey: transferKey(walletId, transfer.transactionHash, transfer.from, transfer.to, transfer.category, index), transactionHash: transfer.transactionHash, blockNumber: transfer.blockNumber, observedAt: transfer.timestamp, fromAddress: transfer.from, toAddress: transfer.to, category: transfer.category, asset: transfer.asset, contractAddress: transfer.contractAddress, value: transfer.value, sourcePayloadJson: JSON.stringify({ transactionHash: transfer.transactionHash, blockNumber: transfer.blockNumber, timestamp: transfer.timestamp?.toISOString() ?? null, from: transfer.from, to: transfer.to, asset: transfer.asset, value: transfer.value, category: transfer.category, contractAddress: transfer.contractAddress }) });
        persistedTransfers += 1;
      } catch (error) { if (!(error instanceof Error) || !/duplicate|unique/i.test(error.message)) throw error; }
    }
  }
  await db.insert(onChainProviderSyncs).values({ syncKey: hash(`${walletId}:${snapshot.fetchedAt.toISOString()}:${snapshot.status}`), walletId, provider: snapshot.provider, status: syncStatus(snapshot.status), requestCount: snapshot.status === "CONNECTED" ? 4 : 1, errorCode: snapshot.status === "CONNECTED" ? null : snapshot.status, nextPageKey: snapshot.nextPageKey });
  return { persistedTransfers, persistenceAvailable: true };
}

export async function syncPublicWallet(input: { chain: OnChainChain; address: string; pageKey?: string; maxTransfers?: number; force?: boolean }): Promise<WalletSyncOutcome> {
  const wallet = await getOrCreatePublicWallet(input.chain, input.address);
  const cached = !input.force ? await getRecentWalletSnapshot(input.chain, input.address) : null;
  if (cached) return { walletId: wallet?.id ?? null, snapshot: cached, fromCache: true, persistedTransfers: 0, persistenceAvailable: Boolean(wallet) };
  const snapshot = await primaryOnChainProvider.getWalletSnapshot(input);
  if (!wallet) return { walletId: null, snapshot, fromCache: false, persistedTransfers: 0, persistenceAvailable: false };
  const persisted = await persistSnapshot(wallet.id, snapshot);
  return { walletId: wallet.id, snapshot, fromCache: false, ...persisted };
}

export async function addPublicWalletToWatchlist(input: { userId: number; chain: OnChainChain; address: string; label?: string; tags?: string[] }) {
  const wallet = await getOrCreatePublicWallet(input.chain, input.address);
  const db = await getDb();
  if (!wallet || !db) throw new Error("ONCHAIN_STORAGE_UNAVAILABLE");
  await db.insert(userOnChainWalletWatchlists).values({ userId: input.userId, walletId: wallet.id, label: input.label?.trim() || null, tagsJson: JSON.stringify(input.tags ?? []), alertPreferencesJson: "{}", isActive: 1 }).onDuplicateKeyUpdate({ set: { label: input.label?.trim() || null, tagsJson: JSON.stringify(input.tags ?? []), isActive: 1 } });
  return wallet;
}

export async function calculateAndPersistWalletAnalytics(walletId: number) {
  const db = await getDb();
  if (!db) throw new Error("ONCHAIN_STORAGE_UNAVAILABLE");
  const [wallet] = await db.select().from(onChainWallets).where(eq(onChainWallets.id, walletId)).limit(1);
  if (!wallet) throw new Error("ONCHAIN_WALLET_NOT_FOUND");
  const transactions = await db.select().from(onChainTransactions).where(eq(onChainTransactions.walletId, walletId)).orderBy(desc(onChainTransactions.observedAt));
  const analytics = analyzeObservedWalletActivity(transactions, wallet.dataQuality, wallet.address);
  await db.insert(onChainWalletScores).values({ walletId, smartMoneyScore: analytics.smartMoneyScore?.toFixed(2) ?? null, confidenceScore: analytics.confidenceScore?.toFixed(2) ?? null, classification: analytics.classification, scoreComponentsJson: JSON.stringify(analytics.components), evidenceJson: JSON.stringify({ whyThisScore: analytics.whyThisScore, transactionCount: transactions.length, provider: wallet.provider, chain: wallet.chain }), dataQuality: analytics.dataQuality, calculatedAt: new Date() });
  return analytics;
}

export async function listUserOnChainWatchlist(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("ONCHAIN_STORAGE_UNAVAILABLE");
  const watchlist = await db.select().from(userOnChainWalletWatchlists).where(eq(userOnChainWalletWatchlists.userId, userId)).orderBy(desc(userOnChainWalletWatchlists.updatedAt));
  return Promise.all(watchlist.map(async (entry) => {
    const [wallet] = await db.select().from(onChainWallets).where(eq(onChainWallets.id, entry.walletId)).limit(1);
    const [score] = await db.select().from(onChainWalletScores).where(eq(onChainWalletScores.walletId, entry.walletId)).orderBy(desc(onChainWalletScores.calculatedAt)).limit(1);
    return wallet ? { watchlist: entry, wallet, latestScore: score ?? null } : null;
  })).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null));
}

export async function userOwnedWalletEvidence(userId: number, walletId: number) {
  const db = await getDb();
  if (!db) throw new Error("ONCHAIN_STORAGE_UNAVAILABLE");
  const [entry] = await db.select().from(userOnChainWalletWatchlists).where(and(eq(userOnChainWalletWatchlists.userId, userId), eq(userOnChainWalletWatchlists.walletId, walletId))).limit(1);
  if (!entry) throw new Error("ONCHAIN_WALLET_NOT_OWNED_BY_USER");
  const [wallet] = await db.select().from(onChainWallets).where(eq(onChainWallets.id, walletId)).limit(1);
  const [score] = await db.select().from(onChainWalletScores).where(eq(onChainWalletScores.walletId, walletId)).orderBy(desc(onChainWalletScores.calculatedAt)).limit(1);
  const transfers = await db.select().from(onChainTransactions).where(eq(onChainTransactions.walletId, walletId)).orderBy(desc(onChainTransactions.observedAt)).limit(20);
  return { wallet, watchlist: entry, score: score ?? null, transfers };
}
