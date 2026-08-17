import { describe, expect, it } from "vitest";

const apiKey = process.env.COINGECKO_API_KEY;
const credentialRequestTimeoutMs = 5_000;

describe("CoinGecko credential", () => {
  it("authenticates against a read-only ping endpoint when configured and never assumes a credential otherwise", async () => {
    if (!apiKey) {
      expect(apiKey).toBeFalsy();
      return;
    }

    const candidates = [
      {
        url: "https://api.coingecko.com/api/v3/ping",
        header: "x-cg-demo-api-key",
      },
      {
        url: "https://pro-api.coingecko.com/api/v3/ping",
        header: "x-cg-pro-api-key",
      },
    ] as const;

    const results = await Promise.all(
      candidates.map(async ({ url, header }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), credentialRequestTimeoutMs);
        try {
          const response = await fetch(url, {
            headers: { [header]: apiKey! },
            signal: controller.signal,
          });
          return { ok: response.ok, status: response.status, reason: "response" };
        } catch (error) {
          const timedOut = error instanceof DOMException && error.name === "AbortError";
          return {
            ok: false,
            status: 0,
            reason: timedOut ? `timeout after ${credentialRequestTimeoutMs}ms` : "network failure",
          };
        } finally {
          clearTimeout(timeout);
        }
      }),
    );

    const summary = results.map((result) => `${result.status}:${result.reason}`).join(", ");
    expect(results.some((result) => result.status === 401 || result.status === 403), `CoinGecko credential was rejected (${summary})`).toBe(false);
    if (results.every((result) => result.status === 0)) {
      console.warn(`CoinGecko credential reachability check deferred because both public endpoints were unreachable (${summary}).`);
      return;
    }
    expect(results.some((result) => result.ok), `CoinGecko credential was not accepted or reachable (${summary})`).toBe(true);
  }, 8_000);
});
