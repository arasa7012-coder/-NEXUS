import { and, desc, eq } from "drizzle-orm";
import { notificationDeviceRegistrations, userNotificationPreferences } from "../../drizzle/schema";
import { getDb } from "../db";

export type NotificationPreferenceInput = Partial<{
  inAppConsent: boolean;
  emailConsent: boolean;
  pushConsent: boolean;
  dailyBriefingScheduleIntent: boolean;
}>;

export type DeviceReadinessInput = {
  devicePublicId: string;
  platform: "WEB" | "IOS" | "ANDROID" | "UNKNOWN";
  permissionState: "DEFAULT" | "GRANTED" | "DENIED" | "UNSUPPORTED" | "REVOKED";
};

function asFlag(value: boolean) { return value ? 1 : 0; }

export async function getNotificationReadiness(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Notification preference storage is temporarily unavailable.");
  let preferences = (await db.select().from(userNotificationPreferences).where(eq(userNotificationPreferences.userId, userId)).limit(1))[0];
  if (!preferences) {
    await db.insert(userNotificationPreferences).values({ userId });
    preferences = (await db.select().from(userNotificationPreferences).where(eq(userNotificationPreferences.userId, userId)).limit(1))[0]!;
  }
  const devices = await db.select().from(notificationDeviceRegistrations).where(eq(notificationDeviceRegistrations.userId, userId)).orderBy(desc(notificationDeviceRegistrations.updatedAt)).limit(20);
  return {
    preferences,
    devices,
    delivery: {
      inApp: preferences.inAppConsent === 1 ? "CONSENTED_NO_EXTERNAL_DELIVERY" : "NOT_CONSENTED",
      email: preferences.emailConsent === 1 ? "PROVIDER_UNCONFIGURED" : "NOT_CONSENTED",
      push: preferences.pushConsent === 1 ? "PROVIDER_UNCONFIGURED" : "NOT_CONSENTED",
    },
    externalDeliveryActive: false as const,
  };
}

export async function updateNotificationReadiness(userId: number, input: NotificationPreferenceInput) {
  const current = await getNotificationReadiness(userId);
  const db = await getDb();
  if (!db) throw new Error("Notification preference storage is temporarily unavailable.");
  const next = {
    inAppConsent: input.inAppConsent === undefined ? current.preferences.inAppConsent : asFlag(input.inAppConsent),
    emailConsent: input.emailConsent === undefined ? current.preferences.emailConsent : asFlag(input.emailConsent),
    pushConsent: input.pushConsent === undefined ? current.preferences.pushConsent : asFlag(input.pushConsent),
    dailyBriefingScheduleIntent: input.dailyBriefingScheduleIntent === undefined ? current.preferences.dailyBriefingScheduleIntent : asFlag(input.dailyBriefingScheduleIntent),
  };
  await db.update(userNotificationPreferences).set(next).where(eq(userNotificationPreferences.userId, userId));
  return getNotificationReadiness(userId);
}

/** Stores permission/lifecycle metadata only. No raw token or push subscription is accepted until a configured provider is explicitly introduced. */
export async function registerDeviceReadiness(userId: number, input: DeviceReadinessInput) {
  const db = await getDb();
  if (!db) throw new Error("Notification device storage is temporarily unavailable.");
  const now = new Date();
  const lifecycle = input.permissionState === "REVOKED" ? "REVOKED"
    : input.permissionState === "GRANTED" ? "PROVIDER_UNCONFIGURED"
      : "NOT_REQUESTED";
  await db.insert(notificationDeviceRegistrations).values({
    userId, devicePublicId: input.devicePublicId, platform: input.platform, permissionState: input.permissionState,
    tokenLifecycleState: lifecycle, consentedAt: input.permissionState === "GRANTED" ? now : null,
    revokedAt: input.permissionState === "REVOKED" ? now : null, lastSeenAt: now,
  }).onDuplicateKeyUpdate({ set: {
    platform: input.platform, permissionState: input.permissionState, tokenLifecycleState: lifecycle,
    consentedAt: input.permissionState === "GRANTED" ? now : null, revokedAt: input.permissionState === "REVOKED" ? now : null, lastSeenAt: now,
  }});
  return getNotificationReadiness(userId);
}

export async function revokeDeviceReadiness(userId: number, devicePublicId: string) {
  const db = await getDb();
  if (!db) throw new Error("Notification device storage is temporarily unavailable.");
  const result = await db.update(notificationDeviceRegistrations).set({ permissionState: "REVOKED", tokenLifecycleState: "REVOKED", revokedAt: new Date() })
    .where(and(eq(notificationDeviceRegistrations.userId, userId), eq(notificationDeviceRegistrations.devicePublicId, devicePublicId)));
  if ((result as { affectedRows?: number }).affectedRows === 0) throw new Error("Notification device not found.");
  return getNotificationReadiness(userId);
}
