import { describe, expect, it } from "vitest";
import { AlchemyProvider } from "./alchemyProvider";

const publicReferenceAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const hasAlchemyCredential = Boolean(process.env.ALCHEMY_API_KEY);

describe("AlchemyProvider", () => {
  it("verifies network identities when configured and reports missing configuration honestly otherwise", async () => {
    const provider = new AlchemyProvider();
    const [ethereum, base] = await Promise.all([provider.health("ethereum"), provider.health("base")]);

    if (!hasAlchemyCredential) {
      expect(ethereum).toMatchObject({ status: "NOT_CONFIGURED", supportedChains: [] });
      expect(base).toMatchObject({ status: "NOT_CONFIGURED", supportedChains: [] });
      return;
    }

    expect(ethereum.status).toBe("CONNECTED");
    expect(base.status).toBe("CONNECTED");
    expect(ethereum.supportedChains).toEqual(["ethereum"]);
    expect(base.supportedChains).toEqual(["base"]);
  }, 20_000);

  it("returns only source-backed wallet data when configured and no fabricated data otherwise", async () => {
    const provider = new AlchemyProvider();
    const snapshot = await provider.getWalletSnapshot({ chain: "ethereum", address: publicReferenceAddress, maxTransfers: 5 });

    if (!hasAlchemyCredential) {
      expect(snapshot).toMatchObject({
        provider: "unavailable",
        status: "NOT_CONFIGURED",
        dataQuality: "UNAVAILABLE",
        nativeBalanceWei: null,
        tokenBalances: [],
        transfers: [],
      });
      return;
    }

    expect(snapshot.status).toBe("CONNECTED");
    expect(snapshot.provider).toBe("alchemy");
    expect(snapshot.dataQuality).toBe("VERIFIED");
    expect(snapshot.address).toBe(publicReferenceAddress);
    expect(snapshot.nativeBalanceWei).toMatch(/^0x[\da-f]+$/i);
    expect(snapshot.transfers.every((transfer) => transfer.transactionHash.startsWith("0x"))).toBe(true);
  }, 30_000);
});
