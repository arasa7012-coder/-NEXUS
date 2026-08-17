import { and, desc, eq, InferInsertModel, InferSelectModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, cryptocurrencies, candles, alerts, aiPredictions, portfolios, portfolioAssets } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export type Cryptocurrency = InferSelectModel<typeof cryptocurrencies>;
export type InsertCryptocurrency = InferInsertModel<typeof cryptocurrencies>;

export type Candle = InferSelectModel<typeof candles>;
export type InsertCandle = InferInsertModel<typeof candles>;

export type Alert = InferSelectModel<typeof alerts>;
export type InsertAlert = InferInsertModel<typeof alerts>;

export type AiPrediction = InferSelectModel<typeof aiPredictions>;
export type InsertAiPrediction = InferInsertModel<typeof aiPredictions>;

export async function getCryptocurrencies() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get cryptocurrencies: database not available");
    return [];
  }
  return db.select().from(cryptocurrencies);
}

export async function getCryptocurrencyBySymbol(symbol: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get cryptocurrency by symbol: database not available");
    return undefined;
  }
  const result = await db.select().from(cryptocurrencies).where(eq(cryptocurrencies.symbol, symbol)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertCryptocurrency(crypto: InsertCryptocurrency) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert cryptocurrency: database not available");
    return;
  }
  await db.insert(cryptocurrencies).values(crypto);
}

export async function getCandles(cryptoId: number, timeframe: string, limit: number = 100) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get candles: database not available");
    return [];
  }
  return db.select().from(candles).where(and(eq(candles.cryptoId, cryptoId), eq(candles.timeframe, timeframe))).orderBy(desc(candles.timestamp)).limit(limit);
}

export async function insertCandle(candle: InsertCandle) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert candle: database not available");
    return;
  }
  await db.insert(candles).values(candle);
}

export async function getAlertsByUserId(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get alerts: database not available");
    return [];
  }
  return db.select().from(alerts).where(eq(alerts.userId, userId));
}

export async function insertAlert(alert: InsertAlert) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert alert: database not available");
    return;
  }
  await db.insert(alerts).values(alert);
}

export async function getAiPredictions(cryptoId: number, timeframe: string, limit: number = 1) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get AI predictions: database not available");
    return [];
  }
  return db.select().from(aiPredictions).where(and(eq(aiPredictions.cryptoId, cryptoId), eq(aiPredictions.timeframe, timeframe))).orderBy(desc(aiPredictions.timestamp)).limit(limit);
}

export async function insertAiPrediction(prediction: InsertAiPrediction) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert AI prediction: database not available");
    return;
  }
  await db.insert(aiPredictions).values(prediction);
}


// Portfolio functions
export async function createPortfolio(userId: number, name: string, description?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(portfolios).values({
    userId,
    name,
    description,
    isDefault: 0,
  });
  
  return result;
}

export async function getUserPortfolios(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(portfolios).where(eq(portfolios.userId, userId));
}

export async function getPortfolioAssets(portfolioId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(portfolioAssets).where(eq(portfolioAssets.portfolioId, portfolioId));
}

export async function addAssetToPortfolio(
  portfolioId: number,
  cryptoId: number,
  quantity: string,
  purchasePrice: string,
  purchaseDate: Date,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(portfolioAssets).values({
    portfolioId,
    cryptoId,
    quantity,
    purchasePrice,
    purchaseDate,
    notes,
  });
}

export async function updatePortfolioAsset(
  assetId: number,
  quantity?: string,
  purchasePrice?: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: Record<string, unknown> = {};
  if (quantity !== undefined) updateData.quantity = quantity;
  if (purchasePrice !== undefined) updateData.purchasePrice = purchasePrice;
  if (notes !== undefined) updateData.notes = notes;
  
  return db.update(portfolioAssets).set(updateData).where(eq(portfolioAssets.id, assetId));
}

export async function deletePortfolioAsset(assetId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.delete(portfolioAssets).where(eq(portfolioAssets.id, assetId));
}

export async function deletePortfolio(portfolioId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete all assets first
  await db.delete(portfolioAssets).where(eq(portfolioAssets.portfolioId, portfolioId));
  
  // Then delete portfolio
  return db.delete(portfolios).where(eq(portfolios.id, portfolioId));
}


// Binance API Keys functions
export async function saveBinanceApiKey(
  userId: number,
  apiKey: string,
  apiSecret: string,
  label?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { encryptApiKey } = await import("./services/encryption");

  return db.insert(binanceApiKeys).values({
    userId,
    apiKey: encryptApiKey(apiKey),
    apiSecret: encryptApiKey(apiSecret),
    label,
    isActive: 1,
  });
}

export async function getUserBinanceApiKeys(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const keys = await db.select().from(binanceApiKeys).where(eq(binanceApiKeys.userId, userId));

  // Return keys without decrypting (for security). `encryptionFormat` is
  // derived from the self-describing ciphertext prefix — no key and no
  // decryption involved — so the UI can honestly flag records that still need
  // migration or re-entry without ever handling plaintext.
  const { classifyCiphertext } = await import("./services/encryption");

  return keys.map((key) => ({
    id: key.id,
    label: key.label,
    isActive: key.isActive,
    lastSyncedAt: key.lastSyncedAt,
    createdAt: key.createdAt,
    encryptionFormat: classifyCiphertext(key.apiSecret),
  }));
}

export async function getBinanceApiKeyDecrypted(keyId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { decryptApiKey } = await import("./services/encryption");

  const key = await db
    .select()
    .from(binanceApiKeys)
    .where(and(eq(binanceApiKeys.id, keyId), eq(binanceApiKeys.userId, userId)))
    .limit(1);

  if (!key || key.length === 0) {
    throw new Error("API key not found");
  }

  return {
    apiKey: decryptApiKey(key[0].apiKey),
    apiSecret: decryptApiKey(key[0].apiSecret),
  };
}

export async function deleteBinanceApiKey(keyId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .delete(binanceApiKeys)
    .where(and(eq(binanceApiKeys.id, keyId), eq(binanceApiKeys.userId, userId)));
}

export async function updateBinanceApiKeySyncTime(keyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .update(binanceApiKeys)
    .set({ lastSyncedAt: new Date() })
    .where(eq(binanceApiKeys.id, keyId));
}

// Import binanceApiKeys from schema
import { binanceApiKeys } from "../drizzle/schema";
