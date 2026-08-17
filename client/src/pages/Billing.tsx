import { startLogin } from "@/const";
import React from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { CalendarClock, CheckCircle2, CircleAlert, CreditCard, Gauge, LockKeyhole, RefreshCw, ShieldCheck, Volume2 } from "lucide-react";
import { useMemo, useState } from "react";

type FeatureState = "all" | "usage" | "available" | "locked";
type Usage = { limit: number; used: number; remaining: number } | null;

function readableFeature(featureKey: string) { return featureKey.split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" "); }
function usageCopy(usage: Usage) { if (!usage) return "Not metered"; if (usage.limit > 1_000_000_000) return "Configured unlimited"; return `${usage.remaining} remaining of ${usage.limit}`; }
function UsageMeter({ usage, locked }: { usage: Usage; locked: boolean }) {
  if (!usage) return <span className="font-mono text-xs text-muted-foreground">Not metered</span>;
  const unlimited = usage.limit > 1_000_000_000;
  const percent = unlimited ? 0 : Math.min(100, Math.round((usage.used / Math.max(1, usage.limit)) * 100));
  const tone = locked || usage.remaining <= 0 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-primary";
  return <div className="min-w-44"><div className="flex justify-between gap-3 font-mono text-[11px] text-muted-foreground"><span>{usageCopy(usage)}</span><span>{unlimited ? "∞" : `${percent}%`}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-[width] duration-300 ${tone}`} style={{ width: `${unlimited ? 100 : percent}%` }} /></div></div>;
}

export default function Billing() {
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<FeatureState>("all");
  const account = trpc.subscriptions.account.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const voice = trpc.subscriptions.voiceReadiness.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const data = account.data;
  const visibleFeatures = useMemo(() => {
    const features = data?.features ?? [];
    if (filter === "usage") return features.filter((feature) => feature.usage);
    if (filter === "available") return features.filter((feature) => feature.allowed);
    if (filter === "locked") return features.filter((feature) => !feature.allowed);
    return features;
  }, [data?.features, filter]);

  if (!isAuthenticated) return <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-6"><section className="nexus-card w-full p-6 text-center"><ShieldCheck className="mx-auto size-8 text-primary" /><h1 className="mt-3 text-xl font-semibold">Your Nexus subscription</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to view your server-owned plan, feature access, and remaining usage.</p><Button className="mt-5" onClick={() => startLogin()}>Sign in</Button></section></main>;

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
    <section className="nexus-card nexus-card--hero flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="nexus-kicker">ACCOUNT / SUBSCRIPTION</p><h1 className="text-2xl font-semibold">Plan, access, and research capacity</h1><p className="mt-2 text-sm text-muted-foreground">Every status and limit below is resolved by Nexus on the server. Browser settings cannot unlock a feature or alter a counter.</p></div><div className="flex flex-wrap items-center gap-2"><div className="nexus-status-pill nexus-status-pill--neutral"><CreditCard className="size-3.5" /> Payment provider not configured</div><Button variant="outline" size="sm" onClick={() => account.refetch()} disabled={account.isFetching}><RefreshCw className={`size-3.5 ${account.isFetching ? "animate-spin" : ""}`} /> Refresh</Button></div></section>
    {account.isLoading ? <section className="nexus-card h-[28rem] animate-pulse" aria-label="Loading subscription account" /> : data ? <><section className="grid gap-4 md:grid-cols-4"><article className="nexus-card p-5"><p className="nexus-kicker">CURRENT PLAN</p><p className="mt-2 text-2xl font-semibold">Nexus {data.subscription.plan}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CheckCircle2 className="size-3.5 text-success" /> {data.subscription.state}</p></article><article className="nexus-card p-5"><p className="nexus-kicker">PLAN ACCESS</p><p className="mt-2 text-2xl font-semibold">{data.features.filter((feature) => feature.allowed).length}</p><p className="mt-1 text-sm text-muted-foreground">available capabilities</p></article><article className="nexus-card p-5"><p className="nexus-kicker">CURRENT PERIOD</p><p className="mt-2 flex items-center gap-2 text-sm"><CalendarClock className="size-4 text-primary" />{data.subscription.currentPeriodEndsAt ? new Date(data.subscription.currentPeriodEndsAt).toLocaleDateString() : "No paid renewal"}</p><p className="mt-2 text-xs text-muted-foreground">{data.subscription.stateReason}</p></article><article className="nexus-card p-5"><p className="nexus-kicker">VOICE READINESS</p><p className="mt-2 flex items-center gap-2 text-sm"><Volume2 className="size-4 text-primary" />{voice.data?.configured ? "Configured" : "Not configured"}</p><p className="mt-2 text-xs text-muted-foreground">No audio is generated without a real provider.</p></article></section>
      <section className="nexus-card overflow-hidden"><div className="flex flex-col gap-3 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><Gauge className="size-4 text-primary" /><h2 className="font-semibold">Feature access and usage</h2></div><p className="mt-1 text-sm text-muted-foreground">Review the remaining capacity for each metered feature and the server decision for every available capability.</p></div><div className="flex flex-wrap gap-1" role="tablist" aria-label="Subscription feature filters">{(["all", "usage", "available", "locked"] as FeatureState[]).map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filter === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{item === "all" ? "All" : item === "usage" ? "Usage limits" : item === "available" ? "Available" : "Locked"}</button>)}</div></div><div className="divide-y divide-border">{visibleFeatures.map((feature) => <article key={feature.featureKey} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_minmax(11rem,0.85fr)_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{readableFeature(feature.featureKey)}</h3><span className={`nexus-status-pill ${feature.allowed ? "nexus-status-pill--success" : "nexus-status-pill--neutral"}`}>{feature.allowed ? <CheckCircle2 className="size-3" /> : <LockKeyhole className="size-3" />}{feature.allowed ? "Available" : `Requires ${feature.requiredPlan}`}</span></div><p className="mt-1 text-xs text-muted-foreground">Server decision: {feature.reasonCode.replaceAll("_", " ")}</p></div><UsageMeter usage={feature.usage} locked={!feature.allowed} /><div className="flex items-center gap-2 text-xs text-muted-foreground">{feature.usage?.remaining === 0 ? <CircleAlert className="size-4 text-warning" /> : null}{feature.usage?.remaining === 0 ? "Limit reached" : feature.usage ? "Current period" : "Feature policy"}</div></article>)}{visibleFeatures.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No features match this filter. The plan and usage data remain unchanged.</div> : null}</div></section>
      <section className="nexus-card p-5"><h2 className="font-semibold">Billing actions</h2><p className="mt-2 text-sm text-muted-foreground">Upgrade, downgrade, cancellation, and billing history remain unavailable until a payment provider is configured and verified. No account is charged by this page.</p><div className="mt-4 flex flex-wrap gap-2"><Button disabled>Upgrade unavailable</Button><Button disabled variant="outline">Downgrade unavailable</Button><Button disabled variant="outline">Cancel unavailable</Button></div></section></> : <section className="nexus-card p-5"><h1 className="font-semibold">Subscription data is unavailable</h1><p className="mt-2 text-sm text-muted-foreground">The billing account could not be loaded. No plan change has occurred.</p></section>}
  </main>;
}
