import { describe, expect, it } from "vitest";
import { goldAsset, matchesMarketAssetSearch } from "./assets";

describe("Gold market asset definition", () => {
  it("defines XAU/USD as a commodity outside the crypto and on-chain models", () => {
    expect(goldAsset).toMatchObject({ id: "xau-usd", name: "Gold", symbol: "XAU/USD", assetType: "COMMODITY", baseAsset: "XAU", quoteAsset: "USD", supportsOnChainIntelligence: false, supportsPortfolioOwnership: false });
  });

  it.each(["Gold", "gold", "XAU", "XAU/USD"])("finds Gold through %s", (query) => {
    expect(matchesMarketAssetSearch(goldAsset, query)).toBe(true);
  });
});
