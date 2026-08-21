/**
 * Monitor execution.
 *
 * The bridge between a monitor *definition* and the existing runner. It does
 * not reimplement scheduling, claiming, or backoff — `MonitorRunner` already
 * owns those and is tested. This supplies the `CheckFn` the runner calls.
 *
 * The full loop it completes:
 *
 *   definition → scheduler → claim → executor → provider → intelligence/risk
 *              → alert → event → SSE
 *
 * Two invariants:
 *
 *   1. **Emergency Stop is consulted from persistent state before every run.**
 *      Not cached, not read once at startup.
 *   2. **A provider failure never becomes intelligence.** Failures are
 *      classified and re-thrown so the runner can back off; they never
 *      produce a triggered condition, and never an alert claiming a market
 *      finding that no data supports.
 */

import type {
  AssetIntelligenceView, Monitor, MonitorFailureKind, RiskLevel, RiskView,
} from "@nexus/contracts";
import type { CheckOutcome } from "./scheduler.ts";
import type { IntelligenceService } from "../intelligence/intelligenceService.ts";
import type { RiskService } from "../risk/riskService.ts";
import type { AlertService } from "../alerts/alertService.ts";
import type { ProviderRegistry } from "../providers/registry.ts";
import type { SafetyStateReader } from "../safety/safetyService.ts";

/** Raised so the runner's existing failure handling applies unchanged. */
export class MonitorRunError extends Error {
  readonly kind: MonitorFailureKind;

  constructor(kind: MonitorFailureKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "MonitorRunError";
  }
}

const RISK_RANK: Record<RiskLevel, number> = { LOW: 0, MODERATE: 1, HIGH: 2, EXTREME: 3 };

/** Maps a provider's unavailability reason onto the failure taxonomy. */
export function classifyProviderReason(reason: string | null): MonitorFailureKind {
  const text = (reason ?? "").toLowerCase();
  if (text.includes("cooldown") || text.includes("rate limit") || text.includes("429")) return "RATE_LIMITED";
  if (text.includes("timeout") || text.includes("timed out")) return "TIMEOUT";
  if (text.includes("credential") || text.includes("unauthor") || text.includes("401") || text.includes("403")) {
    return "AUTH_FAILED";
  }
  if (text.includes("no data") || text.includes("malformed") || text.includes("invalid")) return "INVALID_RESPONSE";
  return "PROVIDER_UNAVAILABLE";
}

export class MonitorExecutor {
  private readonly intelligence: IntelligenceService;
  private readonly risk: RiskService;
  private readonly alerts: AlertService;
  private readonly providers: ProviderRegistry;
  private readonly safety: SafetyStateReader;

  constructor(deps: {
    intelligence: IntelligenceService;
    risk: RiskService;
    alerts: AlertService;
    providers: ProviderRegistry;
    safety: SafetyStateReader;
  }) {
    this.intelligence = deps.intelligence;
    this.risk = deps.risk;
    this.alerts = deps.alerts;
    this.providers = deps.providers;
    this.safety = deps.safety;
  }

  /** The CheckFn handed to MonitorRunner.runCycle. */
  check = async (monitor: Monitor): Promise<CheckOutcome> => {
    // Authoritative, persistent, read fresh on every run. A restart cannot
    // clear it, and a cache cannot go stale against it.
    if (await this.safety.isEmergencyStopActive(monitor.userId)) {
      return { triggered: false, detail: "Skipped: Emergency Stop is active." };
    }

    switch (monitor.config.type) {
      case "ASSET_INTELLIGENCE":
        return this.checkAssetIntelligence(monitor);
      case "PROVIDER_HEALTH":
        return this.checkProviderHealth(monitor);
    }
  };

  private async checkAssetIntelligence(monitor: Monitor): Promise<CheckOutcome> {
    if (monitor.config.type !== "ASSET_INTELLIGENCE") {
      throw new MonitorRunError("INTERNAL", "Configuration does not match monitor type.");
    }
    const config = monitor.config;

    let view: AssetIntelligenceView;
    try {
      view = await this.intelligence.forAsset(monitor.target);
    } catch (error) {
      throw new MonitorRunError("INTERNAL", error instanceof Error ? error.message : "Intelligence failed.");
    }

    const unavailable = view.primaryTimeframe === null;

    if (unavailable) {
      // A user may explicitly ask to be told when data goes dark — that is a
      // legitimate finding about NEXUS, clearly labelled as such.
      if (config.onDataUnavailable) {
        const reason = view.timeframes[0]?.origin.reason ?? "No timeframe carried usable evidence.";
        await this.raise(monitor, {
          rule: "data-unavailable",
          severity: "WARNING",
          title: `Intelligence unavailable for ${monitor.target.label}`,
          explanation: `NEXUS could not evaluate ${monitor.target.label}: ${reason}`,
        });
        return { triggered: true, detail: "Intelligence unavailable." };
      }

      // Otherwise this is a failure, not a finding. Throwing lets the runner
      // apply backoff — and guarantees no alert is invented from absent data.
      const kind = classifyProviderReason(view.timeframes[0]?.origin.reason ?? null);
      throw new MonitorRunError(kind, view.timeframes[0]?.origin.reason ?? "Intelligence data unavailable.");
    }

    let risk: RiskView;
    try {
      risk = await this.risk.evaluateFromIntelligence({
        userId: monitor.userId,
        entity: monitor.target,
        intelligence: view,
        dailyDrawdownPercent: 0,
      });
    } catch (error) {
      throw new MonitorRunError("INTERNAL", error instanceof Error ? error.message : "Risk evaluation failed.");
    }

    // The top risk factors travel into the alert, so it explains itself with
    // the same evidence the engine used.
    const evidence = risk.score.factors
      .filter((f) => f.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 2)
      .map((f) => `${f.label}: ${f.description}`)
      .join(" ");

    /**
     * One alert per *condition*, not one per evaluation.
     *
     * Each trigger dimension raises under its own rule, so the rule becomes
     * part of the content-addressed identity. Two consequences that matter:
     *
     *   - A risk breach and a signal breach are genuinely different findings
     *     and get separate alerts, rather than being merged into one row whose
     *     meaning changes depending on which half fired.
     *   - Severity is NOT part of the identity, so a condition escalating from
     *     WARNING to CRITICAL updates the existing alert in place instead of
     *     opening a second one.
     */
    const detail: string[] = [];

    if (config.riskAtOrAbove !== null && risk.level !== null
        && RISK_RANK[risk.level] >= RISK_RANK[config.riskAtOrAbove]) {
      const reason = `Risk is ${risk.level} (threshold ${config.riskAtOrAbove}), score ${risk.score.value ?? "—"}/100.`;
      detail.push(reason);
      await this.raise(monitor, {
        rule: "risk-threshold",
        // Severity tracks the measured level and may rise on a later run;
        // AlertService escalates the existing alert rather than duplicating it.
        severity: risk.level === "EXTREME" ? "CRITICAL" : "WARNING",
        title: `${monitor.target.label}: risk ${risk.level}`,
        explanation: `${reason} ${evidence}`.trim(),
      });
    }

    if (config.signalAtOrAbove !== null && view.signalStrength.value !== null
        && view.signalStrength.value >= config.signalAtOrAbove) {
      const reason = `Signal strength ${Math.round(view.signalStrength.value)} reached the ${config.signalAtOrAbove} threshold.`;
      detail.push(reason);
      await this.raise(monitor, {
        rule: "signal-threshold",
        severity: "WATCH",
        title: `${monitor.target.label}: signal ${Math.round(view.signalStrength.value)}`,
        explanation: `${reason} ${evidence}`.trim(),
      });
    }

    if (detail.length === 0) return { triggered: false, detail: "No trigger condition met." };
    return { triggered: true, detail: detail.join(" ") };
  }

  private async checkProviderHealth(monitor: Monitor): Promise<CheckOutcome> {
    if (monitor.config.type !== "PROVIDER_HEALTH") {
      throw new MonitorRunError("INTERNAL", "Configuration does not match monitor type.");
    }
    const config = monitor.config;

    const status = this.providers.status().find((p) => p.providerId === config.providerId);
    if (!status) {
      // The provider was deregistered after the monitor was created.
      throw new MonitorRunError("INTERNAL", `Provider ${config.providerId} is no longer registered.`);
    }

    if (status.consecutiveFailures < config.failuresAtOrAbove) {
      return { triggered: false, detail: `${status.displayName} is ${status.state}.` };
    }

    await this.raise(monitor, {
      rule: "provider-health",
      severity: status.state === "FAILING" ? "CRITICAL" : "WARNING",
      title: `Data provider ${status.displayName} is ${status.state}`,
      explanation:
        `${status.displayName} has failed ${status.consecutiveFailures} consecutive times `
        + `(threshold ${config.failuresAtOrAbove}). ${status.detail ?? "No further detail reported."}`,
    });

    return { triggered: true, detail: `${status.consecutiveFailures} consecutive failures.` };
  }

  /**
   * All alerts go through the existing AlertService — never around it — so
   * de-duplication, occurrence counting, escalation and reopening apply
   * exactly as they do everywhere else.
   */
  private async raise(
    monitor: Monitor,
    input: { rule: string; severity: "WATCH" | "WARNING" | "CRITICAL"; title: string; explanation: string },
  ): Promise<void> {
    await this.alerts.raise({
      source: `monitor:${monitor.id}`,
      rule: input.rule,
      severity: input.severity,
      title: input.title,
      explanation: input.explanation,
      entity: monitor.target,
      // NO collapse window, deliberately.
      //
      // An earlier version set the window to the monitor's execution interval.
      // That coupled two unrelated concepts and defeated de-duplication
      // completely: every run landed in a fresh time bucket, minting a new
      // dedupeKey and a new alert — precisely the flood the design exists to
      // prevent. Execution interval and alert lifecycle are independent; a
      // monitor may run every 60s while one condition persists for hours.
      //
      // Identity is therefore (monitor, rule, entity) with no time component.
      // The alert stays the same record for as long as it is OPEN or
      // ACKNOWLEDGED, and only a condition that RESOLVED and later returns
      // opens a new lifecycle. Time bucketing remains available in
      // @nexus/core for aggregation, but never as the identity of an active
      // condition.
    });
  }
}
