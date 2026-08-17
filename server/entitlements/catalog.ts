export const subscriptionPlans = ["FREE", "PRO", "ELITE"] as const;
export type SubscriptionPlan = (typeof subscriptionPlans)[number];
export const subscriptionStates = ["FREE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"] as const;
export type SubscriptionState = (typeof subscriptionStates)[number];

export const entitlementCatalog = {
  market_basic: { title: "Market data", description: "Verified market directory and asset context.", value: "Read current verified market context.", usageMetric: null },
  market_advanced: { title: "Advanced market terminal", description: "Expanded market terminal context and saved market views.", value: "Explore more market context efficiently.", usageMetric: null },
  intelligence_basic: { title: "Nexus Intelligence", description: "Evidence-bounded deterministic market intelligence.", value: "See transparent analytical context, not predictions.", usageMetric: null },
  intelligence_advanced: { title: "Advanced Intelligence", description: "Expanded multi-timeframe intelligence context.", value: "Compare broader evidence before paper decisions.", usageMetric: null },
  opportunity_scanner: { title: "Opportunity scanner", description: "Evidence-qualified market scanner.", value: "Focus research on assets with sufficient evidence.", usageMetric: null },
  risk_basic: { title: "Risk controls", description: "Core paper-trading risk settings and safety gates.", value: "Keep paper decisions bounded by configured protection.", usageMetric: null },
  risk_advanced: { title: "Advanced risk analysis", description: "Expanded risk, monitoring, and evidence context.", value: "Review deeper protection evidence.", usageMetric: null },
  strategy_lab: { title: "Strategy Lab", description: "Create and manage deterministic paper strategies.", value: "Structure repeatable research workflows.", usageMetric: "strategies" },
  backtesting_basic: { title: "Basic backtesting", description: "Run bounded deterministic historical paper simulations.", value: "Evaluate a strategy against verified history.", usageMetric: "backtests" },
  backtesting_advanced: { title: "Advanced backtesting", description: "Store and compare expanded paper backtest runs.", value: "Analyze more research iterations.", usageMetric: "saved_runs" },
  parameter_search: { title: "Parameter search", description: "Bounded, deterministic parameter research.", value: "Test controlled variations without curve-fitting claims.", usageMetric: "parameter_searches" },
  ai_copilot_basic: { title: "Nexus Copilot", description: "Evidence-grounded Copilot explanations.", value: "Ask questions about available Nexus evidence.", usageMetric: "ai_requests" },
  ai_copilot_advanced: { title: "Advanced Copilot", description: "Expanded grounded Copilot context for research and risk.", value: "Connect more of your own paper evidence.", usageMetric: "ai_requests" },
  smart_alerts: { title: "Smart alerts", description: "Explainable user-requested alert evaluation.", value: "Track selected evidence changes.", usageMetric: "alerts" },
  advanced_alerts: { title: "Advanced alerts", description: "Expanded alert preferences and evidence context.", value: "Manage a broader alert workflow.", usageMetric: "alerts" },
  continuous_monitoring: { title: "Monitoring", description: "Evidence-based paper-position monitoring.", value: "Review monitored paper-position conditions.", usageMetric: "monitoring_sessions" },
  daily_briefing: { title: "Daily briefing", description: "On-demand evidence-based briefing.", value: "Summarize current verified context.", usageMetric: "briefings" },
  portfolio_ai: { title: "Portfolio AI context", description: "Grounded paper-portfolio explanation context.", value: "Understand virtual portfolio evidence.", usageMetric: "ai_requests" },
  premium_voice: { title: "Premium voice", description: "Future configurable Nexus voice experience.", value: "Prepare a personalized welcome when a provider is configured.", usageMetric: null },
  advanced_ai_features: { title: "Advanced AI features", description: "Future evidence-bound premium AI capabilities.", value: "Extend Nexus only when supporting providers are configured.", usageMetric: "ai_requests" },
  smart_money_basic: { title: "Smart Money Radar", description: "Source-backed public wallet lookup and explainable on-chain activity context.", value: "Inspect verified Ethereum and Base wallet observations.", usageMetric: "wallet_lookups" },
  smart_money_advanced: { title: "Advanced Wallet Intelligence", description: "Expanded public-wallet watchlists, activity analysis, and contextual evidence.", value: "Follow more source-backed wallet research without automated execution.", usageMetric: "wallet_watchlists" },
} as const;

export type EntitlementKey = keyof typeof entitlementCatalog;
export type UsageMetric = Exclude<(typeof entitlementCatalog)[EntitlementKey]["usageMetric"], null>;
export const usageMetrics = ["strategies", "backtests", "saved_runs", "parameter_searches", "ai_requests", "alerts", "monitoring_sessions", "briefings", "wallet_lookups", "wallet_watchlists"] as const satisfies readonly UsageMetric[];

type PlanConfiguration = { enabled: readonly EntitlementKey[]; limits: Record<UsageMetric, number>; trialDays: number };
const unlimited = Number.MAX_SAFE_INTEGER;
export const planConfiguration: Record<SubscriptionPlan, PlanConfiguration> = {
  FREE: { enabled: ["market_basic", "intelligence_basic", "risk_basic", "strategy_lab", "backtesting_basic", "ai_copilot_basic", "smart_alerts", "continuous_monitoring", "daily_briefing", "smart_money_basic"], limits: { strategies: 3, backtests: 5, saved_runs: 5, parameter_searches: 0, ai_requests: 20, alerts: 10, monitoring_sessions: 3, briefings: 5, wallet_lookups: 3, wallet_watchlists: 0 }, trialDays: 0 },
  PRO: { enabled: ["market_basic", "market_advanced", "intelligence_basic", "intelligence_advanced", "opportunity_scanner", "risk_basic", "risk_advanced", "strategy_lab", "backtesting_basic", "backtesting_advanced", "parameter_search", "ai_copilot_basic", "ai_copilot_advanced", "smart_alerts", "advanced_alerts", "continuous_monitoring", "daily_briefing", "portfolio_ai", "smart_money_basic", "smart_money_advanced"], limits: { strategies: 25, backtests: 80, saved_runs: 80, parameter_searches: 12, ai_requests: 300, alerts: 75, monitoring_sessions: 40, briefings: 60, wallet_lookups: 120, wallet_watchlists: 25 }, trialDays: 0 },
  ELITE: { enabled: Object.keys(entitlementCatalog) as EntitlementKey[], limits: { strategies: unlimited, backtests: unlimited, saved_runs: unlimited, parameter_searches: unlimited, ai_requests: unlimited, alerts: unlimited, monitoring_sessions: unlimited, briefings: unlimited, wallet_lookups: unlimited, wallet_watchlists: unlimited }, trialDays: 0 },
};

export function isSubscriptionStateEntitled(state: SubscriptionState) { return state === "FREE" || state === "TRIALING" || state === "ACTIVE"; }
export function effectivePlanForState(plan: SubscriptionPlan, state: SubscriptionState): SubscriptionPlan { return isSubscriptionStateEntitled(state) ? plan : "FREE"; }
