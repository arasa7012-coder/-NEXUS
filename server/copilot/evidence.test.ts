import { describe, expect, it } from "vitest";
import { deterministicCopilotFallback } from "./evidence";

describe("deterministicCopilotFallback", () => {
  it("states unavailable evidence explicitly and preserves paper-only boundaries", () => {
    const text = deterministicCopilotFallback({
      generatedAt: 1_725_000_000_000,
      request: { kind: "MARKET", symbol: "BTC", decisionId: null, runId: null },
      evidenceIds: ["market.overview", "asset.intelligence"],
      marketOverview: { overallRegime: "UNCLEAR", marketMomentum: "MIXED", volatility: "NORMAL", availableAssets: 2, isStale: false, source: "coingecko+public-exchange", generatedAt: 1_725_000_000_000 },
      assetIntelligence: { unavailable: true, reason: "This symbol has no verified primary timeframe." },
      paperPortfolio: { unavailable: true, reason: "Storage unavailable." },
      riskProtection: { unavailable: true, reason: "Storage unavailable." },
      paperDecisions: [], riskEvents: [], strategyRuns: [], limitations: ["Portfolio evidence is unavailable."],
    } as never);
    expect(text).toContain("Asset evidence unavailable");
    expect(text).toContain("Portfolio evidence is unavailable.");
    expect(text).toContain("not a prediction or an execution instruction");
    expect(text).toContain("market.overview");
  });

  it("preserves stale-market status and a persisted Risk Engine rejection without inventing a resolution", () => {
    const text = deterministicCopilotFallback({
      generatedAt: 1_725_000_000_000,
      request: { kind: "RISK", symbol: "ETH", decisionId: 44, runId: null }, evidenceIds: ["market.overview", "paper.decisions"],
      marketOverview: { overallRegime: "HIGH_VOLATILITY", marketMomentum: "MIXED", volatility: "HIGH", availableAssets: 1, isStale: true, source: "coingecko+public-exchange", generatedAt: 1_725_000_000_000 },
      assetIntelligence: { unavailable: true, reason: "No verified frame." }, paperPortfolio: {}, riskProtection: {},
      paperDecisions: [{ symbol: "ETH", decision: "REJECTED", rejectionReason: "Daily paper-loss limit reached." }], riskEvents: [], strategyRuns: [], limitations: [],
    } as never);
    expect(text).toContain("STALE");
    expect(text).toContain("REJECTED");
    expect(text).toContain("Daily paper-loss limit reached.");
    expect(text).toContain("not a prediction or an execution instruction");
  });
});
