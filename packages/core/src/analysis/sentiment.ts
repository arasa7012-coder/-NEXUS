/**
 * Headline sentiment — deterministic heuristic.
 *
 * The legacy `server/services/aiAnalysis.ts` counted six positive and six
 * negative keywords and surfaced the result as "AI-powered analysis". The
 * arithmetic was honest; the label was not. Nothing here is AI, so nothing
 * here claims to be.
 *
 * What changes:
 *   - the method is carried in the result (`method: "DETERMINISTIC_KEYWORD"`),
 *     so the UI can label it truthfully without guessing;
 *   - matched terms are returned as evidence, so a reader can see exactly why
 *     the score moved;
 *   - coverage is reported, so "no headline contained a known term" is
 *     distinguishable from "the terms balanced out to neutral" — the legacy
 *     version collapsed both to 0.
 *
 * A real model is introduced by implementing the SentimentProvider port in
 * apps/api and returning `method: "MODEL"`. No screen, contract, or caller
 * changes when that happens.
 */

export type SentimentMethod = "DETERMINISTIC_KEYWORD" | "MODEL";

export interface SentimentTerm {
  term: string;
  direction: "POSITIVE" | "NEGATIVE";
  occurrences: number;
  contribution: number;
}

export interface SentimentResult {
  /** null when nothing measurable was found — never silently 0. */
  score: number | null;
  method: SentimentMethod;
  /** Share of supplied headlines that contained at least one known term. */
  coveragePercent: number;
  headlineCount: number;
  matchedHeadlineCount: number;
  terms: SentimentTerm[];
  unavailableReason: string | null;
}

const WEIGHT = 0.1;

/**
 * Lexicon carried forward from the legacy implementation so behaviour is
 * comparable, not silently redefined. Extending it is a data change, not a
 * code change — which is the point of keeping it here rather than inline.
 */
const LEXICON: ReadonlyArray<readonly [string, "POSITIVE" | "NEGATIVE"]> = [
  ["bullish", "POSITIVE"],
  ["surge", "POSITIVE"],
  ["gain", "POSITIVE"],
  ["rally", "POSITIVE"],
  ["breakthrough", "POSITIVE"],
  ["growth", "POSITIVE"],
  ["bearish", "NEGATIVE"],
  ["crash", "NEGATIVE"],
  ["loss", "NEGATIVE"],
  ["decline", "NEGATIVE"],
  ["drop", "NEGATIVE"],
  ["weakness", "NEGATIVE"],
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to 4 decimals so the same input always serialises identically. */
function stable(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function analyzeSentimentHeuristic(headlines: readonly string[]): SentimentResult {
  const usable = headlines.filter((h) => typeof h === "string" && h.trim().length > 0);

  if (usable.length === 0) {
    return {
      score: null,
      method: "DETERMINISTIC_KEYWORD",
      coveragePercent: 0,
      headlineCount: 0,
      matchedHeadlineCount: 0,
      terms: [],
      unavailableReason: "No headlines were supplied, so sentiment could not be measured.",
    };
  }

  const counts = new Map<string, number>();
  let matchedHeadlines = 0;

  for (const headline of usable) {
    const lower = headline.toLowerCase();
    let matchedThis = false;
    for (const [term] of LEXICON) {
      let from = 0;
      let occurrences = 0;
      for (;;) {
        const at = lower.indexOf(term, from);
        if (at === -1) break;
        occurrences += 1;
        from = at + term.length;
      }
      if (occurrences > 0) {
        counts.set(term, (counts.get(term) ?? 0) + occurrences);
        matchedThis = true;
      }
    }
    if (matchedThis) matchedHeadlines += 1;
  }

  if (counts.size === 0) {
    return {
      score: null,
      method: "DETERMINISTIC_KEYWORD",
      coveragePercent: 0,
      headlineCount: usable.length,
      matchedHeadlineCount: 0,
      terms: [],
      unavailableReason:
        "No headline contained a known sentiment term, so no measurable sentiment is available.",
    };
  }

  const terms: SentimentTerm[] = [];
  let raw = 0;

  for (const [term, direction] of LEXICON) {
    const occurrences = counts.get(term);
    if (!occurrences) continue;
    const contribution = (direction === "POSITIVE" ? 1 : -1) * WEIGHT * occurrences;
    raw += contribution;
    terms.push({ term, direction, occurrences, contribution: stable(contribution) });
  }

  return {
    score: stable(clamp(raw, -1, 1)),
    method: "DETERMINISTIC_KEYWORD",
    coveragePercent: stable((matchedHeadlines / usable.length) * 100),
    headlineCount: usable.length,
    matchedHeadlineCount: matchedHeadlines,
    terms,
    unavailableReason: null,
  };
}
