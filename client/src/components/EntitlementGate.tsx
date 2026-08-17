import React from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { LockKeyhole, Sparkles } from "lucide-react";

export type NexusEntitlementKey = "market_basic" | "market_advanced" | "intelligence_basic" | "intelligence_advanced" | "opportunity_scanner" | "risk_basic" | "risk_advanced" | "strategy_lab" | "backtesting_basic" | "backtesting_advanced" | "parameter_search" | "ai_copilot_basic" | "ai_copilot_advanced" | "smart_alerts" | "advanced_alerts" | "continuous_monitoring" | "daily_briefing" | "portfolio_ai" | "premium_voice" | "advanced_ai_features";

export function EntitlementGate({ featureKey, children }: { featureKey: NexusEntitlementKey; children: React.ReactNode }) {
  const access = trpc.subscriptions.check.useQuery({ featureKey }, { retry: false });
  if (access.isLoading) return <section className="nexus-card h-40 animate-pulse" aria-busy="true" aria-label="Checking feature access" />;
  if (access.data?.decision.allowed) return <>{children}</>;
  const feature = access.data?.feature;
  const decision = access.data?.decision;
  return <section className="nexus-card border-primary/30 bg-primary/[.035] p-5" aria-live="polite"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="max-w-2xl"><div className="nexus-status-pill nexus-status-pill--neutral"><LockKeyhole className="size-3.5" /> {feature?.title ?? featureKey.replaceAll("_", " ")}</div><h2 className="mt-3 text-lg font-semibold">This research capability is locked for the current plan.</h2><p className="mt-2 text-sm text-muted-foreground">{feature?.description ?? "This capability requires a server-approved Nexus plan."}</p><p className="mt-2 text-sm text-foreground-secondary">{feature?.value ?? "Review your plan to see available research capacity."}</p>{decision?.usage ? <p className="mt-3 font-mono text-xs text-muted-foreground">{decision.usage.remaining} remaining in the current usage period</p> : null}</div><Button type="button" onClick={() => { window.location.assign("/pricing"); }} className="shrink-0"><Sparkles className="size-4" /> Review {decision?.requiredPlan ?? "Nexus"} access</Button></div></section>;
}
