import { and, eq } from "drizzle-orm";
import { userChartViewPreferences } from "../../drizzle/schema";
import { getDb } from "../db";

export type ChartViewKey = { assetSymbol: string; source: "binance" | "coinbase"; interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" };
export type ChartViewPreference = ChartViewKey & { requestedStart: number; requestedEnd: number; visibleCandles: number; updatedAt: number };
export class ChartViewPreferenceError extends Error { constructor(message: string) { super(message); } }
function validate(input: ChartViewKey & { requestedStart: number; requestedEnd: number; visibleCandles: number }) {
  const assetSymbol = input.assetSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(assetSymbol)) throw new ChartViewPreferenceError("A supported chart symbol is required.");
  if (!Number.isFinite(input.requestedStart) || !Number.isFinite(input.requestedEnd) || input.requestedStart >= input.requestedEnd) throw new ChartViewPreferenceError("A finite ordered chart UTC range is required.");
  if (!Number.isInteger(input.visibleCandles) || input.visibleCandles < 8 || input.visibleCandles > 300) throw new ChartViewPreferenceError("Visible chart candles must be between 8 and 300.");
  return { ...input, assetSymbol };
}
function serialize(row: typeof userChartViewPreferences.$inferSelect): ChartViewPreference { return { assetSymbol: row.assetSymbol, source: row.source, interval: row.interval, requestedStart: row.requestedStart.getTime(), requestedEnd: row.requestedEnd.getTime(), visibleCandles: row.visibleCandles, updatedAt: row.updatedAt.getTime() }; }
export async function getChartViewPreference(userId: number, input: ChartViewKey): Promise<ChartViewPreference | null> { const validated = validate({ ...input, requestedStart: 1, requestedEnd: 2, visibleCandles: 8 }); const db = await getDb(); if (!db) throw new ChartViewPreferenceError("Chart-view storage is unavailable."); const row = (await db.select().from(userChartViewPreferences).where(and(eq(userChartViewPreferences.userId, userId), eq(userChartViewPreferences.assetSymbol, validated.assetSymbol), eq(userChartViewPreferences.source, input.source), eq(userChartViewPreferences.interval, input.interval))).limit(1))[0]; return row ? serialize(row) : null; }
export async function saveChartViewPreference(userId: number, input: ChartViewKey & { requestedStart: number; requestedEnd: number; visibleCandles: number }): Promise<ChartViewPreference> { const validated = validate(input); const db = await getDb(); if (!db) throw new ChartViewPreferenceError("Chart-view storage is unavailable."); const now = new Date(); await db.insert(userChartViewPreferences).values({ userId, assetSymbol: validated.assetSymbol, source: validated.source, interval: validated.interval, requestedStart: new Date(validated.requestedStart), requestedEnd: new Date(validated.requestedEnd), visibleCandles: validated.visibleCandles }).onDuplicateKeyUpdate({ set: { requestedStart: new Date(validated.requestedStart), requestedEnd: new Date(validated.requestedEnd), visibleCandles: validated.visibleCandles, updatedAt: now } }); const saved = await getChartViewPreference(userId, validated); if (!saved) throw new ChartViewPreferenceError("Chart-view preference could not be saved."); return saved; }
