import type { ExposureSnapshot } from "./types";

export interface ExposurePositionInput {
  symbol: string;
  quantity: number;
  marketValueUsd: number | null;
  costBasisUsd: number;
  plannedRiskUsd: number | null;
}

export interface ExposureInput {
  cashUsd: number;
  positions: ExposurePositionInput[];
  targetSymbol: string;
  projectedNotionalUsd: number;
}

export class ExposureCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExposureCalculationError";
  }
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(normalized)) throw new ExposureCalculationError("Target symbol is invalid.");
  return normalized;
}

export function calculateExposure(input: ExposureInput): ExposureSnapshot {
  if (!finiteNonNegative(input.cashUsd)) throw new ExposureCalculationError("Virtual cash must be finite and non-negative.");
  if (!finiteNonNegative(input.projectedNotionalUsd)) throw new ExposureCalculationError("Projected notional must be finite and non-negative.");
  const targetSymbol = normalizeSymbol(input.targetSymbol);
  const unavailableSymbols: string[] = [];
  let totalExposureUsd = 0;
  let assetExposureUsd = 0;
  let openPlannedRiskUsd = 0;
  let positionCount = 0;

  for (const position of input.positions) {
    const symbol = normalizeSymbol(position.symbol);
    if (!finiteNonNegative(position.quantity) || !finiteNonNegative(position.costBasisUsd)) {
      throw new ExposureCalculationError(`Position values for ${symbol} must be finite and non-negative.`);
    }
    if (position.quantity <= 0) continue;
    positionCount += 1;

    const marketValueAvailable = position.marketValueUsd !== null && finiteNonNegative(position.marketValueUsd);
    const exposureValue = marketValueAvailable ? position.marketValueUsd! : position.costBasisUsd;
    if (!marketValueAvailable) unavailableSymbols.push(symbol);
    totalExposureUsd += exposureValue;
    if (symbol === targetSymbol) assetExposureUsd += exposureValue;

    if (position.plannedRiskUsd !== null) {
      if (!finiteNonNegative(position.plannedRiskUsd)) throw new ExposureCalculationError(`Planned risk for ${symbol} must be finite and non-negative.`);
      openPlannedRiskUsd += position.plannedRiskUsd;
    }
  }

  const equityUsd = input.cashUsd + totalExposureUsd;
  if (!Number.isFinite(equityUsd) || equityUsd <= 0) throw new ExposureCalculationError("Portfolio equity must be greater than zero.");
  const projectedTotalExposureUsd = totalExposureUsd + input.projectedNotionalUsd;
  const projectedAssetExposureUsd = assetExposureUsd + input.projectedNotionalUsd;

  return {
    equityUsd,
    cashUsd: input.cashUsd,
    positionCount,
    totalExposureUsd,
    totalExposurePercent: (totalExposureUsd / equityUsd) * 100,
    assetExposureUsd,
    assetExposurePercent: (assetExposureUsd / equityUsd) * 100,
    openPlannedRiskUsd,
    projectedTotalExposureUsd,
    projectedTotalExposurePercent: (projectedTotalExposureUsd / equityUsd) * 100,
    projectedAssetExposureUsd,
    projectedAssetExposurePercent: (projectedAssetExposureUsd / equityUsd) * 100,
    dataComplete: unavailableSymbols.length === 0,
    unavailableSymbols: Array.from(new Set(unavailableSymbols)),
  };
}
