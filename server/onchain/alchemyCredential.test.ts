import { describe, expect, it } from "vitest";

describe("Alchemy credential", () => {
  it("authenticates a server-side Ethereum JSON-RPC request when configured and never assumes a credential otherwise", async () => {
    const key = process.env.ALCHEMY_API_KEY;

    if (!key) {
      expect(key).toBeFalsy();
      return;
    }

    const response = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });

    expect(response.status, "Alchemy must accept the supplied server credential").toBe(200);
    const payload = await response.json() as { result?: string; error?: { message?: string } };
    expect(payload.error?.message ?? null).toBeNull();
    expect(payload.result).toBe("0x1");
  }, 15_000);
});
