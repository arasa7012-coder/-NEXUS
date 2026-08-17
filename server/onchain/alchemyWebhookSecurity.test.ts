import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_SIGNING_KEY = "alchemy-webhook-signing-key-for-isolated-tests";
const originalSigningKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;

describe("Alchemy webhook signing secret", () => {
  beforeEach(() => {
    process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = TEST_SIGNING_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = originalSigningKey;
    vi.resetModules();
  });

  it("validates a server-only signing secret through the HMAC verification path", async () => {
    const { ENV } = await import("../_core/env");
    const { verifyAlchemyWebhookSignature } = await import("./alchemyWebhookSecurity");
    const rawBody = '{"webhookId":"nexus-secret-validation","event":{"network":"ETH_MAINNET"}}';
    const signature = createHmac("sha256", ENV.alchemyWebhookSigningKey!).update(rawBody).digest("hex");

    expect(verifyAlchemyWebhookSignature(rawBody, signature)).toMatchObject({ status: "VERIFIED", valid: true });
  });
});
