import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Check, LockKeyhole, Sparkles } from "lucide-react";

const planOrder = ["FREE", "PRO", "ELITE"] as const;
const highlights: Record<(typeof planOrder)[number], readonly string[]> = {
  FREE: ["Verified market context", "Core Intelligence and risk controls", "3 strategies and 5 backtests per month", "20 evidence-grounded Copilot requests per month"],
  PRO: ["Advanced market and Intelligence context", "Parameter search and expanded research", "25 strategies and 80 backtests per month", "Advanced Copilot, alerts, and portfolio context"],
  ELITE: ["Full research and advanced AI catalog", "Expanded evidence and monitoring capacity", "No configured product-limit cap", "Premium voice readiness when a provider is configured"],
};

function PlanPreview({ plan }: { plan: (typeof planOrder)[number] }) {
  const preview = trpc.subscriptions.upgradePreview.useQuery({ targetPlan: plan }, { enabled: false, retry: false });
  const canPreview = !preview.isFetching;
  return <Button className="w-full" variant={plan === "PRO" ? "default" : "outline"} disabled={!canPreview} onClick={() => { void preview.refetch(); }}>
    {preview.isFetching ? "Preparing plan details…" : preview.data ? "Payments not configured" : `Review ${plan}`}
  </Button>;
}

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const plans = trpc.subscriptions.plans.useQuery();
  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
    <section className="nexus-card nexus-card--hero flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl"><p className="nexus-kicker">NEXUS PLANS</p><h1 className="text-2xl font-semibold tracking-tight">Research access, governed by evidence.</h1><p className="mt-2 text-sm text-muted-foreground">Plans organize access and server-enforced monthly limits. They do not change the paper-only execution boundary or imply trading performance.</p></div>
      <div className="nexus-status-pill nexus-status-pill--neutral"><LockKeyhole className="size-3.5" /> Payments not configured</div>
    </section>
    <section className="grid gap-4 lg:grid-cols-3" aria-label="Nexus plans">
      {planOrder.map((plan) => {
        const config = plans.data?.plans[plan];
        const recommended = plan === "PRO";
        return <article key={plan} className={`nexus-card flex min-h-[29rem] flex-col p-5 ${recommended ? "ring-1 ring-primary/50" : ""}`}>
          <div className="flex items-start justify-between gap-3"><div><p className="nexus-kicker">NEXUS {plan}</p><h2 className="mt-1 text-xl font-semibold">{plan === "FREE" ? "Start with verified context" : plan === "PRO" ? "Expand your research" : "Maximum research capacity"}</h2></div>{recommended ? <span className="nexus-status-pill nexus-status-pill--info"><Sparkles className="size-3.5" /> Recommended</span> : null}</div>
          <p className="mt-4 text-sm text-muted-foreground">{plan === "FREE" ? "A bounded, evidence-first workspace." : plan === "PRO" ? "For deeper paper research and controlled iteration." : "For teams needing the complete configured research catalog."}</p>
          <ul className="mt-5 flex flex-1 flex-col gap-3 text-sm">{highlights[plan].map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />{item}</li>)}</ul>
          <div className="mt-5 border-t border-border pt-4"><p className="mb-3 text-xs text-muted-foreground">{config ? `${config.enabled.length} configured feature permissions` : "Loading configured limits…"}</p>{isAuthenticated ? <PlanPreview plan={plan} /> : <Button className="w-full" variant={plan === "PRO" ? "default" : "outline"} onClick={() => startLogin()}>Sign in to review access</Button>}</div>
        </article>;
      })}
    </section>
    <p className="text-center text-xs text-muted-foreground">No checkout, payment capture, or real-money trading is enabled in this release. A configured payment provider is required before any billing action can be offered.</p>
  </main>;
}
