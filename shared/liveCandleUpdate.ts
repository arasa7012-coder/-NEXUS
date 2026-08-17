export interface IncrementalOhlcvCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IncrementalCandleGap {
  afterOpenTime: number;
  beforeOpenTime: number;
  expectedOpenTime: number;
}

export interface IncrementalCandleMerge<T extends IncrementalOhlcvCandle> {
  candles: T[];
  gaps: IncrementalCandleGap[];
  conflict: string | null;
  changed: boolean;
  transition: "UNCHANGED" | "ACTIVE_REPLACED" | "APPENDED";
}

export function isFiniteIncrementalOhlcv(candle: IncrementalOhlcvCandle): boolean {
  return Number.isFinite(candle.openTime)
    && Number.isFinite(candle.closeTime)
    && Number.isFinite(candle.open)
    && Number.isFinite(candle.high)
    && Number.isFinite(candle.low)
    && Number.isFinite(candle.close)
    && Number.isFinite(candle.volume)
    && candle.closeTime >= candle.openTime
    && candle.low <= candle.open
    && candle.low <= candle.close
    && candle.high >= candle.open
    && candle.high >= candle.close
    && candle.volume >= 0;
}

function sameOhlcv(left: IncrementalOhlcvCandle, right: IncrementalOhlcvCandle): boolean {
  return left.openTime === right.openTime
    && left.closeTime === right.closeTime
    && left.open === right.open
    && left.high === right.high
    && left.low === right.low
    && left.close === right.close
    && left.volume === right.volume;
}

function gapsFor<T extends IncrementalOhlcvCandle>(candles: T[], expectedIntervalMs: number): IncrementalCandleGap[] {
  const gaps: IncrementalCandleGap[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1]!;
    const current = candles[index]!;
    const expectedOpenTime = previous.openTime + expectedIntervalMs;
    if (current.openTime !== expectedOpenTime) {
      gaps.push({ afterOpenTime: previous.openTime, beforeOpenTime: current.openTime, expectedOpenTime });
    }
  }
  return gaps;
}

/**
 * Merges verified updates from one provider. Historical candle mutations are rejected;
 * only the current tail candle may be replaced as its verified OHLCV evolves.
 */
export function mergeIncrementalOhlcv<T extends IncrementalOhlcvCandle>(existing: T[], incoming: T[], expectedIntervalMs: number): IncrementalCandleMerge<T> {
  if (!Number.isFinite(expectedIntervalMs) || expectedIntervalMs <= 0) {
    return { candles: existing, gaps: [], conflict: "The expected candle interval is invalid.", changed: false, transition: "UNCHANGED" };
  }

  const current = [...existing].sort((left, right) => left.openTime - right.openTime);
  for (let index = 0; index < current.length; index += 1) {
    const candle = current[index]!;
    if (!isFiniteIncrementalOhlcv(candle)) {
      return { candles: existing, gaps: [], conflict: `Loaded candle at ${candle.openTime} is invalid.`, changed: false, transition: "UNCHANGED" };
    }
    if (index > 0 && candle.openTime <= current[index - 1]!.openTime) {
      return { candles: existing, gaps: [], conflict: `Loaded candles are not strictly chronological at ${candle.openTime}.`, changed: false, transition: "UNCHANGED" };
    }
  }

  let next = current;
  let changed = false;
  let transition: IncrementalCandleMerge<T>["transition"] = "UNCHANGED";
  const orderedIncoming = [...incoming].sort((left, right) => left.openTime - right.openTime);

  for (const candle of orderedIncoming) {
    if (!isFiniteIncrementalOhlcv(candle)) {
      return { candles: existing, gaps: gapsFor(current, expectedIntervalMs), conflict: `Provider update at ${candle.openTime} is not valid OHLCV.`, changed: false, transition: "UNCHANGED" };
    }
    const matchingIndex = next.findIndex((loaded) => loaded.openTime === candle.openTime);
    if (matchingIndex >= 0) {
      if (sameOhlcv(next[matchingIndex]!, candle)) continue;
      if (matchingIndex !== next.length - 1) {
        return { candles: existing, gaps: gapsFor(current, expectedIntervalMs), conflict: `Provider update attempts to alter finalized candle ${candle.openTime}.`, changed: false, transition: "UNCHANGED" };
      }
      next = [...next.slice(0, -1), candle];
      changed = true;
      transition = "ACTIVE_REPLACED";
      continue;
    }

    const last = next.at(-1);
    if (last && candle.openTime <= last.openTime) {
      return { candles: existing, gaps: gapsFor(current, expectedIntervalMs), conflict: `Provider update is out of chronological order at ${candle.openTime}.`, changed: false, transition: "UNCHANGED" };
    }
    next = [...next, candle];
    changed = true;
    transition = "APPENDED";
  }

  return { candles: changed ? next : existing, gaps: gapsFor(next, expectedIntervalMs), conflict: null, changed, transition };
}
