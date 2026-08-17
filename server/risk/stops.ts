import type { RiskStopMethod, StopEvidence } from "./types";

export class StopCalculationError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_STOP",
    message: string,
  ) {
    super(message);
    this.name = "StopCalculationError";
  }
}

export interface StopCalculationInput {
  method: RiskStopMethod;
  entryPriceUsd: number;
  fixedStopPercent: number;
  atrUsd: number | null;
  atrMultiplier: number;
  confirmedSupportUsd: number | null;
  structureBufferBps: number;
  timeframe: string | null;
  source: string;
  providerUpdatedAt: number | null;
}

function finitePositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function requireFinitePositive(value: number, label: string): void {
  if (!finitePositive(value)) throw new StopCalculationError("INVALID_INPUT", `${label} must be a finite value greater than zero.`);
}

function buildEvidence(input: StopCalculationInput, stopPriceUsd: number, explanation: string): StopEvidence {
  if (!finitePositive(stopPriceUsd) || stopPriceUsd >= input.entryPriceUsd) {
    throw new StopCalculationError("INVALID_STOP", "The selected method must produce a positive long-position stop below entry.");
  }
  const distanceUsd = input.entryPriceUsd - stopPriceUsd;
  return {
    method: input.method,
    entryPriceUsd: input.entryPriceUsd,
    stopPriceUsd,
    distanceUsd,
    distancePercent: (distanceUsd / input.entryPriceUsd) * 100,
    timeframe: input.timeframe,
    source: input.source,
    providerUpdatedAt: input.providerUpdatedAt,
    explanation,
  };
}

export function calculateStop(input: StopCalculationInput): StopEvidence {
  requireFinitePositive(input.entryPriceUsd, "Entry price");
  if (!Number.isInteger(input.structureBufferBps) || input.structureBufferBps < 0 || input.structureBufferBps > 100) {
    throw new StopCalculationError("INVALID_INPUT", "Structure buffer must be a whole number from 0 to 100 basis points.");
  }

  if (input.method === "fixed") {
    requireFinitePositive(input.fixedStopPercent, "Fixed stop percentage");
    const stopPriceUsd = input.entryPriceUsd * (1 - input.fixedStopPercent / 100);
    return buildEvidence(
      input,
      stopPriceUsd,
      `Fixed stop is ${input.fixedStopPercent.toFixed(2)}% below the planned entry. This is a paper-trade boundary, not a guaranteed loss cap.`,
    );
  }

  if (input.method === "atr") {
    if (!finitePositive(input.atrUsd)) throw new StopCalculationError("UNAVAILABLE", "A positive, fresh ATR value is required for ATR-based stop placement.");
    requireFinitePositive(input.atrMultiplier, "ATR multiplier");
    const stopPriceUsd = input.entryPriceUsd - input.atrUsd * input.atrMultiplier;
    return buildEvidence(
      input,
      stopPriceUsd,
      `ATR stop is ${input.atrMultiplier.toFixed(2)}× the current ${input.timeframe ?? "primary"} ATR below entry.`,
    );
  }

  if (!finitePositive(input.confirmedSupportUsd)) {
    throw new StopCalculationError("UNAVAILABLE", "A confirmed support level below entry is required for market-structure stop placement.");
  }
  if (input.confirmedSupportUsd >= input.entryPriceUsd) {
    throw new StopCalculationError("INVALID_STOP", "Confirmed support must be below the planned long entry.");
  }
  const bufferRate = input.structureBufferBps / 10_000;
  const stopPriceUsd = input.confirmedSupportUsd * (1 - bufferRate);
  return buildEvidence(
    input,
    stopPriceUsd,
    `Structure stop is below confirmed support at ${input.confirmedSupportUsd.toFixed(8)} with a ${input.structureBufferBps} bps buffer.`,
  );
}
