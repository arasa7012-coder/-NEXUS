export const assetTypes = [
  "CRYPTO",
  "STABLECOIN",
  "COMMODITY",
  "FOREX",
  "STOCK",
  "INDEX",
  "REAL_WORLD_ASSET",
] as const;

export type NexusAssetType = (typeof assetTypes)[number];

export type MarketAssetDefinition = {
  id: string;
  name: string;
  symbol: string;
  aliases: readonly string[];
  assetType: NexusAssetType;
  baseAsset: string;
  quoteAsset: string;
  provider: "twelve_data";
  supportsOnChainIntelligence: false;
  supportsPortfolioOwnership: false;
};

export const goldAsset: MarketAssetDefinition = {
  id: "xau-usd",
  name: "Gold",
  symbol: "XAU/USD",
  aliases: ["gold", "xau", "xau/usd"],
  assetType: "COMMODITY",
  baseAsset: "XAU",
  quoteAsset: "USD",
  provider: "twelve_data",
  supportsOnChainIntelligence: false,
  supportsPortfolioOwnership: false,
};

export function isGoldAssetId(value: string) {
  return value.trim().toLowerCase() === goldAsset.id;
}

export function matchesMarketAssetSearch(asset: MarketAssetDefinition, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return [asset.name, asset.symbol, asset.baseAsset, asset.quoteAsset, ...asset.aliases]
    .some((value) => value.toLowerCase().includes(normalized));
}
