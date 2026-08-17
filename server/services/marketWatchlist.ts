import { and, eq } from "drizzle-orm";
import { marketWatchlistEntries } from "../../drizzle/schema";
import { goldAsset } from "../market/assets";
import { getDb } from "../db";

export async function listMarketWatchlist(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("MARKET_WATCHLIST_STORAGE_UNAVAILABLE");
  return db.select().from(marketWatchlistEntries).where(eq(marketWatchlistEntries.userId, userId)).orderBy(marketWatchlistEntries.updatedAt);
}

export async function addGoldToMarketWatchlist(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("MARKET_WATCHLIST_STORAGE_UNAVAILABLE");
  await db.insert(marketWatchlistEntries).values({
    userId,
    assetId: goldAsset.id,
    assetType: goldAsset.assetType,
    symbol: goldAsset.symbol,
  }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  return listMarketWatchlist(userId);
}

export async function removeGoldFromMarketWatchlist(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("MARKET_WATCHLIST_STORAGE_UNAVAILABLE");
  await db.delete(marketWatchlistEntries).where(and(eq(marketWatchlistEntries.userId, userId), eq(marketWatchlistEntries.assetId, goldAsset.id)));
  return listMarketWatchlist(userId);
}
