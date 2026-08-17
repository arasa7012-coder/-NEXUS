import { getDb } from "../db";
import { notifications } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface CreateNotificationInput {
  userId: number;
  title: string;
  message: string;
  type: "price_alert" | "portfolio_update" | "trade_signal" | "system";
  relatedCryptoId?: number;
  actionUrl?: string;
}

export async function createNotification(input: CreateNotificationInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(notifications).values({
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type,
    relatedCryptoId: input.relatedCryptoId,
    actionUrl: input.actionUrl,
    isRead: 0,
  });

  return result;
}

export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userNotifications = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy((t) => t.createdAt)
    .limit(limit);

  return userNotifications;
}

export async function markNotificationAsRead(notificationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(eq(notifications.id, notificationId));

  return result;
}

export async function markAllAsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)));

  return result;
}

export async function deleteNotification(notificationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .delete(notifications)
    .where(eq(notifications.id, notificationId));

  return result;
}

export async function getUnreadCount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)));

  return result.length;
}

// Helper function to send price alert notification
export async function sendPriceAlertNotification(
  userId: number,
  cryptoSymbol: string,
  currentPrice: number,
  targetPrice: number,
  alertType: "above" | "below"
) {
  const message =
    alertType === "above"
      ? `${cryptoSymbol} has risen above $${targetPrice.toFixed(2)}! Current price: $${currentPrice.toFixed(2)}`
      : `${cryptoSymbol} has fallen below $${targetPrice.toFixed(2)}! Current price: $${currentPrice.toFixed(2)}`;

  return createNotification({
    userId,
    title: `${cryptoSymbol} Price Alert`,
    message,
    type: "price_alert",
    actionUrl: `/dashboard?crypto=${cryptoSymbol}`,
  });
}

// Helper function to send portfolio update notification
export async function sendPortfolioUpdateNotification(
  userId: number,
  totalValue: number,
  profitLoss: number,
  profitPercent: number
) {
  const message =
    profitLoss >= 0
      ? `Your portfolio is up $${profitLoss.toFixed(2)} (+${profitPercent.toFixed(2)}%). Total value: $${totalValue.toFixed(2)}`
      : `Your portfolio is down $${Math.abs(profitLoss).toFixed(2)} (${profitPercent.toFixed(2)}%). Total value: $${totalValue.toFixed(2)}`;

  return createNotification({
    userId,
    title: "Portfolio Update",
    message,
    type: "portfolio_update",
    actionUrl: "/portfolio",
  });
}

// Helper function to send trade signal notification
export async function sendTradeSignalNotification(
  userId: number,
  cryptoSymbol: string,
  signal: "BUY" | "SELL" | "HOLD",
  confidence: number,
  reason: string
) {
  const message = `${signal} signal for ${cryptoSymbol} (${confidence}% confidence): ${reason}`;

  return createNotification({
    userId,
    title: `Trade Signal: ${signal} ${cryptoSymbol}`,
    message,
    type: "trade_signal",
    actionUrl: `/dashboard?crypto=${cryptoSymbol}`,
  });
}
