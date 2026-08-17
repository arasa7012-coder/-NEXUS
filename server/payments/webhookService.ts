import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { billingAuditEvents, billingProviderCustomers, paymentWebhookDeliveries, userSubscriptions } from "../../drizzle/schema";
import type { PaymentProvider } from "./provider";
import { getDb } from "../db";

export type WebhookIngestionResult = { accepted: boolean; duplicate: boolean; reason: "NOT_CONFIGURED" | "INVALID_SIGNATURE" | "UNSUPPORTED_EVENT" | "MALFORMED_PAYLOAD" | "PROCESSED" | "IGNORED" | "UNAVAILABLE" };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Future HTTP handlers must pass the unparsed raw request body and signature header here.
 * The function refuses unconfigured providers and makes duplicate provider event IDs idempotent.
 */
export async function ingestPaymentWebhook(provider: PaymentProvider, input: { rawBody: string; signature: string | null; headers: Record<string, string | string[] | undefined> }): Promise<WebhookIngestionResult> {
  if (!provider.isConfigured()) return { accepted: false, duplicate: false, reason: "NOT_CONFIGURED" };
  const verification = await provider.verifyWebhook(input);
  if (!verification.verified) return { accepted: false, duplicate: false, reason: verification.reason };
  const db = await getDb(); if (!db) return { accepted: false, duplicate: false, reason: "UNAVAILABLE" };
  const event = verification.event;
  const existing = (await db.select().from(paymentWebhookDeliveries).where(and(eq(paymentWebhookDeliveries.provider, provider.name), eq(paymentWebhookDeliveries.providerEventId, event.providerEventId))).limit(1))[0];
  if (existing) return { accepted: existing.processingState === "PROCESSED", duplicate: true, reason: existing.processingState === "PROCESSED" ? "PROCESSED" : "IGNORED" };
  await db.insert(paymentWebhookDeliveries).values({ provider: provider.name, providerEventId: event.providerEventId, eventType: event.eventType, verificationState: "VERIFIED", processingState: "PENDING", payloadHash: hash(input.rawBody), payloadJson: JSON.stringify({ eventType: event.eventType, providerCustomerId: event.providerCustomerId, providerSubscriptionId: event.providerSubscriptionId, plan: event.plan, state: event.state, occurredAt: event.occurredAt.toISOString() }) });
  const customer = event.providerCustomerId ? (await db.select().from(billingProviderCustomers).where(and(eq(billingProviderCustomers.provider, provider.name), eq(billingProviderCustomers.providerCustomerId, event.providerCustomerId))).limit(1))[0] : null;
  if (!customer || !event.plan || !event.state) {
    await db.update(paymentWebhookDeliveries).set({ processingState: "IGNORED", processedAt: new Date(), errorMessage: "No owned customer mapping or canonical subscription state." }).where(and(eq(paymentWebhookDeliveries.provider, provider.name), eq(paymentWebhookDeliveries.providerEventId, event.providerEventId)));
    return { accepted: true, duplicate: false, reason: "IGNORED" };
  }
  await db.insert(userSubscriptions).values({ userId: customer.userId, plan: event.plan, state: event.state, provider: provider.name, providerSubscriptionId: event.providerSubscriptionId, stateReason: `WEBHOOK:${event.eventType}` }).onDuplicateKeyUpdate({ set: { plan: event.plan, state: event.state, provider: provider.name, providerSubscriptionId: event.providerSubscriptionId, stateReason: `WEBHOOK:${event.eventType}`, updatedAt: new Date() } });
  await db.insert(billingAuditEvents).values({ eventKey: `${provider.name}:${event.providerEventId}`, userId: customer.userId, source: "PROVIDER", eventType: event.eventType, detailsJson: JSON.stringify({ plan: event.plan, state: event.state, providerCustomerId: event.providerCustomerId, providerSubscriptionId: event.providerSubscriptionId }), occurredAt: event.occurredAt });
  await db.update(paymentWebhookDeliveries).set({ processingState: "PROCESSED", processedAt: new Date() }).where(and(eq(paymentWebhookDeliveries.provider, provider.name), eq(paymentWebhookDeliveries.providerEventId, event.providerEventId)));
  return { accepted: true, duplicate: false, reason: "PROCESSED" };
}
