import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  simulationRiskEvents,
  simulationTradeDecisions,
  paperPositionMonitoringEvents,
  paperPositionMonitoringStates,
  strategyBacktestRuns,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getMarketIntelligenceOverview, getAssetIntelligence, supportedIntelligenceAssets } from "../services/marketIntelligence";
import { getSimulationPortfolioProtection, getSimulationPortfolioState } from "../services/simulationPortfolio";
import type { CopilotRequestKind } from "./contracts";
import { userOwnedWalletEvidence } from "../onchain/walletSyncService";

const MAX_DECISIONS = 8;
const MAX_EVENTS = 8;
const MAX_RUNS = 5;

function safe<T>(promise: Promise<T>): Promise<{ value: T | null; error: string | null }> {
  return promise.then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: null, error: error instanceof Error ? error.message : "Unavailable" }));
}

function plain(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_key, current) => current instanceof Date ? current.toISOString() : current));
}

export function evidenceFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function requestFingerprint(userId: number, kind: CopilotRequestKind, question: string, symbol?: string | null, decisionId?: number | null, runId?: number | null, walletId?: number | null): string {
  return createHash("sha256").update(JSON.stringify({ userId, kind, question: question.trim().toLowerCase(), symbol: symbol?.toUpperCase() ?? null, decisionId: decisionId ?? null, runId: runId ?? null, walletId: walletId ?? null })).digest("hex");
}

export async function buildCopilotEvidence(input: {
  userId: number;
  kind: CopilotRequestKind;
  symbol?: string | null;
  decisionId?: number | null;
  runId?: number | null;
  walletId?: number | null;
  userContext?: { favoriteSymbols: string[]; preferredTimeframes: string[]; riskTolerance: string };
}) {
  const db = await getDb();
  if (!db) throw new Error("Copilot evidence storage is temporarily unavailable.");
  const normalizedSymbol = input.symbol?.trim().toUpperCase() || null;
  const asset = normalizedSymbol ? supportedIntelligenceAssets.find((item) => item.symbol === normalizedSymbol) ?? null : null;
  const [overview, assetAnalysis, portfolio, protection, decisions, events, monitoringStates, monitoringEvents, runs, onChainWallet] = await Promise.all([
    safe(getMarketIntelligenceOverview()),
    asset ? safe(getAssetIntelligence({ assetId: asset.id, preferredTimeframe: "4h" })) : Promise.resolve({ value: null, error: normalizedSymbol ? "This symbol is outside the verified intelligence universe." : null }),
    safe(getSimulationPortfolioState(input.userId)),
    safe(getSimulationPortfolioProtection(input.userId)),
    db.select().from(simulationTradeDecisions).where(eq(simulationTradeDecisions.userId, input.userId)).orderBy(desc(simulationTradeDecisions.createdAt)).limit(MAX_DECISIONS),
    db.select().from(simulationRiskEvents).where(eq(simulationRiskEvents.userId, input.userId)).orderBy(desc(simulationRiskEvents.createdAt)).limit(MAX_EVENTS),
    db.select().from(paperPositionMonitoringStates).where(eq(paperPositionMonitoringStates.userId, input.userId)).orderBy(desc(paperPositionMonitoringStates.updatedAt)).limit(MAX_EVENTS),
    db.select().from(paperPositionMonitoringEvents).where(eq(paperPositionMonitoringEvents.userId, input.userId)).orderBy(desc(paperPositionMonitoringEvents.createdAt)).limit(MAX_EVENTS),
    db.select().from(strategyBacktestRuns).where(eq(strategyBacktestRuns.userId, input.userId)).orderBy(desc(strategyBacktestRuns.createdAt)).limit(MAX_RUNS),
    input.walletId ? safe(userOwnedWalletEvidence(input.userId, input.walletId)) : Promise.resolve({ value: null, error: null }),
  ]);

  const ownedDecision = input.decisionId
    ? decisions.find((decision) => decision.id === input.decisionId) ?? (await db.select().from(simulationTradeDecisions).where(and(eq(simulationTradeDecisions.userId, input.userId), eq(simulationTradeDecisions.id, input.decisionId))).limit(1))[0] ?? null
    : null;
  const ownedRun = input.runId
    ? runs.find((run) => run.id === input.runId) ?? (await db.select().from(strategyBacktestRuns).where(and(eq(strategyBacktestRuns.userId, input.userId), eq(strategyBacktestRuns.id, input.runId))).limit(1))[0] ?? null
    : null;

  const evidence = {
    generatedAt: Date.now(),
    request: { kind: input.kind, symbol: normalizedSymbol, decisionId: input.decisionId ?? null, runId: input.runId ?? null, walletId: input.walletId ?? null },
    userContext: input.userContext ?? null,
    evidenceIds: ["market.overview", "asset.intelligence", "portfolio.paper", "risk.protection", "paper.decisions", "risk.events", "paper.monitoring.states", "paper.monitoring.events", "strategy.runs", "onchain.wallet"],
    marketOverview: overview.value ? plain(overview.value) : { unavailable: true, reason: overview.error },
    assetIntelligence: assetAnalysis.value ? plain(assetAnalysis.value) : { unavailable: true, reason: assetAnalysis.error },
    paperPortfolio: portfolio.value ? plain(portfolio.value) : { unavailable: true, reason: portfolio.error },
    riskProtection: protection.value ? plain(protection.value) : { unavailable: true, reason: protection.error },
    paperDecisions: plain(ownedDecision ? [ownedDecision] : decisions),
    riskEvents: plain(events),
    paperMonitoringStates: plain(monitoringStates),
    paperMonitoringEvents: plain(monitoringEvents),
    strategyRuns: plain(ownedRun ? [ownedRun] : runs),
    onChainWallet: onChainWallet.value ? plain(onChainWallet.value) : { unavailable: true, reason: input.walletId ? onChainWallet.error ?? "No owned public-wallet evidence was returned." : "No public wallet context was requested." },
    limitations: [
      ...(normalizedSymbol && !asset ? ["No verified intelligence evidence exists for the requested symbol."] : []),
      ...(overview.error ? ["Market overview is unavailable."] : []),
      ...(portfolio.error ? ["Paper portfolio context is unavailable."] : []),
      ...(input.walletId && onChainWallet.error ? ["Requested on-chain wallet evidence is unavailable or is not owned by this user."] : []),
    ],
  };
  return { evidence, fingerprint: evidenceFingerprint(evidence) };
}

export function deterministicCopilotFallback(evidence: Awaited<ReturnType<typeof buildCopilotEvidence>>["evidence"]): string {
  const market = evidence.marketOverview as { overallRegime?: string; marketMomentum?: string; volatility?: string; availableAssets?: number; isStale?: boolean; source?: string; generatedAt?: number; unavailable?: boolean; reason?: string };
  const asset = evidence.assetIntelligence as { symbol?: string; regime?: { status?: string; value?: { regime?: string } }; opportunityScore?: { value?: number | null }; riskScore?: { value?: number | null }; explanation?: { summary?: string; risks?: string[] }; unavailable?: boolean; reason?: string };
  const decision = (evidence.paperDecisions as Array<{ decision?: string; rejectionReason?: string | null; reasonsJson?: string; symbol?: string }>)[0];
  const monitoring = ((evidence.paperMonitoringStates ?? []) as Array<{ symbol?: string; state?: string; triggerReason?: string; dataQuality?: string }>)[0];
  const lines = ["## Deterministic market analysis", "This response uses only the evidence listed below; it is not a prediction or an execution instruction."];
  if (market.unavailable) lines.push(`- **Market overview unavailable:** ${market.reason ?? "No verified overview was returned."}`);
  else lines.push(`- **Market context:** regime ${market.overallRegime ?? "UNAVAILABLE"}; momentum ${market.marketMomentum ?? "UNAVAILABLE"}; volatility ${market.volatility ?? "UNAVAILABLE"}; ${market.availableAssets ?? 0} assets had sufficient evidence.`, `- **Freshness:** ${market.isStale ? "STALE" : "LIVE"} · source ${market.source ?? "UNAVAILABLE"} · generated ${market.generatedAt ? new Date(market.generatedAt).toISOString() : "UNAVAILABLE"}.`);
  if (asset.unavailable) lines.push(`- **Asset evidence unavailable:** ${asset.reason ?? "The requested asset has no verified analysis."}`);
  else if (asset.symbol) lines.push(`- **${asset.symbol} evidence:** regime ${asset.regime?.value?.regime ?? "UNAVAILABLE"}; opportunity score ${asset.opportunityScore?.value ?? "UNAVAILABLE"}; risk score ${asset.riskScore?.value ?? "UNAVAILABLE"}.`, `- **Deterministic explanation:** ${asset.explanation?.summary ?? "UNAVAILABLE"}`, `- **Risk factors:** ${(asset.explanation?.risks ?? ["UNAVAILABLE"]).join("; ")}.`);
  if (decision) lines.push(`- **Paper-trade decision (${decision.symbol ?? "UNAVAILABLE"}):** ${decision.decision ?? "UNAVAILABLE"}.${decision.rejectionReason ? ` Blocking reason: ${decision.rejectionReason}` : ""}`);
  if (monitoring) lines.push(`- **Paper-position monitor (${monitoring.symbol ?? "UNAVAILABLE"}):** ${monitoring.state ?? "UNAVAILABLE"}; data quality ${monitoring.dataQuality ?? "UNAVAILABLE"}. ${monitoring.triggerReason ?? "No transition reason is stored."}`);
  const wallet = (evidence.onChainWallet ?? { unavailable: true, reason: "No public wallet context was requested." }) as { wallet?: { address?: string; chain?: string; dataQuality?: string; provider?: string }; score?: { smartMoneyScore?: string | null; confidenceScore?: string | null; classification?: string }; transfers?: unknown[]; unavailable?: boolean; reason?: string };
  if (wallet.unavailable) lines.push(`- **On-chain wallet evidence unavailable:** ${wallet.reason ?? "No owned public wallet was supplied."}`);
  else if (wallet.wallet) lines.push(`- **On-chain wallet (${wallet.wallet.chain ?? "UNAVAILABLE"}):** provider ${wallet.wallet.provider ?? "UNAVAILABLE"}; data quality ${wallet.wallet.dataQuality ?? "UNAVAILABLE"}; retained transfers ${wallet.transfers?.length ?? 0}; Nexus activity score ${wallet.score?.smartMoneyScore ?? "INSUFFICIENT DATA"}; confidence ${wallet.score?.confidenceScore ?? "UNAVAILABLE"}; classification ${wallet.score?.classification ?? "UNAVAILABLE"}.`, "- **On-chain limitation:** this evidence does not establish realized P&L, win rate, drawdown, position value, or a trading recommendation.");
  if (evidence.limitations.length) lines.push(`- **Limitations:** ${evidence.limitations.join(" ")}`);
  lines.push("\n### Evidence references\n- market.overview\n- asset.intelligence\n- portfolio.paper\n- risk.protection\n- paper.decisions\n- risk.events\n- paper.monitoring.states\n- paper.monitoring.events\n- strategy.runs\n- onchain.wallet");
  return lines.join("\n");
}
