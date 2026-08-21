/**
 * Risk domain service.
 *
 * Wraps @nexus/core's calculateRiskLevel and persists each evaluation so the
 * history in risk_evaluations is a record of what was actually decided, with
 * the factors available at the time — not a re-derivation from today's data.
 *
 * It computes nothing itself. When intelligence is unavailable it passes
 * UNAVAILABLE straight through, and the core returns level: null with an
 * attributed reason. There is no fallback score anywhere in this path.
 */

import { calculateRiskLevel } from "@nexus/core";
import type { RiskLevelInput, RiskLevelResult } from "@nexus/core";
import type { DataOrigin, EntityRef, RiskLevel, RiskView } from "@nexus/contracts";
import { IntelligenceService } from "../intelligence/intelligenceService.ts";
import type { AssetIntelligenceView } from "@nexus/contracts";

export interface RiskEvaluationRecord {
  id: string;
  entity: EntityRef | null;
  evaluatedAt: number;
  level: RiskLevel | null;
  score: number | null;
  coveragePercent: number;
  factors: RiskView["score"]["factors"];
  unavailableReason: string | null;
  origin: DataOrigin;
  emergencyStopActive: boolean;
}

export interface RiskRepository {
  record(evaluation: RiskEvaluationRecord): Promise<void>;
  history(entity: EntityRef, limit: number): Promise<RiskEvaluationRecord[]>;
  latest(entity: EntityRef | null): Promise<RiskEvaluationRecord | null>;
}

export interface SafetyStateReader {
  isEmergencyStopActive(userId: string): Promise<boolean>;
}

export class RiskService {
  private readonly intelligence: IntelligenceService;
  private readonly repo: RiskRepository;
  private readonly safety: SafetyStateReader;
  private readonly nextId: () => string;
  private readonly now: () => number;

  constructor(deps: {
    intelligence: IntelligenceService;
    repo: RiskRepository;
    safety: SafetyStateReader;
    nextId: () => string;
    now: () => number;
  }) {
    this.intelligence = deps.intelligence;
    this.repo = deps.repo;
    this.safety = deps.safety;
    this.nextId = deps.nextId;
    this.now = deps.now;
  }

  async evaluate(input: {
    userId: string;
    entity: EntityRef;
    dailyDrawdownPercent: number;
    atrPercent?: number | null;
    timeframeConflict?: boolean;
  }): Promise<RiskView> {
    const view = await this.intelligence.forAsset(input.entity);
    return this.evaluateFromIntelligence({ ...input, intelligence: view });
  }

  /** Split out so a caller holding intelligence does not refetch it. */
  async evaluateFromIntelligence(input: {
    userId: string;
    entity: EntityRef;
    intelligence: AssetIntelligenceView;
    dailyDrawdownPercent: number;
    atrPercent?: number | null;
    timeframeConflict?: boolean;
  }): Promise<RiskView> {
    const derived = IntelligenceService.riskInputsFrom(input.intelligence);

    const levelInput: RiskLevelInput = {
      // "COMPLETE" was not a member of RiskDataQuality — passing it made the
      // engine fall through to its insufficient-evidence branch and return
      // null for every evaluation. The core owns this vocabulary.
      dataQuality: derived.dataQuality,
      // ATR comes from measured volatility, never from a caller-supplied
      // default: a fabricated ATR would silently move the risk score.
      atrPercent: input.atrPercent ?? derived.atrPercent,
      timeframeConflict: input.timeframeConflict ?? false,
      intelligenceRiskScore: derived.riskScore,
      signalStrength: derived.signalStrength,
      dailyDrawdownPercent: input.dailyDrawdownPercent,
    };

    const result: RiskLevelResult = calculateRiskLevel(levelInput);
    const emergencyStopActive = await this.safety.isEmergencyStopActive(input.userId);
    const evaluatedAt = this.now();

    const origin: DataOrigin = derived.origin ?? {
      freshness: "UNAVAILABLE",
      providerId: null,
      observedAt: null,
      cachedAt: null,
      reason: "No timeframe carried usable evidence.",
    };

    const factors = result.factors.map((f) => ({
      id: f.id,
      label: f.label,
      points: f.points,
      maxPoints: f.maxPoints,
      description: f.description,
    }));

    // Coverage is the share of factor weight actually backed by evidence.
    const maxTotal = factors.reduce((sum, f) => sum + f.maxPoints, 0);
    const coveragePercent = result.score === null || maxTotal === 0
      ? 0
      : Math.round((factors.filter((f) => f.points > 0).reduce((s, f) => s + f.maxPoints, 0) / maxTotal) * 100);

    await this.repo.record({
      id: this.nextId(),
      entity: input.entity,
      evaluatedAt,
      level: result.level as RiskLevel | null,
      score: result.score,
      coveragePercent,
      factors,
      unavailableReason: result.unavailableReason,
      origin,
      emergencyStopActive,
    });

    return {
      entity: input.entity,
      level: result.level as RiskLevel | null,
      score: {
        value: result.score,
        coveragePercent,
        factors,
        unavailableReason: result.unavailableReason,
      },
      origin,
      emergencyStopActive,
      evaluatedAt,
    };
  }

  async history(entity: EntityRef, limit = 30): Promise<RiskEvaluationRecord[]> {
    return this.repo.history(entity, limit);
  }
}
