import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "../_core/env";

export type AlchemyWebhookVerification = { valid: boolean; status: "VERIFIED" | "NOT_CONFIGURED" | "INVALID_SIGNATURE"; reason: string };

/** Validates Alchemy's documented X-Alchemy-Signature against the original unparsed request body. */
export function verifyAlchemyWebhookSignature(rawBody: string, signature: string | undefined): AlchemyWebhookVerification {
  if (!ENV.alchemyWebhookSigningKey) return { valid: false, status: "NOT_CONFIGURED", reason: "ALCHEMY_WEBHOOK_SIGNING_KEY is not configured; webhook intake remains disabled." };
  if (!signature) return { valid: false, status: "INVALID_SIGNATURE", reason: "X-Alchemy-Signature is required." };
  const digest = createHmac("sha256", ENV.alchemyWebhookSigningKey).update(rawBody, "utf8").digest("hex");
  const received = Buffer.from(signature, "utf8");
  const expected = Buffer.from(digest, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected) ? { valid: true, status: "VERIFIED", reason: "Webhook signature verified." } : { valid: false, status: "INVALID_SIGNATURE", reason: "Webhook signature did not match the raw request body." };
}
