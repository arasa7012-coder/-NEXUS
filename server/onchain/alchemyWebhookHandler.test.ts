import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_SIGNING_KEY = "alchemy-webhook-signing-key-for-isolated-tests";
const originalSigningKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;

describe("Alchemy webhook observation", () => {
  beforeEach(() => {
    process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = TEST_SIGNING_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = originalSigningKey;
    vi.resetModules();
  });

  it("normalizes Base activity addresses and produces a stable provider event identity", async () => {
    const { extractAlchemyWebhookObservation } = await import("./alchemyWebhookHandler");
    const raw = '{"id":"evt-base-1","event":{"network":"BASE_MAINNET","activity":[{"fromAddress":"0x1111111111111111111111111111111111111111","toAddress":"0x2222222222222222222222222222222222222222"}]}}';

    expect(extractAlchemyWebhookObservation(JSON.parse(raw), raw)).toMatchObject({
      eventId: "alchemy:evt-base-1",
      eventType: "ADDRESS_ACTIVITY",
      chain: "base",
      addresses: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"],
    });
  });

  it("does not accept a malformed signature before parsing or storing the payload", async () => {
    const { alchemyWebhookHandler } = await import("./alchemyWebhookHandler");
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();

    await alchemyWebhookHandler(
      { rawBody: '{"event":{}}', header: () => "not-a-valid-signature" } as any,
      { status, json } as any
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ status: "INVALID_SIGNATURE" });
  });
});
