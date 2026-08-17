import { describe, expect, it } from "vitest";
import { MIN_CSV_IMPORT_CANDLES, validateHistoricalOhlcvCsv } from "./csvImport";

function csv(rows = MIN_CSV_IMPORT_CANDLES): string { const header = "timestamp,open,high,low,close,volume"; const start = 1_700_000_000_000; return [header, ...Array.from({ length: rows }, (_, index) => `${start + index * 3_600_000},100,105,95,102,12.5`)].join("\n"); }
describe("verified OHLCV CSV import", () => {
  it("validates a contiguous documented CSV and returns a cryptographic fingerprint", () => { const result = validateHistoricalOhlcvCsv(csv(), "1h"); expect(result.valid).toBe(true); expect(result.rawFingerprint).toMatch(/^[a-f0-9]{64}$/); expect(result.candles).toHaveLength(MIN_CSV_IMPORT_CANDLES); });
  it("rejects duplicate timestamps, invalid OHLC, and missing intervals without returning partial candles", () => { const duplicate = csv().replace("1700003600000", "1700000000000"); const ohlc = csv().replace("100,105,95,102", "100,99,101,102"); const gap = csv().replace("1700003600000", "1700010800000"); expect(validateHistoricalOhlcvCsv(duplicate, "1h").errors[0]?.code).toBe("DUPLICATE_TIMESTAMP"); expect(validateHistoricalOhlcvCsv(ohlc, "1h").errors[0]?.code).toBe("INVALID_OHLC"); expect(validateHistoricalOhlcvCsv(gap, "1h").errors[0]?.code).toBe("MISSING_INTERVAL"); });
  it("rejects unsupported timestamps, malformed headers, and insufficient data", () => { expect(validateHistoricalOhlcvCsv(csv(3), "1h").errors[0]?.code).toBe("INSUFFICIENT_CANDLES"); expect(validateHistoricalOhlcvCsv(csv().replace("timestamp", "time"), "1h").errors[0]?.code).toBe("INVALID_HEADER"); expect(validateHistoricalOhlcvCsv(csv().replace("1700000000000", "2023-01-01"), "1h").errors[0]?.code).toBe("INVALID_TIMESTAMP"); });
});
