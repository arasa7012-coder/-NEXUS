import { getDb } from "../db";
import { portfolioSnapshots, portfolioAssets, cryptocurrencies } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface PortfolioPerformance {
  totalValue: number;
  totalCost: number;
  totalProfit: number;
  profitPercentage: number;
  bestAsset: { symbol: string; profit: number };
  worstAsset: { symbol: string; profit: number };
  assetBreakdown: Array<{
    symbol: string;
    quantity: number;
    currentPrice: number;
    totalValue: number;
    costBasis: number;
    profit: number;
    profitPercent: number;
  }>;
}

export interface PortfolioSnapshot {
  date: Date;
  totalValue: number;
  totalProfit: number;
  profitPercentage: number;
}

// Calculate current portfolio performance
export async function calculatePortfolioPerformance(
  portfolioId: number,
  currentPrices: Record<string, number>
): Promise<PortfolioPerformance> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get portfolio assets with crypto symbols
  const assets = await db
    .select({
      id: portfolioAssets.id,
      quantity: portfolioAssets.quantity,
      purchasePrice: portfolioAssets.purchasePrice,
      symbol: cryptocurrencies.symbol,
    })
    .from(portfolioAssets)
    .innerJoin(cryptocurrencies, eq(portfolioAssets.cryptoId, cryptocurrencies.id))
    .where(eq(portfolioAssets.portfolioId, portfolioId));

  let totalValue = 0;
  let totalCost = 0;
  const assetBreakdown = [];
  let bestAsset = { symbol: "", profit: -Infinity };
  let worstAsset = { symbol: "", profit: Infinity };

  for (const asset of assets) {
    const currentPrice = currentPrices[asset.symbol] || 0;
    const quantity = parseFloat(asset.quantity);
    const costPerUnit = parseFloat(asset.purchasePrice);

    const assetValue = quantity * currentPrice;
    const assetCost = quantity * costPerUnit;
    const assetProfit = assetValue - assetCost;
    const assetProfitPercent = assetCost > 0 ? (assetProfit / assetCost) * 100 : 0;

    totalValue += assetValue;
    totalCost += assetCost;

    assetBreakdown.push({
      symbol: asset.symbol,
      quantity,
      currentPrice,
      totalValue: assetValue,
      costBasis: assetCost,
      profit: assetProfit,
      profitPercent: assetProfitPercent,
    });

    // Track best and worst performing assets
    if (assetProfit > bestAsset.profit) {
      bestAsset = { symbol: asset.symbol, profit: assetProfit };
    }
    if (assetProfit < worstAsset.profit) {
      worstAsset = { symbol: asset.symbol, profit: assetProfit };
    }
  }

  const totalProfit = totalValue - totalCost;
  const profitPercentage = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  return {
    totalValue,
    totalCost,
    totalProfit,
    profitPercentage,
    bestAsset: bestAsset.symbol ? bestAsset : { symbol: "N/A", profit: 0 },
    worstAsset: worstAsset.symbol ? worstAsset : { symbol: "N/A", profit: 0 },
    assetBreakdown: assetBreakdown.sort((a, b) => b.totalValue - a.totalValue),
  };
}

// Create a portfolio snapshot (for historical tracking)
export async function createPortfolioSnapshot(
  portfolioId: number,
  performance: PortfolioPerformance
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(portfolioSnapshots).values({
    portfolioId,
    totalValue: performance.totalValue.toString(),
    totalCost: performance.totalCost.toString(),
    totalProfit: performance.totalProfit.toString(),
    profitPercentage: performance.profitPercentage.toString(),
    snapshotDate: new Date(),
  });

  return result;
}

// Get portfolio performance history
export async function getPortfolioHistory(
  portfolioId: number,
  days = 30
): Promise<PortfolioSnapshot[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const snapshots = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.portfolioId, portfolioId));

  return snapshots
    .filter((s) => new Date(s.snapshotDate) >= startDate)
    .map((s) => ({
      date: new Date(s.snapshotDate),
      totalValue: parseFloat(s.totalValue),
      totalProfit: parseFloat(s.totalProfit),
      profitPercentage: parseFloat(s.profitPercentage),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Calculate portfolio allocation (pie chart data)
export async function getPortfolioAllocation(
  portfolioId: number,
  currentPrices: Record<string, number>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const assets = await db
    .select({
      symbol: cryptocurrencies.symbol,
      quantity: portfolioAssets.quantity,
    })
    .from(portfolioAssets)
    .innerJoin(cryptocurrencies, eq(portfolioAssets.cryptoId, cryptocurrencies.id))
    .where(eq(portfolioAssets.portfolioId, portfolioId));

  let totalValue = 0;
  const allocation = assets.map((asset) => {
    const quantity = parseFloat(asset.quantity);
    const currentPrice = currentPrices[asset.symbol] || 0;
    const value = quantity * currentPrice;
    totalValue += value;
    return { symbol: asset.symbol, value };
  });

  return allocation.map((item) => ({
    symbol: item.symbol,
    value: item.value,
    percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
  }));
}

// Get portfolio statistics
export async function getPortfolioStats(
  portfolioId: number,
  currentPrices: Record<string, number>
) {
  const performance = await calculatePortfolioPerformance(portfolioId, currentPrices);
  const history = await getPortfolioHistory(portfolioId, 30);
  const allocation = await getPortfolioAllocation(portfolioId, currentPrices);

  // Calculate daily changes
  const dailyChanges = [];
  for (let i = 1; i < history.length; i++) {
    const prevDay = history[i - 1];
    const currDay = history[i];
    dailyChanges.push({
      date: currDay.date,
      change: currDay.totalValue - prevDay.totalValue,
      changePercent: ((currDay.totalValue - prevDay.totalValue) / prevDay.totalValue) * 100,
    });
  }

  // Calculate statistics
  const maxValue = Math.max(...history.map((h) => h.totalValue), performance.totalValue);
  const minValue = Math.min(...history.map((h) => h.totalValue), performance.totalValue);
  const avgDailyChange =
    dailyChanges.length > 0
      ? dailyChanges.reduce((sum, d) => sum + d.change, 0) / dailyChanges.length
      : 0;

  return {
    performance,
    history,
    allocation,
    dailyChanges,
    stats: {
      maxValue,
      minValue,
      avgDailyChange,
      volatility: calculateVolatility(dailyChanges),
      daysTracked: history.length,
    },
  };
}

// Helper function to calculate volatility
function calculateVolatility(dailyChanges: Array<{ change: number; changePercent: number }>) {
  if (dailyChanges.length === 0) return 0;

  const avgChange = dailyChanges.reduce((sum, d) => sum + d.changePercent, 0) / dailyChanges.length;
  const variance =
    dailyChanges.reduce((sum, d) => sum + Math.pow(d.changePercent - avgChange, 2), 0) /
    dailyChanges.length;

  return Math.sqrt(variance);
}
