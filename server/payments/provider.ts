import type { SubscriptionPlan, SubscriptionState } from "../entitlements/catalog";

export type CanonicalSubscriptionEvent = { providerEventId: string; eventType: "subscription.created" | "subscription.updated" | "subscription.canceled" | "subscription.expired" | "payment.succeeded" | "payment.failed"; providerCustomerId: string | null; providerSubscriptionId: string | null; plan: SubscriptionPlan | null; state: SubscriptionState | null; occurredAt: Date };
export type WebhookVerification = { verified: true; event: CanonicalSubscriptionEvent } | { verified: false; reason: "NOT_CONFIGURED" | "INVALID_SIGNATURE" | "UNSUPPORTED_EVENT" | "MALFORMED_PAYLOAD" };

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  verifyWebhook(input: { rawBody: string; signature: string | null; headers: Record<string, string | string[] | undefined> }): Promise<WebhookVerification>;
}

export class NoPaymentProvider implements PaymentProvider {
  readonly name = "NOT_CONFIGURED";
  isConfigured() { return false; }
  async verifyWebhook(): Promise<WebhookVerification> { return { verified: false, reason: "NOT_CONFIGURED" }; }
}

/** The only provider returned until a real provider is explicitly configured with server-side credentials. */
export function getPaymentProvider(): PaymentProvider { return new NoPaymentProvider(); }
