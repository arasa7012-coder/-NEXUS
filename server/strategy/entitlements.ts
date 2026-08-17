export const featureEntitlementDefinitions = {
  basic_market_analysis: { requiredTier: "FREE", description: "Basic market intelligence and read-only analysis." },
  advanced_backtesting: { requiredTier: "PRO", description: "Verified historical datasets and deterministic backtests." },
  parameter_search: { requiredTier: "PRO", description: "Bounded deterministic parameter search." },
  advanced_strategy_analysis: { requiredTier: "ELITE", description: "Robustness and cross-period strategy analysis." },
  copilot_basic: { requiredTier: "FREE", description: "Grounded read-only Copilot explanations from Nexus evidence." },
  copilot_advanced: { requiredTier: "PRO", description: "Advanced grounded Copilot context for paper-risk and research evidence." },
  smart_alerts: { requiredTier: "FREE", description: "User-requested explainable smart-alert evaluation." },
  advanced_alerts: { requiredTier: "PRO", description: "Expanded alert preferences and higher-complexity alert evidence." },
  daily_briefing: { requiredTier: "FREE", description: "On-demand evidence-based daily briefing." },
  portfolio_ai: { requiredTier: "PRO", description: "Grounded paper-portfolio explanation context." },
  strategy_ai_analysis: { requiredTier: "ELITE", description: "Grounded strategy and backtest explanation context." },
  paper_position_monitoring: { requiredTier: "FREE", description: "Visible-session, evidence-based paper-position monitoring." },
  advanced_position_monitoring: { requiredTier: "PRO", description: "Expanded position-monitoring evidence and transition history." },
  notification_readiness: { requiredTier: "FREE", description: "User-managed in-app, email, and push readiness consent without delivery." },
  advanced_notification_channels: { requiredTier: "PRO", description: "Future configured email and push delivery channels, subject to explicit consent." },
  nexus_command: { requiredTier: "FREE", description: "Evidence-grounded Nexus Command health, timeline, and read-only risk overview." },
  nexus_shield: { requiredTier: "FREE", description: "Rule-derived Shield findings and security-mode reviews from stored evidence." },
  advanced_incident_correlation: { requiredTier: "PRO", description: "Future correlated incident review and multi-signal investigation surfaces." },
  action_approval_center: { requiredTier: "FREE", description: "Explicit user-owned action preview and approval records with no trade execution." },
  managed_monitoring_heartbeat: { requiredTier: "PRO", description: "Managed project monitoring health checks and audit events." },
} as const;
export type FeatureEntitlementKey = keyof typeof featureEntitlementDefinitions;
export const featureEntitlementKeys = Object.keys(featureEntitlementDefinitions) as FeatureEntitlementKey[];
/** Development policy: definitions are visible and all features remain enabled until a future billing policy is explicitly activated. */
export function defaultFeatureAccess(featureKey: FeatureEntitlementKey) { return { featureKey, requiredTier: featureEntitlementDefinitions[featureKey].requiredTier, enabled: true as const, enforcement: "NOT_ENFORCED" as const }; }
