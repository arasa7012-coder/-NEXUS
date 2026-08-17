import { createHash } from "node:crypto";
import type { HistoricalCandle, StrategyInterval } from "./types";

export const CSV_IMPORT_SCHEMA = ["timestamp", "open", "high", "low", "close", "volume"] as const;
export const MAX_CSV_IMPORT_BYTES = 2_000_000;
export const MAX_CSV_IMPORT_ROWS = 10_000;
export const MIN_CSV_IMPORT_CANDLES = 60;

const intervalMs: Record<StrategyInterval, number> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };
export type CsvValidationCode = "FILE_TOO_LARGE" | "EMPTY_FILE" | "INVALID_QUOTING" | "INVALID_HEADER" | "INVALID_COLUMN_COUNT" | "INVALID_TIMESTAMP" | "INVALID_NUMBER" | "INVALID_OHLC" | "INVALID_VOLUME" | "DUPLICATE_TIMESTAMP" | "OUT_OF_ORDER_TIMESTAMP" | "MISSING_INTERVAL" | "TOO_MANY_ROWS" | "INSUFFICIENT_CANDLES";
export interface CsvValidationError { code: CsvValidationCode; row: number | null; message: string; }
export interface CsvValidationResult { valid: boolean; rawFingerprint: string; errors: CsvValidationError[]; candles: HistoricalCandle[]; rowCount: number; rangeStart: number | null; rangeEnd: number | null; }

function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function error(errors: CsvValidationError[], code: CsvValidationCode, row: number | null, message: string): void { if (errors.length < 100) errors.push({ code, row, message }); }
function parseCsv(content: string): string[][] | null {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!;
    if (quoted) { if (char === '"') { if (content[index + 1] === '"') { field += '"'; index += 1; } else quoted = false; } else field += char; continue; }
    if (char === '"') { if (field.length !== 0) return null; quoted = true; continue; }
    if (char === ",") { row.push(field); field = ""; continue; }
    if (char === "\n") { row.push(field.replace(/\r$/, "")); if (row.some((value) => value.trim().length > 0)) rows.push(row); row = []; field = ""; continue; }
    field += char;
  }
  if (quoted) return null;
  row.push(field.replace(/\r$/, "")); if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}
function parseTimestamp(value: string): number | null {
  const trimmed = value.trim(); if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) { const timestamp = Number(trimmed); return Number.isSafeInteger(timestamp) && timestamp >= 946_684_800_000 ? timestamp : null; }
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) return null;
  const parsed = Date.parse(trimmed); return Number.isFinite(parsed) ? parsed : null;
}
function finitePositive(value: string): number | null { const parsed = Number(value.trim()); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function finiteNonNegative(value: string): number | null { const parsed = Number(value.trim()); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }

export function validateHistoricalOhlcvCsv(content: string, interval: StrategyInterval): CsvValidationResult {
  const rawFingerprint = hash(content); const errors: CsvValidationError[] = []; const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_CSV_IMPORT_BYTES) { error(errors, "FILE_TOO_LARGE", null, `CSV exceeds the ${MAX_CSV_IMPORT_BYTES} byte import limit.`); return { valid: false, rawFingerprint, errors, candles: [], rowCount: 0, rangeStart: null, rangeEnd: null }; }
  if (!content.trim()) { error(errors, "EMPTY_FILE", null, "CSV file is empty."); return { valid: false, rawFingerprint, errors, candles: [], rowCount: 0, rangeStart: null, rangeEnd: null }; }
  const rows = parseCsv(content); if (!rows) { error(errors, "INVALID_QUOTING", null, "CSV contains an unterminated or invalid quoted field."); return { valid: false, rawFingerprint, errors, candles: [], rowCount: 0, rangeStart: null, rangeEnd: null }; }
  const header = rows[0]?.map((value) => value.trim().toLowerCase()) ?? []; if (header.length !== CSV_IMPORT_SCHEMA.length || header.some((value, index) => value !== CSV_IMPORT_SCHEMA[index])) { error(errors, "INVALID_HEADER", 1, `Expected exactly: ${CSV_IMPORT_SCHEMA.join(",")}.`); return { valid: false, rawFingerprint, errors, candles: [], rowCount: Math.max(0, rows.length - 1), rangeStart: null, rangeEnd: null }; }
  const data = rows.slice(1); if (data.length > MAX_CSV_IMPORT_ROWS) error(errors, "TOO_MANY_ROWS", null, `CSV has more than ${MAX_CSV_IMPORT_ROWS} data rows.`);
  const candles: HistoricalCandle[] = []; let previousOpenTime: number | null = null;
  data.slice(0, MAX_CSV_IMPORT_ROWS).forEach((row, index) => {
    const rowNumber = index + 2; if (row.length !== CSV_IMPORT_SCHEMA.length) { error(errors, "INVALID_COLUMN_COUNT", rowNumber, "Each data row must contain exactly six columns."); return; }
    const [timestampValue, openValue, highValue, lowValue, closeValue, volumeValue] = row; const openTime = parseTimestamp(timestampValue!); const open = finitePositive(openValue!); const high = finitePositive(highValue!); const low = finitePositive(lowValue!); const close = finitePositive(closeValue!); const volume = finiteNonNegative(volumeValue!);
    if (openTime === null) { error(errors, "INVALID_TIMESTAMP", rowNumber, "Timestamp must be UTC ISO-8601 with timezone or Unix milliseconds."); return; }
    if ([open, high, low, close].some((value) => value === null)) { error(errors, "INVALID_NUMBER", rowNumber, "Open, high, low, and close must be finite positive numbers."); return; }
    if (volume === null) { error(errors, "INVALID_VOLUME", rowNumber, "Volume must be a finite non-negative number."); return; }
    if (low! > Math.min(open!, close!) || high! < Math.max(open!, close!)) { error(errors, "INVALID_OHLC", rowNumber, "OHLC relationship must satisfy low ≤ min(open, close) ≤ max(open, close) ≤ high."); return; }
    if (previousOpenTime !== null) { if (openTime === previousOpenTime) { error(errors, "DUPLICATE_TIMESTAMP", rowNumber, "Timestamp duplicates the preceding candle."); return; } if (openTime < previousOpenTime) { error(errors, "OUT_OF_ORDER_TIMESTAMP", rowNumber, "Timestamps must be strictly increasing."); return; } if (openTime - previousOpenTime !== intervalMs[interval]) { error(errors, "MISSING_INTERVAL", rowNumber, `Expected exactly one ${interval} interval since the preceding candle.`); return; } }
    previousOpenTime = openTime; candles.push({ openTime, closeTime: openTime + intervalMs[interval] - 1, open: open!, high: high!, low: low!, close: close!, volume: volume!, quoteVolumeUsd: volume! * close!, tradeCount: 0 });
  });
  if (errors.length === 0 && candles.length < MIN_CSV_IMPORT_CANDLES) error(errors, "INSUFFICIENT_CANDLES", null, `At least ${MIN_CSV_IMPORT_CANDLES} verified candles are required.`);
  return { valid: errors.length === 0, rawFingerprint, errors, candles: errors.length ? [] : candles, rowCount: data.length, rangeStart: candles[0]?.openTime ?? null, rangeEnd: candles.at(-1)?.closeTime ?? null };
}
