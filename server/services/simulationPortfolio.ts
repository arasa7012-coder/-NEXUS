import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  simulationPortfolios,
  simulationPositions,
  simulationRiskSettings,
  simulationRiskEvents,
  simulationSafetyStates,
  simulationTradeDecisions,
  simulationTransactions,
} from "../../drizzle/schema";
import { getLiveQuote, type ExchangeSource } from "./marketData";
import { getAssetIntelligence, supportedIntelligenceAssets } from "./marketIntelligence";
import { buildRiskPlan, dailySnapshotFromStored } from "../risk/plan";
import { calculateExposure } from "../risk/exposure";
import { DEFAULT_RISK_SETTINGS } from "../risk/settings";
import type { IntelligenceRiskContext, RiskSettings, RiskStopMethod, TradePlanPreview } from "../risk/types";
import { evaluatePositionRisk } from "../risk/monitor";

const STARTING_VIRTUAL_CASH_USD = 100_000;
const MAX_SIMULATION_POSITIONS = 20;
const MAX_SIMULATION_TRANSACTIONS = 100;
const EPSILON = 1e-12;

export type SimulationSide = "buy" | "sell";
export type SimulationOrderType = "market" | "limit" | "stop";

export class SimulationPortfolioError extends Error {
  constructor(public readonly code: "INVALID_ORDER" | "INSUFFICIENT_CASH" | "INSUFFICIENT_ASSET" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "SimulationPortfolioError";
  }
}

export interface SimulationOrderInput {
  userId: number;
  symbol: string;
  side: SimulationSide;
  orderType: SimulationOrderType;
  quantity: number;
  requestKey?: string;
  stopMethod?: RiskStopMethod;
  targetPriceOverrideUsd?: number | null;
  triggerPriceUsd?: number | null;
}

export interface SimulationPositionMath {
  quantity: number;
  averageCostUsd: number;
}

export interface SimulationOrderMathResult {
  notionalUsd: number;
  nextCashBalanceUsd: number;
  nextPosition: SimulationPositionMath | null;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value: number): string {
  return Math.max(0, value).toFixed(2);
}

function toQuantity(value: number): string {
  return Math.max(0, value).toFixed(12);
}

function toPrice(value: number): string {
  return Math.max(0, value).toFixed(8);
}

function insertIdFrom(result: unknown): number | null {
  const candidate = Array.isArray(result) ? result[0] : result;
  const value = candidate && typeof candidate === "object" && "insertId" in candidate
    ? Number((candidate as { insertId?: unknown }).insertId)
    : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function dateToEpoch(value: Date | null): number | null {
  return value ? value.getTime() : null;
}

function storedSettingsToRiskSettings(row: typeof simulationRiskSettings.$inferSelect | undefined): RiskSettings {
  if (!row) return { ...DEFAULT_RISK_SETTINGS };
  return {
    riskPerTradePercent: toFiniteNumber(row.riskPerTradePercent),
    maxDailyLossPercent: toFiniteNumber(row.maxDailyLossPercent),
    maxDailyDrawdownPercent: toFiniteNumber(row.maxDailyDrawdownPercent),
    maxOpenPositions: row.maxOpenPositions,
    maxPortfolioExposurePercent: toFiniteNumber(row.maxPortfolioExposurePercent),
    maxAssetExposurePercent: toFiniteNumber(row.maxAssetExposurePercent),
    stopMethod: row.stopMethod,
    fixedStopPercent: toFiniteNumber(row.fixedStopPercent),
    atrMultiplier: toFiniteNumber(row.atrMultiplier),
    structureBufferBps: row.structureBufferBps,
    minimumRewardRisk: toFiniteNumber(row.minimumRewardRisk),
    consecutiveLossLimit: row.consecutiveLossLimit,
    cooldownMinutes: row.cooldownMinutes,
    feeBps: row.feeBps,
    slippageBps: row.slippageBps,
    blockHighVolatility: row.blockHighVolatility === 1,
  };
}

async function intelligenceContextForSymbol(symbol: string): Promise<IntelligenceRiskContext> {
  const asset = supportedIntelligenceAssets.find((item) => item.symbol === symbol);
  const unavailable = (reason: string): IntelligenceRiskContext => ({
    assetId: asset?.id ?? symbol.toLowerCase(),
    symbol,
    primaryTimeframe: null,
    dataQuality: "UNAVAILABLE",
    source: "unavailable",
    providerUpdatedAt: null,
    generatedAt: Date.now(),
    opportunityScore: null,
    intelligenceRiskScore: null,
    signalStrength: null,
    regime: null,
    atrUsd: null,
    confirmedSupportUsd: null,
    timeframeConflict: false,
  });
  if (!asset) return unavailable("The selected asset is outside the bounded intelligence universe.");
  try {
    const analysis = await getAssetIntelligence({ assetId: asset.id, preferredTimeframe: "4h" });
    const primary = analysis.primaryTimeframe
      ? analysis.timeframes.find((frame) => frame.timeframe === analysis.primaryTimeframe) ?? null
      : null;
    if (!primary) return unavailable("A primary intelligence timeframe is unavailable.");
    const supports = primary.structure.status === "AVAILABLE"
      ? primary.structure.value.support.map((level) => level.price).filter((price) => Number.isFinite(price))
      : [];
    return {
      assetId: asset.id,
      symbol,
      primaryTimeframe: primary.timeframe,
      dataQuality: primary.metadata.quality,
      source: primary.metadata.source,
      providerUpdatedAt: primary.metadata.providerUpdatedAt,
      generatedAt: analysis.generatedAt,
      opportunityScore: analysis.opportunityScore.value,
      intelligenceRiskScore: analysis.riskScore.value,
      signalStrength: analysis.signalStrength.value,
      regime: analysis.regime.value?.regime ?? null,
      atrUsd: primary.indicators.atr14.status === "AVAILABLE" ? primary.indicators.atr14.value.value : null,
      confirmedSupportUsd: supports.length ? Math.max(...supports) : null,
      timeframeConflict: analysis.multiTimeframe.status === "AVAILABLE" && analysis.multiTimeframe.value.alignment === "TREND_CONFLICT",
    };
  } catch {
    return unavailable("Public market intelligence is unavailable.");
  }
}

function decisionValues(plan: TradePlanPreview, portfolioId: number, userId: number) {
  const sizing = plan.sizing;
  return {
    requestKey: plan.request.requestKey,
    userId,
    simulationPortfolioId: portfolioId,
    symbol: plan.request.symbol,
    side: plan.request.side,
    orderType: plan.request.orderType,
    entryPriceUsd: toPrice(plan.referencePriceUsd),
    stopMethod: plan.request.stopMethod,
    stopPriceUsd: toPrice(plan.stop?.stopPriceUsd ?? plan.referencePriceUsd),
    targetPriceUsd: toPrice(plan.rewardRisk?.targetPriceUsd ?? plan.referencePriceUsd),
    quantity: toQuantity(sizing?.approvedQuantity ?? plan.request.requestedQuantity),
    notionalUsd: toMoney(sizing?.notionalUsd ?? plan.request.requestedQuantity * plan.referencePriceUsd),
    estimatedFeesUsd: toMoney(sizing?.estimatedFeesUsd ?? 0),
    plannedRiskUsd: toMoney(sizing?.plannedLossUsd ?? 0),
    plannedRiskPercent: (sizing?.plannedRiskPercent ?? 0).toFixed(4),
    rewardRiskRatio: (plan.rewardRisk?.rewardRiskRatio ?? 0).toFixed(4),
    riskLevel: plan.riskLevel.level ?? "EXTREME",
    intelligenceOpportunityScore: plan.intelligence.opportunityScore?.toFixed(2) ?? null,
    intelligenceRiskScore: plan.intelligence.intelligenceRiskScore?.toFixed(2) ?? null,
    intelligenceSignalStrength: plan.intelligence.signalStrength?.toFixed(2) ?? null,
    marketRegime: plan.intelligence.regime,
    dataQuality: plan.intelligence.dataQuality,
    dataSource: plan.intelligence.source,
    providerUpdatedAt: plan.intelligence.providerUpdatedAt === null ? null : new Date(plan.intelligence.providerUpdatedAt),
    decision: plan.gate.decision,
    checkResultsJson: JSON.stringify(plan.gate.checks),
    reasonsJson: JSON.stringify(plan.gate.reasons),
    rejectionReason: plan.gate.primaryReason,
    planExpiresAt: new Date(plan.expiresAt),
  };
}

export function normalizeSimulationSymbol(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(normalized)) {
    throw new SimulationPortfolioError("INVALID_ORDER", "Choose a supported asset symbol for the simulation.");
  }
  return normalized;
}

export function calculateSimulationOrder(input: {
  side: SimulationSide;
  quantity: number;
  priceUsd: number;
  cashBalanceUsd: number;
  currentPosition: SimulationPositionMath | null;
}): SimulationOrderMathResult {
  const { side, quantity, priceUsd, cashBalanceUsd, currentPosition } = input;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new SimulationPortfolioError("INVALID_ORDER", "Enter a simulation amount greater than zero.");
  }
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new SimulationPortfolioError("UNAVAILABLE", "A valid live reference price is required before confirming a simulation.");
  }

  const notionalUsd = quantity * priceUsd;
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    throw new SimulationPortfolioError("INVALID_ORDER", "This simulation amount cannot be valued safely.");
  }

  if (side === "buy") {
    if (notionalUsd > cashBalanceUsd + 0.000001) {
      throw new SimulationPortfolioError("INSUFFICIENT_CASH", "This simulated purchase exceeds the available virtual cash balance.");
    }
    const currentQuantity = currentPosition?.quantity ?? 0;
    const currentCost = currentPosition?.averageCostUsd ?? 0;
    const nextQuantity = currentQuantity + quantity;
    return {
      notionalUsd,
      nextCashBalanceUsd: cashBalanceUsd - notionalUsd,
      nextPosition: {
        quantity: nextQuantity,
        averageCostUsd: ((currentQuantity * currentCost) + notionalUsd) / nextQuantity,
      },
    };
  }

  if (!currentPosition || quantity > currentPosition.quantity + EPSILON) {
    throw new SimulationPortfolioError("INSUFFICIENT_ASSET", "This simulated sale exceeds the virtual asset balance.");
  }

  const nextQuantity = currentPosition.quantity - quantity;
  return {
    notionalUsd,
    nextCashBalanceUsd: cashBalanceUsd + notionalUsd,
    nextPosition: nextQuantity <= EPSILON
      ? null
      : { quantity: nextQuantity, averageCostUsd: currentPosition.averageCostUsd },
  };
}

async function getOrCreateSimulationPortfolio(userId: number) {
  const db = await getDb();
  if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation storage is temporarily unavailable.");

  const existing = await db.select().from(simulationPortfolios).where(eq(simulationPortfolios.userId, userId)).limit(1);
  if (existing[0]) return existing[0];

  try {
    await db.insert(simulationPortfolios).values({
      userId,
      name: "Simulation Portfolio",
      quoteCurrency: "USD",
      initialCashUsd: toMoney(STARTING_VIRTUAL_CASH_USD),
      cashBalanceUsd: toMoney(STARTING_VIRTUAL_CASH_USD),
    });
  } catch {
    // A concurrent first request can satisfy the unique user constraint; re-read below.
  }

  const created = await db.select().from(simulationPortfolios).where(eq(simulationPortfolios.userId, userId)).limit(1);
  if (!created[0]) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation storage could not be initialized.");
  return created[0];
}

export async function recordSimulationOrder(input: SimulationOrderInput) {
  const symbol = normalizeSimulationSymbol(input.symbol);
  const quoteResult = await getLiveQuote(symbol);
  if (quoteResult.isStale) {
    throw new SimulationPortfolioError("UNAVAILABLE", "A fresh live reference price is required before confirming a simulation. Cached prices can still value existing positions, but cannot create a new simulated trade.");
  }
  const referencePriceUsd = quoteResult.quote.priceUsd;
  const marketSource = quoteResult.quote.source;
  const db = await getDb();
  if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation storage is temporarily unavailable.");

  const portfolio = await getOrCreateSimulationPortfolio(input.userId);
  const now = Date.now();
  const [positions, settingsRows, safetyRows, realizedTransactions, intelligence] = await Promise.all([
    db.select().from(simulationPositions).where(eq(simulationPositions.simulationPortfolioId, portfolio.id)).limit(MAX_SIMULATION_POSITIONS),
    db.select().from(simulationRiskSettings).where(eq(simulationRiskSettings.userId, input.userId)).limit(1),
    db.select().from(simulationSafetyStates).where(eq(simulationSafetyStates.userId, input.userId)).limit(1),
    db.select().from(simulationTransactions).where(eq(simulationTransactions.simulationPortfolioId, portfolio.id)).limit(MAX_SIMULATION_TRANSACTIONS),
    intelligenceContextForSymbol(symbol),
  ]);
  const cashBalanceUsd = toFiniteNumber(portfolio.cashBalanceUsd);
  const pricing = await Promise.all(positions.map(async (position) => {
    const quantity = toFiniteNumber(position.quantity);
    const costBasisUsd = quantity * toFiniteNumber(position.averageCostUsd);
    if (position.symbol === symbol) {
      return { symbol: position.symbol, quantity, costBasisUsd, marketValueUsd: quantity * referencePriceUsd, plannedRiskUsd: null };
    }
    try {
      const current = await getLiveQuote(position.symbol);
      return {
        symbol: position.symbol,
        quantity,
        costBasisUsd,
        marketValueUsd: current.isStale ? null : quantity * current.quote.priceUsd,
        plannedRiskUsd: null,
      };
    } catch {
      return { symbol: position.symbol, quantity, costBasisUsd, marketValueUsd: null, plannedRiskUsd: null };
    }
  }));
  const currentEquityUsd = cashBalanceUsd + pricing.reduce((sum, position) => sum + (position.marketValueUsd ?? position.costBasisUsd), 0);
  const safety = safetyRows[0];
  if (!safety) {
    try {
      await db.insert(simulationSafetyStates).values({
        userId: input.userId,
        riskDayUtc: new Date(now).toISOString().slice(0, 10),
        dayStartEquityUsd: toMoney(currentEquityUsd),
        dayPeakEquityUsd: toMoney(currentEquityUsd),
      });
    } catch {
      // Concurrent initialization is handled by the re-read below.
    }
  }
  const safetyState = safety ?? (await db.select().from(simulationSafetyStates).where(eq(simulationSafetyStates.userId, input.userId)).limit(1))[0];
  if (!safetyState) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation safety state could not be initialized.");
  const dailyProtection = dailySnapshotFromStored({
    now,
    storedRiskDayUtc: safetyState.riskDayUtc,
    storedDayStartEquityUsd: toFiniteNumber(safetyState.dayStartEquityUsd),
    storedDayPeakEquityUsd: toFiniteNumber(safetyState.dayPeakEquityUsd),
    currentEquityUsd,
    realizedEvents: realizedTransactions.flatMap((transaction) => transaction.realizedPnlUsd === null ? [] : [{
      realizedPnlUsd: toFiniteNumber(transaction.realizedPnlUsd),
      occurredAt: transaction.executedAt.getTime(),
    }]),
    consecutiveLosses: Math.max(0, Math.floor(toFiniteNumber(safetyState.consecutiveLosses))),
    cooldownUntil: dateToEpoch(safetyState.cooldownUntil),
    emergencyStopActive: safetyState.emergencyStopActive === 1,
    emergencyStopReason: safetyState.emergencyStopReason,
  });
  const settings = storedSettingsToRiskSettings(settingsRows[0]);
  const requestKey = input.requestKey?.trim() || `${now}-${input.userId}-${symbol}-${input.side}`;
  if (requestKey.length > 64) throw new SimulationPortfolioError("INVALID_ORDER", "The paper-plan request key must be 64 characters or fewer.");
  const plan = buildRiskPlan({
    now,
    expiresInMs: 60_000,
    request: {
      requestKey,
      symbol,
      side: input.side,
      orderType: input.orderType,
      requestedQuantity: input.quantity,
      triggerPriceUsd: input.triggerPriceUsd ?? null,
      stopMethod: input.stopMethod ?? settings.stopMethod,
      stopPriceOverrideUsd: null,
      targetPriceOverrideUsd: input.targetPriceOverrideUsd ?? null,
    },
    settings,
    cashUsd: cashBalanceUsd,
    positions: pricing,
    dailyProtection,
    intelligence,
    referencePriceUsd,
  });
  let decisionId: number | null;
  try {
    decisionId = insertIdFrom(await db.insert(simulationTradeDecisions).values(decisionValues(plan, portfolio.id, input.userId)));
  } catch {
    throw new SimulationPortfolioError("INVALID_ORDER", "This paper-plan request has already been recorded. Create a fresh preview before trying again.");
  }
  if (decisionId === null) throw new SimulationPortfolioError("UNAVAILABLE", "The paper-trade decision could not be identified after persistence.");
  if (plan.gate.decision === "REJECTED") {
    throw new SimulationPortfolioError("INVALID_ORDER", plan.gate.primaryReason ?? "This paper trade was rejected by the safety gate.");
  }

  return db.transaction(async (tx) => {
    const portfolioRows = await tx.select().from(simulationPortfolios).where(eq(simulationPortfolios.userId, input.userId)).limit(1);
    const portfolio = portfolioRows[0];
    if (!portfolio) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation storage could not be loaded.");

    const positionRows = await tx.select().from(simulationPositions)
      .where(eq(simulationPositions.simulationPortfolioId, portfolio.id))
      .limit(MAX_SIMULATION_POSITIONS);
    const existing = positionRows.find((position) => position.symbol === symbol) ?? null;
    const currentPosition = existing
      ? { quantity: toFiniteNumber(existing.quantity), averageCostUsd: toFiniteNumber(existing.averageCostUsd) }
      : null;
    const approvedQuantity = input.side === "buy" ? plan.sizing?.approvedQuantity : input.quantity;
    if (!approvedQuantity || approvedQuantity <= 0) {
      throw new SimulationPortfolioError("INVALID_ORDER", "No positive paper quantity was approved by the safety gate.");
    }
    const math = calculateSimulationOrder({
      side: input.side,
      quantity: approvedQuantity,
      priceUsd: referencePriceUsd,
      cashBalanceUsd: toFiniteNumber(portfolio.cashBalanceUsd),
      currentPosition,
    });

    if (input.side === "buy" && !existing && positionRows.length >= MAX_SIMULATION_POSITIONS) {
      throw new SimulationPortfolioError("INVALID_ORDER", "The simulation portfolio can hold up to 20 assets. Sell or consolidate an existing position first.");
    }

    if (math.nextPosition === null && existing) {
      await tx.delete(simulationPositions).where(eq(simulationPositions.id, existing.id));
    } else if (math.nextPosition && existing) {
      const positionUpdate = {
        quantity: toQuantity(math.nextPosition.quantity),
        averageCostUsd: toPrice(math.nextPosition.averageCostUsd),
        ...(input.side === "buy" ? {
          stopMethod: plan.request.stopMethod,
          stopPriceUsd: plan.stop ? toPrice(plan.stop.stopPriceUsd) : null,
          targetPriceUsd: plan.rewardRisk ? toPrice(plan.rewardRisk.targetPriceUsd) : null,
          plannedRiskUsd: toMoney(plan.sizing?.plannedLossUsd ?? 0),
          plannedRiskPercent: (plan.sizing?.plannedRiskPercent ?? 0).toFixed(4),
          riskLevel: plan.riskLevel.level,
          openingDecisionId: decisionId,
          intelligenceOpportunityScore: plan.intelligence.opportunityScore?.toFixed(2) ?? null,
          intelligenceRiskScore: plan.intelligence.intelligenceRiskScore?.toFixed(2) ?? null,
          intelligenceSignalStrength: plan.intelligence.signalStrength?.toFixed(2) ?? null,
          marketRegime: plan.intelligence.regime,
          dataQuality: plan.intelligence.dataQuality,
          dataSource: plan.intelligence.source,
          providerUpdatedAt: plan.intelligence.providerUpdatedAt === null ? null : new Date(plan.intelligence.providerUpdatedAt),
          protectionUpdatedAt: new Date(now),
        } : {}),
      };
      await tx.update(simulationPositions).set(positionUpdate).where(eq(simulationPositions.id, existing.id));
    } else if (math.nextPosition) {
      await tx.insert(simulationPositions).values({
        simulationPortfolioId: portfolio.id,
        symbol,
        quantity: toQuantity(math.nextPosition.quantity),
        averageCostUsd: toPrice(math.nextPosition.averageCostUsd),
        stopMethod: plan.request.stopMethod,
        stopPriceUsd: plan.stop ? toPrice(plan.stop.stopPriceUsd) : null,
        targetPriceUsd: plan.rewardRisk ? toPrice(plan.rewardRisk.targetPriceUsd) : null,
        plannedRiskUsd: toMoney(plan.sizing?.plannedLossUsd ?? 0),
        plannedRiskPercent: (plan.sizing?.plannedRiskPercent ?? 0).toFixed(4),
        riskLevel: plan.riskLevel.level,
        openingDecisionId: decisionId,
        intelligenceOpportunityScore: plan.intelligence.opportunityScore?.toFixed(2) ?? null,
        intelligenceRiskScore: plan.intelligence.intelligenceRiskScore?.toFixed(2) ?? null,
        intelligenceSignalStrength: plan.intelligence.signalStrength?.toFixed(2) ?? null,
        marketRegime: plan.intelligence.regime,
        dataQuality: plan.intelligence.dataQuality,
        dataSource: plan.intelligence.source,
        providerUpdatedAt: plan.intelligence.providerUpdatedAt === null ? null : new Date(plan.intelligence.providerUpdatedAt),
        protectionUpdatedAt: new Date(now),
      });
    }

    await tx.update(simulationPortfolios).set({ cashBalanceUsd: toMoney(math.nextCashBalanceUsd) })
      .where(eq(simulationPortfolios.id, portfolio.id));
    const transactionResult = await tx.insert(simulationTransactions).values({
      simulationPortfolioId: portfolio.id,
      symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: toQuantity(approvedQuantity),
      referencePriceUsd: toPrice(referencePriceUsd),
      notionalUsd: toMoney(math.notionalUsd),
      marketSource,
      decisionId,
      feeBps: settings.feeBps,
      slippageBps: settings.slippageBps,
      estimatedFeesUsd: toMoney(plan.sizing?.estimatedFeesUsd ?? 0),
    });
    const transactionId = insertIdFrom(transactionResult);
    if (transactionId === null) throw new SimulationPortfolioError("UNAVAILABLE", "The paper transaction could not be identified after persistence.");
    await tx.update(simulationTradeDecisions).set({ transactionId }).where(eq(simulationTradeDecisions.id, decisionId));

    return {
      simulation: true as const,
      portfolioId: portfolio.id,
      symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: approvedQuantity,
      referencePriceUsd,
      notionalUsd: math.notionalUsd,
      marketSource,
      providerUpdatedAt: quoteResult.quote.providerUpdatedAt,
      isStale: quoteResult.isStale,
      cashBalanceUsd: math.nextCashBalanceUsd,
      decisionId,
      plan,
    };
  });
}

export async function getSimulationPortfolioState(userId: number) {
  const db = await getDb();
  if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation storage is temporarily unavailable.");
  const portfolio = await getOrCreateSimulationPortfolio(userId);
  const [positions, transactions] = await Promise.all([
    db.select().from(simulationPositions).where(eq(simulationPositions.simulationPortfolioId, portfolio.id)).limit(MAX_SIMULATION_POSITIONS),
    db.select().from(simulationTransactions).where(eq(simulationTransactions.simulationPortfolioId, portfolio.id)).orderBy(desc(simulationTransactions.executedAt)).limit(MAX_SIMULATION_TRANSACTIONS),
  ]);

  const pricedPositions = await Promise.all(positions.map(async (position) => {
    const quantity = toFiniteNumber(position.quantity);
    const averageCostUsd = toFiniteNumber(position.averageCostUsd);
    try {
      const quoteResult = await getLiveQuote(position.symbol);
      const currentPriceUsd = quoteResult.quote.priceUsd;
      const marketValueUsd = quantity * currentPriceUsd;
      const costBasisUsd = quantity * averageCostUsd;
      return {
        symbol: position.symbol,
        quantity,
        averageCostUsd,
        currentPriceUsd,
        marketValueUsd,
        costBasisUsd,
        unrealizedPnlUsd: marketValueUsd - costBasisUsd,
        unrealizedPnlPercent: costBasisUsd > 0 ? ((marketValueUsd - costBasisUsd) / costBasisUsd) * 100 : 0,
        source: quoteResult.quote.source,
        providerUpdatedAt: quoteResult.quote.providerUpdatedAt,
        isStale: quoteResult.isStale,
        unavailable: false,
      };
    } catch {
      const costBasisUsd = quantity * averageCostUsd;
      return {
        symbol: position.symbol,
        quantity,
        averageCostUsd,
        currentPriceUsd: null,
        marketValueUsd: 0,
        costBasisUsd,
        unrealizedPnlUsd: 0,
        unrealizedPnlPercent: 0,
        source: null as ExchangeSource | null,
        providerUpdatedAt: null,
        isStale: true,
        unavailable: true,
      };
    }
  }));

  const cashBalanceUsd = toFiniteNumber(portfolio.cashBalanceUsd);
  const positionValueUsd = pricedPositions.reduce((total, position) => total + position.marketValueUsd, 0);
  const totalValueUsd = cashBalanceUsd + positionValueUsd;
  const totalCostBasisUsd = pricedPositions.reduce((total, position) => total + position.costBasisUsd, 0);
  const totalUnrealizedPnlUsd = pricedPositions.reduce((total, position) => total + position.unrealizedPnlUsd, 0);

  return {
    simulation: true as const,
    portfolio: {
      id: portfolio.id,
      name: portfolio.name,
      quoteCurrency: portfolio.quoteCurrency,
      initialCashUsd: toFiniteNumber(portfolio.initialCashUsd),
      cashBalanceUsd,
      cashAllocationPercent: totalValueUsd > 0 ? (cashBalanceUsd / totalValueUsd) * 100 : 0,
      totalValueUsd,
      totalCostBasisUsd,
      totalUnrealizedPnlUsd,
      totalUnrealizedPnlPercent: totalCostBasisUsd > 0 ? (totalUnrealizedPnlUsd / totalCostBasisUsd) * 100 : 0,
    },
    positions: pricedPositions.map((position) => ({
      ...position,
      allocationPercent: totalValueUsd > 0 ? (position.marketValueUsd / totalValueUsd) * 100 : 0,
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      symbol: transaction.symbol,
      side: transaction.side,
      orderType: transaction.orderType,
      quantity: toFiniteNumber(transaction.quantity),
      referencePriceUsd: toFiniteNumber(transaction.referencePriceUsd),
      notionalUsd: toFiniteNumber(transaction.notionalUsd),
      marketSource: transaction.marketSource,
      executedAt: transaction.executedAt,
    })),
    source: "server-valued-simulation" as const,
    isStale: pricedPositions.some((position) => position.isStale),
    unavailableSymbols: pricedPositions.filter((position) => position.unavailable).map((position) => position.symbol),
  };
}

/** Builds a read-only, session-scoped paper-trade plan. It does not persist a decision or change the virtual ledger. */
export async function previewSimulationOrder(input: SimulationOrderInput): Promise<TradePlanPreview> {
  const symbol = normalizeSimulationSymbol(input.symbol);
  const requestKey = input.requestKey?.trim();
  if (!requestKey || requestKey.length > 64) {
    throw new SimulationPortfolioError("INVALID_ORDER", "A paper-plan request key of 64 characters or fewer is required for preview.");
  }
  const [state, quoteResult, db] = await Promise.all([
    getSimulationPortfolioState(input.userId),
    getLiveQuote(symbol),
    getDb(),
  ]);
  if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation storage is temporarily unavailable.");
  const [settingsRows, safetyRows, transactions, intelligenceBase] = await Promise.all([
    db.select().from(simulationRiskSettings).where(eq(simulationRiskSettings.userId, input.userId)).limit(1),
    db.select().from(simulationSafetyStates).where(eq(simulationSafetyStates.userId, input.userId)).limit(1),
    db.select().from(simulationTransactions).where(eq(simulationTransactions.simulationPortfolioId, state.portfolio.id)).limit(MAX_SIMULATION_TRANSACTIONS),
    intelligenceContextForSymbol(symbol),
  ]);
  const now = Date.now();
  const safety = safetyRows[0];
  const dailyProtection = safety
    ? dailySnapshotFromStored({
      now,
      storedRiskDayUtc: safety.riskDayUtc,
      storedDayStartEquityUsd: toFiniteNumber(safety.dayStartEquityUsd),
      storedDayPeakEquityUsd: toFiniteNumber(safety.dayPeakEquityUsd),
      currentEquityUsd: state.portfolio.totalValueUsd,
      realizedEvents: transactions.flatMap((transaction) => transaction.realizedPnlUsd === null ? [] : [{
        realizedPnlUsd: toFiniteNumber(transaction.realizedPnlUsd),
        occurredAt: transaction.executedAt.getTime(),
      }]),
      consecutiveLosses: Math.max(0, Math.floor(toFiniteNumber(safety.consecutiveLosses))),
      cooldownUntil: dateToEpoch(safety.cooldownUntil),
      emergencyStopActive: safety.emergencyStopActive === 1,
      emergencyStopReason: safety.emergencyStopReason,
    })
    : dailySnapshotFromStored({
      now,
      storedRiskDayUtc: new Date(now).toISOString().slice(0, 10),
      storedDayStartEquityUsd: state.portfolio.totalValueUsd,
      storedDayPeakEquityUsd: state.portfolio.totalValueUsd,
      currentEquityUsd: state.portfolio.totalValueUsd,
      realizedEvents: [],
      consecutiveLosses: 0,
      cooldownUntil: null,
      emergencyStopActive: false,
      emergencyStopReason: null,
    });
  const intelligence = quoteResult.isStale
    ? { ...intelligenceBase, dataQuality: "STALE" as const }
    : intelligenceBase;
  const settings = storedSettingsToRiskSettings(settingsRows[0]);
  return buildRiskPlan({
    now,
    expiresInMs: 60_000,
    request: {
      requestKey,
      symbol,
      side: input.side,
      orderType: input.orderType,
      requestedQuantity: input.quantity,
      triggerPriceUsd: input.triggerPriceUsd ?? null,
      stopMethod: input.stopMethod ?? settings.stopMethod,
      stopPriceOverrideUsd: null,
      targetPriceOverrideUsd: input.targetPriceOverrideUsd ?? null,
    },
    settings,
    cashUsd: state.portfolio.cashBalanceUsd,
    positions: state.positions.map((position) => ({
      symbol: position.symbol,
      quantity: position.quantity,
      costBasisUsd: position.costBasisUsd,
      marketValueUsd: position.unavailable ? null : position.marketValueUsd,
      plannedRiskUsd: null,
    })),
    dailyProtection,
    intelligence,
    referencePriceUsd: quoteResult.quote.priceUsd,
  });
}

/** Evaluates open paper positions during an active session. It only records observations; it never places a trade. */
export async function monitorSimulationPositions(userId: number) {
  const db = await getDb();
  if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Simulation storage is temporarily unavailable.");
  const portfolio = await getOrCreateSimulationPortfolio(userId);
  const positions = await db.select().from(simulationPositions)
    .where(eq(simulationPositions.simulationPortfolioId, portfolio.id))
    .limit(MAX_SIMULATION_POSITIONS);
  const now = Date.now();
  const monitored = await Promise.all(positions.map(async (position) => {
    let quote: { priceUsd: number; source: string; providerUpdatedAt: number | null; isStale: boolean } | null = null;
    try {
      const result = await getLiveQuote(position.symbol);
      quote = {
        priceUsd: result.quote.priceUsd,
        source: result.quote.source,
        providerUpdatedAt: result.quote.providerUpdatedAt,
        isStale: result.isStale,
      };
    } catch {
      // The monitor turns absence into an explicit DATA_UNAVAILABLE observation below.
    }
    const intelligence = await intelligenceContextForSymbol(position.symbol);
    const result = evaluatePositionRisk({
      positionId: position.id,
      symbol: position.symbol,
      quantity: toFiniteNumber(position.quantity),
      averageCostUsd: toFiniteNumber(position.averageCostUsd),
      stopPriceUsd: position.stopPriceUsd === null ? null : toFiniteNumber(position.stopPriceUsd),
      targetPriceUsd: position.targetPriceUsd === null ? null : toFiniteNumber(position.targetPriceUsd),
      plannedRiskUsd: position.plannedRiskUsd === null ? null : toFiniteNumber(position.plannedRiskUsd),
      openingRegime: position.marketRegime,
      quote,
      intelligence,
      now,
    });
    await db.update(simulationPositions).set({
      monitorLastEvaluatedAt: new Date(now),
      monitorLastPriceUsd: result.currentPriceUsd === null ? null : toPrice(result.currentPriceUsd),
      monitorLastRegime: result.currentRegime,
    }).where(eq(simulationPositions.id, position.id));

    const eventType = result.protectionStatus === "STOP_OBSERVED" ? "STOP_OBSERVED"
      : result.protectionStatus === "TARGET_OBSERVED" ? "TARGET_OBSERVED"
        : result.protectionStatus === "DATA_UNAVAILABLE" ? "DATA_UNAVAILABLE"
          : null;
    const observationKey = `${eventType ?? "MONITORED"}:${position.id}:${result.providerUpdatedAt ?? now}`;
    if (eventType) {
      try {
        await db.insert(simulationRiskEvents).values({
          eventKey: observationKey,
          userId,
          simulationPortfolioId: portfolio.id,
          positionId: position.id,
          symbol: position.symbol,
          eventType,
          severity: eventType === "DATA_UNAVAILABLE" ? "WARNING" : "INFO",
          observedPriceUsd: result.currentPriceUsd === null ? null : toPrice(result.currentPriceUsd),
          dataSource: result.source,
          providerUpdatedAt: result.providerUpdatedAt === null ? null : new Date(result.providerUpdatedAt),
          detailsJson: JSON.stringify({ simulation: true, protectionStatus: result.protectionStatus, dataQuality: result.dataQuality }),
        });
      } catch {
        // The unique per-user event key makes repeated in-session observations idempotent.
      }
    }
    if (result.regimeChanged) {
      try {
        await db.insert(simulationRiskEvents).values({
          eventKey: `REGIME_CHANGED:${position.id}:${result.currentRegime ?? "unavailable"}:${result.providerUpdatedAt ?? now}`,
          userId,
          simulationPortfolioId: portfolio.id,
          positionId: position.id,
          symbol: position.symbol,
          eventType: "REGIME_CHANGED",
          severity: "WARNING",
          observedPriceUsd: result.currentPriceUsd === null ? null : toPrice(result.currentPriceUsd),
          dataSource: result.source,
          providerUpdatedAt: result.providerUpdatedAt === null ? null : new Date(result.providerUpdatedAt),
          detailsJson: JSON.stringify({ simulation: true, openingRegime: result.openingRegime, currentRegime: result.currentRegime }),
        });
      } catch {
        // Repeated observation of the same regime is intentionally idempotent.
      }
    }
    return result;
  }));
  return { simulation: true as const, evaluatedAt: now, positions: monitored };
}

/** Returns portfolio-level safety measurements for an active paper-trading session; no order is created or changed. */
export async function getSimulationPortfolioProtection(userId: number) {
  const [state, db] = await Promise.all([getSimulationPortfolioState(userId), getDb()]);
  if (!db) throw new SimulationPortfolioError("UNAVAILABLE", "Risk safety storage is temporarily unavailable.");
  const [settingsRows, safetyRows, transactions] = await Promise.all([
    db.select().from(simulationRiskSettings).where(eq(simulationRiskSettings.userId, userId)).limit(1),
    db.select().from(simulationSafetyStates).where(eq(simulationSafetyStates.userId, userId)).limit(1),
    db.select().from(simulationTransactions).where(eq(simulationTransactions.simulationPortfolioId, state.portfolio.id)).limit(MAX_SIMULATION_TRANSACTIONS),
  ]);
  const now = Date.now();
  const safety = safetyRows[0];
  const dailyProtection = safety
    ? dailySnapshotFromStored({
      now,
      storedRiskDayUtc: safety.riskDayUtc,
      storedDayStartEquityUsd: toFiniteNumber(safety.dayStartEquityUsd),
      storedDayPeakEquityUsd: toFiniteNumber(safety.dayPeakEquityUsd),
      currentEquityUsd: state.portfolio.totalValueUsd,
      realizedEvents: transactions.flatMap((transaction) => transaction.realizedPnlUsd === null ? [] : [{ realizedPnlUsd: toFiniteNumber(transaction.realizedPnlUsd), occurredAt: transaction.executedAt.getTime() }]),
      consecutiveLosses: Math.max(0, Math.floor(toFiniteNumber(safety.consecutiveLosses))),
      cooldownUntil: dateToEpoch(safety.cooldownUntil),
      emergencyStopActive: safety.emergencyStopActive === 1,
      emergencyStopReason: safety.emergencyStopReason,
    })
    : dailySnapshotFromStored({ now, storedRiskDayUtc: new Date(now).toISOString().slice(0, 10), storedDayStartEquityUsd: state.portfolio.totalValueUsd, storedDayPeakEquityUsd: state.portfolio.totalValueUsd, currentEquityUsd: state.portfolio.totalValueUsd, realizedEvents: [], consecutiveLosses: 0, cooldownUntil: null, emergencyStopActive: false, emergencyStopReason: null });
  const exposure = calculateExposure({
    cashUsd: state.portfolio.cashBalanceUsd,
    positions: state.positions.map((position) => ({
      symbol: position.symbol,
      quantity: position.quantity,
      marketValueUsd: position.unavailable ? null : position.marketValueUsd,
      costBasisUsd: position.costBasisUsd,
      plannedRiskUsd: null,
    })),
    targetSymbol: "BTC",
    projectedNotionalUsd: 0,
  });
  return { simulation: true as const, evaluatedAt: now, settings: storedSettingsToRiskSettings(settingsRows[0]), exposure, dailyProtection };
}
