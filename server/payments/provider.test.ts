import { describe, expect, it } from "vitest";
import { NoPaymentProvider, getPaymentProvider } from "./provider";
import { ingestPaymentWebhook } from "./webhookService";

describe("Nexus V3.0 payment-provider architecture", () => {
  it("exposes a non-configured provider until real server credentials are explicitly installed", async () => {
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(NoPaymentProvider);
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.verifyWebhook({ rawBody: "{}", signature: null, headers: {} })).resolves.toEqual({ verified: false, reason: "NOT_CONFIGURED" });
  });

  it("refuses an unconfigured webhook before it can write subscription or billing state", async () => {
    const result = await ingestPaymentWebhook(new NoPaymentProvider(), { rawBody: '{"event":"payment.succeeded"}', signature: "untrusted", headers: {} });
    expect(result).toEqual({ accepted: false, duplicate: false, reason: "NOT_CONFIGURED" });
  });
});
