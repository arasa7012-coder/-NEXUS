import type {
  AnalysisCandle,
  AnalysisMetadata,
  DataQualityState,
  IntelligenceSource,
  TimestampOrigin,
} from "./types.ts";

export interface CandleInput {
  openTime: unknown;
  closeTime: unknown;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
  quoteVolumeUsd?: unknown;
  tradeCount?: unknown;
}

export interface RejectedCandle {
  index: number;
  reason: string;
}

export interface NormalizedCandles {
  candles: AnalysisCandle[];
  rejected: RejectedCandle[];
  inputCount: number;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateCandle(input: CandleInput): { candle: AnalysisCandle | null; reason: string | null } {
  const openTime = finiteNumber(input.openTime);
  const closeTime = finiteNumber(input.closeTime);
  const open = finiteNumber(input.open);
  const high = finiteNumber(input.high);
  const low = finiteNumber(input.low);
  const close = finiteNumber(input.close);
  const volume = finiteNumber(input.volume);
  const quoteVolumeUsd = finiteNumber(input.quoteVolumeUsd ?? 0);
  const tradeCount = finiteNumber(input.tradeCount ?? 0);

  if ([openTime, closeTime, open, high, low, close, volume, quoteVolumeUsd, tradeCount].some((value) => value === null)) {
    return { candle: null, reason: "Candle contains a non-finite numeric field." };
  }

  if (openTime! < 0 || closeTime! <= openTime!) {
    return { candle: null, reason: "Candle timestamps are invalid." };
  }

  if (open! <= 0 || high! <= 0 || low! <= 0 || close! <= 0) {
    return { candle: null, reason: "OHLC values must be positive." };
  }

  if (volume! < 0 || quoteVolumeUsd! < 0 || tradeCount! < 0) {
    return { candle: null, reason: "Volume and trade-count fields cannot be negative." };
  }

  if (high! < Math.max(open!, close!, low!) || low! > Math.min(open!, close!, high!)) {
    return { candle: null, reason: "High/low values are inconsistent with the candle body." };
  }

  return {
    candle: {
      openTime: openTime!,
      closeTime: closeTime!,
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: volume!,
      quoteVolumeUsd: quoteVolumeUsd!,
      tradeCount: Math.floor(tradeCount!),
    },
    reason: null,
  };
}

export function normalizeCandles(inputs: CandleInput[]): NormalizedCandles {
  const rejected: RejectedCandle[] = [];
  const candidates: Array<{ candle: AnalysisCandle; index: number }> = [];

  inputs.forEach((input, index) => {
    const result = validateCandle(input);
    if (!result.candle) {
      rejected.push({ index, reason: result.reason ?? "Candle is invalid." });
      return;
    }
    candidates.push({ candle: result.candle, index });
  });

  candidates.sort((left, right) => left.candle.openTime - right.candle.openTime || left.index - right.index);
  const seenOpenTimes = new Set<number>();
  const candles: AnalysisCandle[] = [];

  for (const candidate of candidates) {
    if (seenOpenTimes.has(candidate.candle.openTime)) {
      rejected.push({ index: candidate.index, reason: "Duplicate candle open time." });
      continue;
    }
    seenOpenTimes.add(candidate.candle.openTime);
    candles.push(candidate.candle);
  }

  rejected.sort((left, right) => left.index - right.index);
  return { candles, rejected, inputCount: inputs.length };
}

export function deriveDataQuality(input: {
  hasError?: boolean | undefined;
  isStale: boolean;
  sampleCount: number;
  minimumSamples: number;
}): DataQualityState {
  if (input.hasError) return "ERROR";
  if (input.sampleCount < input.minimumSamples) return "UNAVAILABLE";
  return input.isStale ? "STALE" : "LIVE";
}

export function buildAnalysisMetadata(input: {
  source: IntelligenceSource;
  providerUpdatedAt?: number | null;
  providerTimestampOrigin?: TimestampOrigin | null;
  cachedAt: number;
  sampleCount: number;
  isStale: boolean;
  minimumSamples: number;
  // `| undefined` is explicit: under exactOptionalPropertyTypes a bare `?`
  // forbids an explicitly-passed undefined, which callers legitimately do
  // when forwarding an optional field through.
  unavailableReasons?: string[] | undefined;
  hasError?: boolean | undefined;
}): AnalysisMetadata {
  const reasons = [...(input.unavailableReasons ?? [])];
  if (input.sampleCount < input.minimumSamples) {
    reasons.push(`Requires at least ${input.minimumSamples} valid samples; received ${input.sampleCount}.`);
  }

  const quality = deriveDataQuality({
    hasError: input.hasError,
    isStale: input.isStale,
    sampleCount: input.sampleCount,
    minimumSamples: input.minimumSamples,
  });

  return {
    quality,
    source: input.source,
    providerUpdatedAt: input.providerUpdatedAt ?? null,
    providerTimestampOrigin: input.providerTimestampOrigin ?? null,
    cachedAt: input.cachedAt,
    sampleCount: input.sampleCount,
    isStale: input.isStale,
    unavailableReasons: Array.from(new Set(reasons)),
  };
}
