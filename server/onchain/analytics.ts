import type { OnChainTransaction } from "../../drizzle/schema";

export type EvidenceMetric = { label: string; status: "OBSERVED" | "INSUFFICIENT_EVIDENCE" | "DATA_SOURCE_NOT_AVAILABLE"; value: string | number | null; detail: string };
export type WalletAnalytics = {
  smartMoneyScore: number | null;
  confidenceScore: number | null;
  classification: "ELITE" | "STRONG" | "PROMISING" | "NEUTRAL" | "WEAK" | "INSUFFICIENT_DATA";
  components: EvidenceMetric[];
  whyThisScore: string[];
  dataQuality: "VERIFIED" | "PARTIAL" | "STALE" | "UNAVAILABLE";
};

const minimumTransfers = 10;
const minimumObservationDays = 7;

function percent(value: number) { return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100; }

/**
 * Proprietary Nexus observational score. It is not a provider-supplied rank and does not claim profitability.
 * Realized P&L, win rate, drawdown, position size and early entry need valuation/trade interpretation evidence
 * beyond Alchemy transfer observations, so they are returned as unavailable rather than estimated.
 */
export function analyzeObservedWalletActivity(transactions: OnChainTransaction[], dataQuality: WalletAnalytics["dataQuality"], walletAddress?: string): WalletAnalytics {
  const observed = transactions.filter((transaction) => transaction.observedAt !== null).sort((a, b) => (a.observedAt?.getTime() ?? 0) - (b.observedAt?.getTime() ?? 0));
  const first = observed[0]?.observedAt ?? null;
  const last = observed[observed.length - 1]?.observedAt ?? null;
  const observedDays = first && last ? Math.max(0, Math.round((last.getTime() - first.getTime()) / 86_400_000)) : 0;
  const uniqueActiveDays = new Set(observed.map((transaction) => transaction.observedAt?.toISOString().slice(0, 10))).size;
  const normalizedWallet = walletAddress?.toLowerCase();
  const incoming = normalizedWallet ? observed.filter((transaction) => transaction.toAddress?.toLowerCase() === normalizedWallet).length : null;
  const outgoing = normalizedWallet ? observed.filter((transaction) => transaction.fromAddress?.toLowerCase() === normalizedWallet).length : null;
  const enoughEvidence = observed.length >= minimumTransfers && observedDays >= minimumObservationDays;
  const common: EvidenceMetric[] = [
    { label: "Observed transfers", status: "OBSERVED", value: observed.length, detail: "Provider-normalized transfer observations retained with transaction hashes." },
    { label: "Observed history", status: observedDays > 0 ? "OBSERVED" : "INSUFFICIENT_EVIDENCE", value: observedDays || null, detail: observedDays > 0 ? "Days between the earliest and latest timestamped observations." : "A history span cannot be established from the returned provider data." },
    { label: "Active days", status: uniqueActiveDays > 0 ? "OBSERVED" : "INSUFFICIENT_EVIDENCE", value: uniqueActiveDays || null, detail: "Distinct UTC days with at least one source-backed transfer." },
    { label: "Transfer direction", status: normalizedWallet ? "OBSERVED" : "INSUFFICIENT_EVIDENCE", value: normalizedWallet ? `${incoming} incoming / ${outgoing} outgoing` : null, detail: normalizedWallet ? "A count of observed transfer directions relative to the public wallet; it is not a trade classification." : "The wallet address was not supplied to classify transfer direction." },
    { label: "Historical P&L", status: "DATA_SOURCE_NOT_AVAILABLE", value: null, detail: "Alchemy transfer observations alone do not establish cost basis, realized sale price, or portfolio valuation." },
    { label: "Win rate", status: "DATA_SOURCE_NOT_AVAILABLE", value: null, detail: "Trade outcomes cannot be inferred reliably from transfer rows." },
    { label: "Drawdown", status: "DATA_SOURCE_NOT_AVAILABLE", value: null, detail: "A source-backed historical valuation series is not available in this calculation." },
    { label: "Position sizing", status: "DATA_SOURCE_NOT_AVAILABLE", value: null, detail: "Token amounts have no reliable unified quote valuation in this provider-only calculation." },
    { label: "Early-entry behavior", status: "DATA_SOURCE_NOT_AVAILABLE", value: null, detail: "Token launch and first-liquidity evidence are not part of the verified input set." },
  ];
  if (!enoughEvidence) return { smartMoneyScore: null, confidenceScore: percent((observed.length / minimumTransfers) * 50 + (observedDays / minimumObservationDays) * 50), classification: "INSUFFICIENT_DATA", components: common, whyThisScore: [`Nexus requires at least ${minimumTransfers} timestamped transfers across ${minimumObservationDays} days before publishing an observational Smart Money score.`, "Profitability and trade-performance metrics remain unavailable because the provider evidence does not establish cost basis or realized P&L."], dataQuality };
  const activity = percent((Math.min(observed.length, 80) / 80) * 100);
  const consistency = percent((Math.min(uniqueActiveDays, 30) / 30) * 100);
  const span = percent((Math.min(observedDays, 90) / 90) * 100);
  const score = percent(activity * 0.4 + consistency * 0.35 + span * 0.25);
  const confidence = percent(Math.min(100, 45 + Math.min(observed.length, 80) * 0.45 + Math.min(observedDays, 90) * 0.2));
  const classification = score >= 80 ? "STRONG" : score >= 60 ? "PROMISING" : score >= 35 ? "NEUTRAL" : "WEAK";
  common.splice(4, 0, { label: "Nexus activity score", status: "OBSERVED", value: score, detail: "Weighted observable activity, active-day consistency, and history span. It is not a claim of realized performance." }, { label: "Score confidence", status: "OBSERVED", value: confidence, detail: "Confidence rises only with the amount and time span of retained provider observations." });
  return { smartMoneyScore: score, confidenceScore: confidence, classification, components: common, whyThisScore: ["The proprietary Nexus score weights only observed transfer volume, distinct active days, and history span.", "No realized P&L, win rate, drawdown, or early-entry claim contributes to this score because verified evidence for those metrics is unavailable."], dataQuality };
}
