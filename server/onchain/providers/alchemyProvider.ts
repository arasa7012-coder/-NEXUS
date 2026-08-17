import { ENV } from "../../_core/env";
import { isPublicEvmAddress, onChainChainConfig, type NormalizedTokenBalance, type NormalizedTransfer, type OnChainChain, type OnChainProvider, type ProviderHealth, type WalletSnapshot } from "./types";

type RpcSuccess<T> = { jsonrpc: "2.0"; id: number; result: T };
type RpcFailure = { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

function qualityFor(status: "CONNECTED" | "NOT_CONFIGURED" | "RATE_LIMITED" | "UNAVAILABLE" | "ERROR") { return status === "CONNECTED" ? "VERIFIED" as const : "UNAVAILABLE" as const; }
function unavailable(chain: OnChainChain, address: string, status: "NOT_CONFIGURED" | "RATE_LIMITED" | "UNAVAILABLE" | "ERROR", message: string): WalletSnapshot { return { provider: "unavailable", chain, address, fetchedAt: new Date(), status, dataQuality: qualityFor(status), nativeBalanceWei: null, tokenBalances: [], transfers: [], nextPageKey: null, sourceLimitations: [message] }; }

export class AlchemyProvider implements OnChainProvider {
  readonly id = "alchemy" as const;
  private requestId = 0;
  private url(chain: OnChainChain) { return `https://${onChainChainConfig[chain].rpcHost}/v2/${ENV.alchemyApiKey}`; }
  private configured() { return Boolean(ENV.alchemyApiKey); }

  private async rpc<T>(chain: OnChainChain, method: string, params: unknown[]): Promise<T> {
    if (!this.configured()) throw new Error("NOT_CONFIGURED");
    const response = await fetch(this.url(chain), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method, params }) });
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (!response.ok) throw new Error("UNAVAILABLE");
    const payload = await response.json() as RpcSuccess<T> | RpcFailure;
    if ("error" in payload) throw new Error(payload.error.code === 429 ? "RATE_LIMITED" : "ERROR");
    return payload.result;
  }

  async health(chain: OnChainChain): Promise<ProviderHealth> {
    const checkedAt = new Date();
    if (!this.configured()) return { provider: "alchemy", status: "NOT_CONFIGURED", checkedAt, latencyMs: null, supportedChains: [], message: "ALCHEMY_API_KEY is not configured on the server." };
    const started = Date.now();
    try {
      const chainId = await this.rpc<string>(chain, "eth_chainId", []);
      const expected = chain === "ethereum" ? "0x1" : "0x2105";
      return chainId === expected ? { provider: "alchemy", status: "CONNECTED", checkedAt, latencyMs: Date.now() - started, supportedChains: [chain], message: null } : { provider: "alchemy", status: "ERROR", checkedAt, latencyMs: Date.now() - started, supportedChains: [], message: "Provider returned an unexpected network identity." };
    } catch (error) {
      const code = error instanceof Error ? error.message : "ERROR";
      const status = code === "RATE_LIMITED" ? "RATE_LIMITED" : code === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : code === "UNAVAILABLE" ? "UNAVAILABLE" : "ERROR";
      return { provider: "alchemy", status, checkedAt, latencyMs: Date.now() - started, supportedChains: [], message: "Alchemy health check did not return a verified network response." };
    }
  }

  async getWalletSnapshot(input: { chain: OnChainChain; address: string; pageKey?: string; maxTransfers?: number }): Promise<WalletSnapshot> {
    const address = input.address.trim();
    if (!isPublicEvmAddress(address)) return unavailable(input.chain, address, "ERROR", "A public EVM address is required. ENS resolution is not configured.");
    if (!this.configured()) return unavailable(input.chain, address, "NOT_CONFIGURED", "ON-CHAIN DATA PROVIDER NOT CONFIGURED");
    const fetchedAt = new Date();
    try {
      const [nativeBalanceWei, balances, incoming, outgoing] = await Promise.all([
        this.rpc<string>(input.chain, "eth_getBalance", [address, "latest"]),
        this.rpc<{ tokenBalances?: Array<{ contractAddress: string; tokenBalance: string | null }> }>(input.chain, "alchemy_getTokenBalances", [address, "DEFAULT_TOKENS"]),
        this.rpc<{ transfers?: Array<Record<string, unknown>>; pageKey?: string }>(input.chain, "alchemy_getAssetTransfers", [{ toAddress: address, category: ["external", "erc20", "erc721", "erc1155", "internal"], withMetadata: true, excludeZeroValue: true, maxCount: `0x${Math.min(input.maxTransfers ?? 25, 100).toString(16)}`, ...(input.pageKey ? { pageKey: input.pageKey } : {}) }]),
        this.rpc<{ transfers?: Array<Record<string, unknown>> }>(input.chain, "alchemy_getAssetTransfers", [{ fromAddress: address, category: ["external", "erc20", "erc721", "erc1155", "internal"], withMetadata: true, excludeZeroValue: true, maxCount: `0x${Math.min(input.maxTransfers ?? 25, 100).toString(16)}` }]),
      ]);
      const base = { provider: "alchemy" as const, chain: input.chain, fetchedAt, status: "CONNECTED" as const, dataQuality: "VERIFIED" as const };
      const tokenBalances: NormalizedTokenBalance[] = (balances.tokenBalances ?? []).filter((token) => Boolean(token.tokenBalance) && token.tokenBalance !== "0x0").map((token) => ({ ...base, contractAddress: token.contractAddress, tokenBalance: token.tokenBalance ?? "0x0", decimals: null, symbol: null, name: null }));
      const normalize = (transfer: Record<string, unknown>): NormalizedTransfer => ({ ...base, transactionHash: String(transfer.hash ?? ""), blockNumber: transfer.blockNum ? String(transfer.blockNum) : null, timestamp: typeof (transfer.metadata as { blockTimestamp?: unknown } | undefined)?.blockTimestamp === "string" ? new Date((transfer.metadata as { blockTimestamp: string }).blockTimestamp) : null, from: typeof transfer.from === "string" ? transfer.from : null, to: typeof transfer.to === "string" ? transfer.to : null, asset: typeof transfer.asset === "string" ? transfer.asset : null, value: transfer.value == null ? null : String(transfer.value), category: typeof transfer.category === "string" ? transfer.category : "unknown", contractAddress: typeof transfer.rawContract === "object" && transfer.rawContract && typeof (transfer.rawContract as { address?: unknown }).address === "string" ? (transfer.rawContract as { address: string }).address : null });
      const transfers = [...(incoming.transfers ?? []), ...(outgoing.transfers ?? [])].map(normalize).filter((transfer, index, all) => transfer.transactionHash && all.findIndex((candidate) => `${candidate.transactionHash}:${candidate.from}:${candidate.to}:${candidate.category}` === `${transfer.transactionHash}:${transfer.from}:${transfer.to}:${transfer.category}`) === index);
      return { ...base, address, nativeBalanceWei, tokenBalances, transfers, nextPageKey: incoming.pageKey ?? null, sourceLimitations: ["Token metadata, historical portfolio valuation, realized P&L, and Smart Money analytics require normalized persisted observations and are not inferred directly from a single provider response."] };
    } catch (error) {
      const code = error instanceof Error ? error.message : "ERROR";
      const status = code === "RATE_LIMITED" ? "RATE_LIMITED" : code === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : code === "UNAVAILABLE" ? "UNAVAILABLE" : "ERROR";
      return unavailable(input.chain, address, status, status === "RATE_LIMITED" ? "Alchemy rate limit reached; no provider data was inferred." : "Alchemy could not return verified wallet data for this request.");
    }
  }
}
