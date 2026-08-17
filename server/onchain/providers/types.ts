export type OnChainChain = "ethereum" | "base";
export type OnChainProviderStatus = "CONNECTED" | "NOT_CONFIGURED" | "RATE_LIMITED" | "UNAVAILABLE" | "ERROR";
export type OnChainDataQuality = "VERIFIED" | "PARTIAL" | "STALE" | "UNAVAILABLE";

export type ProviderSource = {
  provider: "alchemy" | "unavailable";
  chain: OnChainChain;
  fetchedAt: Date;
  status: OnChainProviderStatus;
  dataQuality: OnChainDataQuality;
};

export type NormalizedTokenBalance = ProviderSource & { contractAddress: string; tokenBalance: string; decimals: number | null; symbol: string | null; name: string | null };
export type NormalizedTransfer = ProviderSource & { transactionHash: string; blockNumber: string | null; timestamp: Date | null; from: string | null; to: string | null; asset: string | null; value: string | null; category: string; contractAddress: string | null };
export type WalletSnapshot = ProviderSource & { address: string; nativeBalanceWei: string | null; tokenBalances: NormalizedTokenBalance[]; transfers: NormalizedTransfer[]; nextPageKey: string | null; sourceLimitations: string[] };
export type ProviderHealth = { provider: "alchemy" | "unavailable"; status: OnChainProviderStatus; checkedAt: Date; latencyMs: number | null; supportedChains: OnChainChain[]; message: string | null };

export interface OnChainProvider {
  readonly id: "alchemy" | "unavailable";
  health(chain: OnChainChain): Promise<ProviderHealth>;
  getWalletSnapshot(input: { chain: OnChainChain; address: string; pageKey?: string; maxTransfers?: number }): Promise<WalletSnapshot>;
}

export const onChainChainConfig: Record<OnChainChain, { label: string; rpcHost: string }> = {
  ethereum: { label: "Ethereum", rpcHost: "eth-mainnet.g.alchemy.com" },
  base: { label: "Base", rpcHost: "base-mainnet.g.alchemy.com" },
};

export function isPublicEvmAddress(value: string) { return /^0x[a-fA-F0-9]{40}$/.test(value); }
