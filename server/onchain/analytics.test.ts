import { describe, expect, it } from "vitest";
import type { OnChainTransaction } from "../../drizzle/schema";
import { analyzeObservedWalletActivity } from "./analytics";

function observed(index: number, day: number): OnChainTransaction {
  return { id: index, walletId: 1, provider: "alchemy", transferKey: `key-${index}`, transactionHash: `0x${String(index).padStart(64, "0")}`, blockNumber: String(20_000_000 + index), observedAt: new Date(Date.UTC(2025, 0, day)), fromAddress: "0x0000000000000000000000000000000000000001", toAddress: "0x0000000000000000000000000000000000000002", category: "erc20", asset: "TEST", contractAddress: "0x0000000000000000000000000000000000000003", value: "1", sourcePayloadJson: "{}", createdAt: new Date() };
}

describe("Nexus on-chain analytics", () => {
  it("returns INSUFFICIENT_DATA rather than a Smart Money score when evidence is sparse", () => {
    const result = analyzeObservedWalletActivity([observed(1, 1), observed(2, 2)], "VERIFIED", "0x0000000000000000000000000000000000000002");
    expect(result.classification).toBe("INSUFFICIENT_DATA");
    expect(result.smartMoneyScore).toBeNull();
    expect(result.components.some((metric) => metric.label === "Historical P&L" && metric.status === "DATA_SOURCE_NOT_AVAILABLE")).toBe(true);
  });

  it("produces an explainable observational score only after minimum transfer and history evidence", () => {
    const records = Array.from({ length: 12 }, (_, index) => observed(index + 1, index + 1));
    const result = analyzeObservedWalletActivity(records, "VERIFIED", "0x0000000000000000000000000000000000000002");
    expect(result.smartMoneyScore).not.toBeNull();
    expect(result.confidenceScore).not.toBeNull();
    expect(result.whyThisScore.join(" ")).toContain("P&L");
    expect(result.components.some((metric) => metric.label === "Nexus activity score" && metric.status === "OBSERVED")).toBe(true);
  });
});
