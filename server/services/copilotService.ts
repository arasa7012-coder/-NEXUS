import { createHash } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { copilotDailyBriefings, copilotEvidenceRecords, userCopilotPreferences } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import {
  COPILOT_MODEL_ID,
  COPILOT_REQUEST_LIMIT_PER_WINDOW,
  COPILOT_REQUEST_WINDOW_MS,
  COPILOT_RESPONSE_TTL_MS,
  classifyCopilotQuestion,
  copilotRequestKinds,
  defaultCopilotPreferences,
  smartAlertSeverities,
  smartAlertTypes,
  type CopilotRequestKind,
  type SmartAlertSeverity,
  type SmartAlertType,
} from "../copilot/contracts";
import { buildCopilotEvidence, deterministicCopilotFallback, requestFingerprint } from "../copilot/evidence";

const requestWindowByUser = new Map<number, number[]>();

export class CopilotError extends Error {
  constructor(public readonly code: "INVALID" | "UNAVAILABLE" | "RATE_LIMITED", message: string) { super(message); }
}

type StoredPreferences = ReturnType<typeof defaultCopilotPreferences>;
const riskTolerances = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as const;

function boundedStringArray(value: unknown, allowed: readonly string[], fallback: string[], maximum: number) {
  if (!Array.isArray(value)) return fallback;
  const allowedSet = new Set(allowed);
  const result = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && allowedSet.has(item))));
  return result.slice(0, maximum);
}

function parsePreferences(row: typeof userCopilotPreferences.$inferSelect | undefined): StoredPreferences {
  const fallback = defaultCopilotPreferences();
  if (!row) return fallback;
  let favorites: unknown = null; let timeframes: unknown = null; let alertTypes: unknown = null;
  try { favorites = JSON.parse(row.favoriteSymbolsJson); } catch { /* controlled fallback */ }
  try { timeframes = JSON.parse(row.preferredTimeframesJson); } catch { /* controlled fallback */ }
  try { alertTypes = JSON.parse(row.enabledAlertTypesJson); } catch { /* controlled fallback */ }
  return {
    favoriteSymbols: boundedStringArray(favorites, ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "LINK"], fallback.favoriteSymbols, 8),
    preferredTimeframes: boundedStringArray(timeframes, ["5m", "15m", "1h", "4h", "1d"], fallback.preferredTimeframes, 5),
    riskTolerance: riskTolerances.includes(row.riskTolerance as typeof riskTolerances[number]) ? row.riskTolerance as typeof riskTolerances[number] : fallback.riskTolerance,
    enabledAlertTypes: boundedStringArray(alertTypes, smartAlertTypes, fallback.enabledAlertTypes, smartAlertTypes.length) as SmartAlertType[],
    minimumAlertSeverity: smartAlertSeverities.includes(row.minimumAlertSeverity as SmartAlertSeverity) ? row.minimumAlertSeverity as SmartAlertSeverity : fallback.minimumAlertSeverity,
    alertCooldownMinutes: Math.min(1440, Math.max(5, row.alertCooldownMinutes)),
    dailyBriefingEnabled: row.dailyBriefingEnabled === 1,
  };
}

function preferenceValues(userId: number, preferences: StoredPreferences) {
  return {
    userId,
    favoriteSymbolsJson: JSON.stringify(preferences.favoriteSymbols),
    preferredTimeframesJson: JSON.stringify(preferences.preferredTimeframes),
    riskTolerance: preferences.riskTolerance,
    enabledAlertTypesJson: JSON.stringify(preferences.enabledAlertTypes),
    minimumAlertSeverity: preferences.minimumAlertSeverity,
    alertCooldownMinutes: preferences.alertCooldownMinutes,
    dailyBriefingEnabled: preferences.dailyBriefingEnabled ? 1 : 0,
  };
}

export async function getCopilotPreferences(userId: number): Promise<StoredPreferences> {
  const db = await getDb();
  if (!db) throw new CopilotError("UNAVAILABLE", "Copilot preferences are temporarily unavailable.");
  const rows = await db.select().from(userCopilotPreferences).where(eq(userCopilotPreferences.userId, userId)).limit(1);
  if (rows[0]) return parsePreferences(rows[0]);
  const preferences = defaultCopilotPreferences();
  try { await db.insert(userCopilotPreferences).values(preferenceValues(userId, preferences)); } catch { /* concurrent creation is read below */ }
  const created = await db.select().from(userCopilotPreferences).where(eq(userCopilotPreferences.userId, userId)).limit(1);
  return parsePreferences(created[0]);
}

export async function updateCopilotPreferences(userId: number, partial: Partial<StoredPreferences>) {
  const db = await getDb();
  if (!db) throw new CopilotError("UNAVAILABLE", "Copilot preferences are temporarily unavailable.");
  const current = await getCopilotPreferences(userId);
  const next: StoredPreferences = {
    favoriteSymbols: partial.favoriteSymbols ? boundedStringArray(partial.favoriteSymbols, ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "LINK"], current.favoriteSymbols, 8) : current.favoriteSymbols,
    preferredTimeframes: partial.preferredTimeframes ? boundedStringArray(partial.preferredTimeframes, ["5m", "15m", "1h", "4h", "1d"], current.preferredTimeframes, 5) : current.preferredTimeframes,
    riskTolerance: partial.riskTolerance && riskTolerances.includes(partial.riskTolerance) ? partial.riskTolerance : current.riskTolerance,
    enabledAlertTypes: partial.enabledAlertTypes ? boundedStringArray(partial.enabledAlertTypes, smartAlertTypes, current.enabledAlertTypes, smartAlertTypes.length) as SmartAlertType[] : current.enabledAlertTypes,
    minimumAlertSeverity: partial.minimumAlertSeverity && smartAlertSeverities.includes(partial.minimumAlertSeverity) ? partial.minimumAlertSeverity : current.minimumAlertSeverity,
    alertCooldownMinutes: partial.alertCooldownMinutes === undefined ? current.alertCooldownMinutes : Math.min(1440, Math.max(5, Math.floor(partial.alertCooldownMinutes))),
    dailyBriefingEnabled: partial.dailyBriefingEnabled === undefined ? current.dailyBriefingEnabled : Boolean(partial.dailyBriefingEnabled),
  };
  await db.update(userCopilotPreferences).set(preferenceValues(userId, next)).where(eq(userCopilotPreferences.userId, userId));
  return next;
}

function outputText(response: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = response.choices[0]?.message.content;
  if (typeof content !== "string") throw new Error("Copilot response did not contain text.");
  return content;
}

function claimOutput(evidenceIds: string[]) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "nexus_grounded_copilot_answer",
      strict: true,
      schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          limitations: { type: "array", items: { type: "string" } },
          evidenceIds: { type: "array", items: { type: "string", enum: evidenceIds }, minItems: 1 },
        },
        required: ["answer", "limitations", "evidenceIds"],
        additionalProperties: false,
      },
    },
  };
}

export function formatGroundedModelResponse(rawContent: string, evidenceIds: string[]) {
  const parsed = JSON.parse(rawContent) as { answer?: unknown; limitations?: unknown; evidenceIds?: unknown };
  if (typeof parsed.answer !== "string" || !Array.isArray(parsed.limitations) || !Array.isArray(parsed.evidenceIds) || parsed.evidenceIds.length === 0 || parsed.evidenceIds.some((id) => typeof id !== "string" || !evidenceIds.includes(id))) throw new Error("Copilot output failed evidence-reference validation.");
  return `${parsed.answer.trim()}\n\n### Evidence references\n${parsed.evidenceIds.map((id) => `- ${id}`).join("\n")}\n\n### Limitations\n${parsed.limitations.map((item) => `- ${String(item)}`).join("\n")}\n\n> Analytical and probabilistic only. Nexus does not execute external trades.`;
}

function consumeRequestSlot(userId: number) {
  const now = Date.now();
  const active = (requestWindowByUser.get(userId) ?? []).filter((at) => at > now - COPILOT_REQUEST_WINDOW_MS);
  if (active.length >= COPILOT_REQUEST_LIMIT_PER_WINDOW) return false;
  active.push(now); requestWindowByUser.set(userId, active); return true;
}

async function generatedResponse(question: string, evidence: unknown, fallback: string, userId: number) {
  if (!consumeRequestSlot(userId)) return { text: `${fallback}\n\n> Live AI wording is temporarily rate-limited. The deterministic evidence summary above remains available.`, mode: "DETERMINISTIC_FALLBACK" as const, modelId: null };
  try {
    const evidenceObject = evidence as { evidenceIds: string[] };
    const response = await invokeLLM({
      model: COPILOT_MODEL_ID,
      max_tokens: 650,
      response_format: claimOutput(evidenceObject.evidenceIds),
      messages: [
        { role: "system", content: "You are Nexus Copilot. Explain only the supplied JSON evidence. Never use outside knowledge, never predict a guaranteed outcome, never recommend or execute a trade, never invent a price, date, score, provider, or reason. If evidence is missing or stale, say so. State that all trading in Nexus is paper-only. Cite only the supplied evidenceIds." },
        { role: "user", content: `Question: ${question}\n\nVerified evidence JSON:\n${JSON.stringify(evidence)}` },
      ],
    });
    return {
      text: formatGroundedModelResponse(outputText(response), evidenceObject.evidenceIds),
      mode: "AI_GROUNDED" as const,
      modelId: response.model || COPILOT_MODEL_ID,
    };
  } catch {
    return { text: fallback, mode: "DETERMINISTIC_FALLBACK" as const, modelId: null };
  }
}

export async function askCopilot(input: { userId: number; question: string; kind?: CopilotRequestKind; symbol?: string | null; decisionId?: number | null; runId?: number | null; walletId?: number | null }) {
  const question = input.question.trim();
  if (question.length < 2 || question.length > 1200) throw new CopilotError("INVALID", "Ask a question between 2 and 1,200 characters.");
  const kind = input.kind ?? classifyCopilotQuestion(question);
  if (!copilotRequestKinds.includes(kind)) throw new CopilotError("INVALID", "The Copilot request type is not supported.");
  const db = await getDb();
  if (!db) throw new CopilotError("UNAVAILABLE", "Copilot evidence storage is temporarily unavailable.");
  const preferences = await getCopilotPreferences(input.userId);
  const { evidence, fingerprint } = await buildCopilotEvidence({ userId: input.userId, kind, symbol: input.symbol, decisionId: input.decisionId, runId: input.runId, walletId: input.walletId, userContext: { favoriteSymbols: preferences.favoriteSymbols, preferredTimeframes: preferences.preferredTimeframes, riskTolerance: preferences.riskTolerance } });
  const requestHash = requestFingerprint(input.userId, kind, question, input.symbol, input.decisionId, input.runId, input.walletId);
  const cached = await db.select().from(copilotEvidenceRecords).where(and(eq(copilotEvidenceRecords.userId, input.userId), eq(copilotEvidenceRecords.requestHash, requestHash), eq(copilotEvidenceRecords.evidenceFingerprint, fingerprint), gt(copilotEvidenceRecords.expiresAt, new Date()))).orderBy(desc(copilotEvidenceRecords.generatedAt)).limit(1);
  if (cached[0]) return { answer: cached[0].responseText, mode: cached[0].responseMode, evidence, evidenceRecordId: cached[0].id, cached: true as const, generatedAt: cached[0].generatedAt };
  const fallback = deterministicCopilotFallback(evidence);
  const answer = await generatedResponse(question, evidence, fallback, input.userId);
  const generatedAt = new Date();
  const result = await db.insert(copilotEvidenceRecords).values({ userId: input.userId, requestHash, requestKind: kind, question, evidenceFingerprint: fingerprint, evidenceJson: JSON.stringify(evidence), responseText: answer.text, responseMode: answer.mode, modelId: answer.modelId, generatedAt, expiresAt: new Date(generatedAt.getTime() + COPILOT_RESPONSE_TTL_MS) });
  const evidenceRecordId = Number((result as { insertId?: number }).insertId ?? 0);
  return { answer: answer.text, mode: answer.mode, evidence, evidenceRecordId, cached: false as const, generatedAt };
}

export async function generateDailyBriefing(userId: number) {
  const date = new Date().toISOString().slice(0, 10);
  const db = await getDb();
  if (!db) throw new CopilotError("UNAVAILABLE", "Briefing storage is temporarily unavailable.");
  const existing = await db.select().from(copilotDailyBriefings).where(and(eq(copilotDailyBriefings.userId, userId), eq(copilotDailyBriefings.briefingDateUtc, date))).limit(1);
  if (existing[0]) return { ...existing[0], cached: true as const };
  const result = await askCopilot({ userId, kind: "BRIEFING", question: "Provide today’s evidence-based Nexus briefing. Summarize available market context, paper portfolio protection, recent risk events, and strategy results. Clearly flag unavailable or stale evidence." });
  try {
    const created = await db.insert(copilotDailyBriefings).values({ userId, briefingDateUtc: date, evidenceFingerprint: createHash("sha256").update(JSON.stringify(result.evidence)).digest("hex"), evidenceJson: JSON.stringify(result.evidence), briefingText: result.answer, responseMode: result.mode, modelId: result.mode === "AI_GROUNDED" ? COPILOT_MODEL_ID : null, generatedAt: result.generatedAt });
    return { id: Number((created as { insertId?: number }).insertId ?? 0), briefingDateUtc: date, briefingText: result.answer, responseMode: result.mode, generatedAt: result.generatedAt, cached: false as const };
  } catch {
    const raced = await db.select().from(copilotDailyBriefings).where(and(eq(copilotDailyBriefings.userId, userId), eq(copilotDailyBriefings.briefingDateUtc, date))).limit(1);
    if (raced[0]) return { ...raced[0], cached: true as const };
    throw new CopilotError("UNAVAILABLE", "The requested briefing could not be stored.");
  }
}
