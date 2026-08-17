import { useMarketIntelligenceOverview } from "@/hooks/useMarketIntelligence";
import { getLiveRefreshControlState, useLiveRateLimitStatus } from "@/hooks/useLiveMarketData";
import { LiveDataRateLimitNotice } from "@/components/LiveDataRateLimitNotice";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, CandlestickChart, Gauge, Loader2, Radar,
  RefreshCcw, ShieldAlert, ShieldCheck, Sparkles, FlaskConical, ClipboardCheck, TrendingDown,
  TrendingUp, Waves, CircleGauge, LockKeyhole, Clock3,
} from "lucide-react";
import { Link } from "wouter";
import { NexusDensityControl } from "@/components/NexusDensityControl";

export default function Dashboard() {
  const { user } = useAuth();
  const { t, formatDateTime } = useLanguage();
  const marketQuery = useMarketIntelligenceOverview();
  const commandQuery = trpc.nexusCommand.overview.useQuery(undefined, { enabled: Boolean(user), refetchInterval: user ? 30_000 : false });
  const activityQuery = trpc.nexusCommand.timeline.useQuery({ limit: 5 }, { enabled: Boolean(user), refetchInterval: user ? 30_000 : false });
  const overview = marketQuery.data?.success ? marketQuery.data.data : null;
  const providerError = marketQuery.data?.success === false ? marketQuery.data.error : null;
  const unavailable = providerError?.message ?? marketQuery.error?.message ?? null;
  const rateLimit = useLiveRateLimitStatus(marketQuery.data);
  const refreshControl = getLiveRefreshControlState({ isOnline: marketQuery.isOnline, isFetching: marketQuery.isFetching, isRateLimited: rateLimit.isRateLimited });
  const command = commandQuery.data;
  const riskScore = command?.risk.overallScore ?? null;
  const monitoringStatus = command?.health.engineStatus ?? null;

  return (
    <main className="min-h-full text-foreground">
      <section className="container nexus-density-stack py-5 sm:py-7 lg:py-8">
        <header className="nexus-card nexus-card--hero nexus-density-card p-5 sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="nexus-eyebrow">{t("commandHeroEyebrow")}</p>
              <h1 className="nexus-page-title mt-3">{t("commandHeroTitle")}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">{t("commandHeroDescription")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <NexusDensityControl />
              <Link href="/scanner" className="inline-flex items-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-3.5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none">
                <Radar className="size-4" aria-hidden="true" /> {t("riskSignals")}
              </Link>
              <button type="button" onClick={() => void marketQuery.refetch()} disabled={refreshControl.disabled} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/72 px-3.5 py-2.5 text-sm font-semibold text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCcw className={`size-4 ${marketQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
                {marketQuery.isFetching ? t("refreshing") : t("refreshAnalysis")}
              </button>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/5 pt-5 text-xs" aria-live="polite">
            <StatusPill label={user && monitoringStatus ? monitoringStatus : t("systemStatus")} tone={monitoringStatus === "OPERATIONAL" ? "success" : monitoringStatus ? "warning" : "primary"} />
            <StatusPill label={marketQuery.isOnline ? t("online") : t("offline")} tone={marketQuery.isOnline ? "success" : "warning"} />
            {overview ? <StatusPill label={overview.isStale ? t("marketEvidenceStale") : t("marketEvidenceLive")} tone={overview.isStale ? "warning" : "success"} /> : null}
            {overview ? <StatusPill label={overview.source} tone="primary" /> : null}
            {overview ? <span className="text-foreground-muted">{t("updated")} {formatDateTime(overview.generatedAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
          </div>
        </header>

        {rateLimit.isRateLimited ? <LiveDataRateLimitNotice retryAfterSeconds={rateLimit.retryAfterSeconds} onRetry={() => void marketQuery.refetch()} /> : null}
        {unavailable ? <UnavailableNotice title={t("marketUnavailableTitle")} detail={unavailable} /> : null}

        {marketQuery.isLoading && !overview ? <OverviewSkeleton label={t("loading")} /> : (
          <>
            <section aria-label={t("systemStatus")} className="nexus-card nexus-density-card p-4 sm:p-5">
              <div className="nexus-section-header gap-4 border-b border-border/70 pb-4">
                <div><p className="nexus-eyebrow">{t("systemStatus")}</p><h2 className="mt-1 text-lg font-semibold">{t("liveRiskOverview")}</h2></div>
                <p className="max-w-xl text-xs leading-5 text-foreground-secondary">{t("riskEvidenceDetail")}</p>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
                <RiskVisualization score={riskScore} unavailable={t("insufficientData")} />
                <div className="nexus-data-grid grid-cols-2 sm:grid-cols-3">
                  <CommandMetric label={t("activePositions")} value={command ? String(command.counts.activePositions) : "—"} icon={Activity} />
                  <CommandMetric label={t("openAlerts")} value={command ? String(command.counts.activeAlerts) : "—"} icon={AlertTriangle} tone={command?.counts.activeAlerts ? "warning" : "primary"} />
                  <CommandMetric label={t("pendingApprovals")} value={command ? String(command.counts.pendingApprovals) : "—"} icon={Clock3} tone={command?.counts.pendingApprovals ? "warning" : "primary"} />
                  <CommandMetric label={t("monitoringHealth")} value={command?.health.dataFreshnessState ?? t("insufficientData")} icon={ShieldCheck} tone={monitoringStatus === "OPERATIONAL" ? "success" : "primary"} />
                  <CommandMetric label={t("marketRegime")} value={overview ? displayRegime(overview.overallRegime) : t("requestUnavailable")} icon={Waves} tone={overview ? regimeTone(overview.overallRegime) : "primary"} />
                  <CommandMetric label={t("volatilityContext")} value={overview ? displayRegime(overview.volatility) : t("requestUnavailable")} icon={Gauge} tone={overview?.volatility === "HIGH" ? "warning" : "primary"} />
                </div>
              </div>
            </section>

            <section className="nexus-density-grid grid gap-3 lg:grid-cols-4" aria-label={t("quickActions")}>
              <WorkspaceLink href="/chart" eyebrow={t("verifiedOhlcv")} title={t("chartWorkspaceLink")} detail={t("inspectCandles")} icon={CandlestickChart} />
              <WorkspaceLink href="/strategy-lab" eyebrow={t("researchWorkflow")} title={t("strategyLabLink")} detail={t("buildBacktests")} icon={FlaskConical} />
              <WorkspaceLink href="/risk-settings" eyebrow={t("tradeProtection")} title={t("riskEngineLink")} detail={t("reviewRiskGates")} icon={ShieldAlert} />
              <WorkspaceLink href="/audit-log" eyebrow={t("decisionEvidence")} title={t("auditTrailLink")} detail={t("reviewAudit")} icon={ClipboardCheck} />
            </section>

            {overview ? <>
              <MarketOverviewTable rows={overview.majorMovements} title={t("marketIntelligence")} description={t("evidenceBoundaryDescription")} actionLabel={t("viewScanner")} actionHref="/scanner" empty={t("noEvidence")} />

              <div className="nexus-density-grid grid gap-5 xl:grid-cols-2">
                <IntelligenceList title={t("highestModeledRisk")} eyebrow={t("riskContext")} icon={ShieldAlert} rows={overview.highestRisk.map((row) => ({ id: row.assetId, name: `${row.name} · ${row.symbol}`, value: `${row.riskScore}/100`, detail: row.riskFactors[0] ?? `${displayRegime(row.volatility)} · ${shortTrend(row.trend)}`, tone: row.riskScore >= 60 ? "danger" : "warning" }))} empty={t("noEvidence")} />
                <IntelligenceList title={t("majorMovements")} eyebrow={t("priceContext")} icon={BarChart3} rows={overview.majorMovements.map((row) => ({ id: row.assetId, name: `${row.name} · ${row.symbol}`, value: formatPercent(row.priceChange24hPercent), detail: `${formatPrice(row.priceUsd)} · ${displayRegime(row.regime)}`, tone: (row.priceChange24hPercent ?? 0) >= 0 ? "success" : "danger" }))} empty={t("noEvidence")} />
              </div>
            </> : <EmptyState copy={t("noResponse")} />}

            <section className="nexus-card nexus-density-card p-4 sm:p-5">
              <div className="nexus-section-header gap-4"><div><p className="nexus-eyebrow">{t("activity")}</p><h2 className="mt-1 text-lg font-semibold">{t("activityTimeline")}</h2></div><Link href="/nexus-command#activity" className="text-sm font-semibold text-primary hover:text-primary-light">{t("viewAll")}</Link></div>
              {!user ? <div className="nexus-empty-state mt-4"><LockKeyhole className="size-5 text-primary" aria-hidden="true" /><p className="mt-3 text-sm">{t("signInCommand")}</p></div> : activityQuery.isLoading ? <div className="mt-4 flex min-h-28 items-center justify-center text-foreground-secondary"><Loader2 className="size-5 animate-spin" aria-hidden="true" /><span className="sr-only">{t("loading")}</span></div> : activityQuery.data?.length ? <div className="mt-4 divide-y divide-border/70">{activityQuery.data.map((event) => <Link href="/nexus-command#activity" key={event.id} className="flex items-center justify-between gap-4 py-3 text-start hover:bg-background-secondary/35"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{event.eventType}</span><span className="mt-1 block truncate text-xs text-foreground-secondary">{event.source}</span></span><span className="shrink-0 text-xs text-foreground-muted">{formatDateTime(event.occurredAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></Link>)}</div> : <div className="nexus-empty-state mt-4"><p className="text-sm">{t("noTimeline")}</p></div>}
            </section>

            <section className="nexus-card nexus-density-card p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="nexus-eyebrow"><Sparkles className="me-1.5 inline size-3.5" aria-hidden="true" />{t("evidenceBoundary")}</p><h2 className="mt-1 text-lg font-semibold">{t("whatNexusMeasures")}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-foreground-secondary">{t("evidenceBoundaryDescription")}</p></div><span className="nexus-status-pill" data-status="warning"><span className="nexus-status-dot" />{t("researchOnly")}</span></div>
              {overview && overview.omittedAssets.length > 0 ? <p className="mt-4 text-xs text-foreground-muted">{overview.omittedAssets.length} {t("omittedAssets")}</p> : null}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function RiskVisualization({ score, unavailable }: { score: number | null; unavailable: string }) {
  const tone = score === null ? "var(--foreground-tertiary)" : score >= 70 ? "var(--danger)" : score >= 40 ? "var(--warning)" : "var(--success)";
  const fill = score === null ? 0 : Math.min(100, Math.max(0, score));
  return <div className="nexus-card flex min-h-48 flex-col justify-between p-5"><div><p className="nexus-eyebrow">Risk</p><h3 className="mt-1 text-base font-semibold">Live risk overview</h3></div><div className="mt-5 flex items-end gap-4"><div className="grid size-24 place-items-center rounded-full p-[9px]" style={{ background: `conic-gradient(${tone} ${fill}%, rgba(148,163,184,.15) 0)` }}><div className="grid size-full place-items-center rounded-full bg-card text-center"><span className="nexus-numeric text-xl font-bold">{score ?? "—"}</span><span className="text-[9px] uppercase tracking-[.1em] text-foreground-muted">/100</span></div></div><p className="max-w-24 text-xs leading-5 text-foreground-secondary">{score === null ? unavailable : "Stored evidence only"}</p></div></div>;
}

function MarketOverviewTable({ rows, title, description, actionLabel, actionHref, empty }: { rows: Array<{ assetId: string; name: string; symbol: string; priceUsd: number; priceChange24hPercent: number | null; regime: string; trend: string; riskScore: number | null; signalStrength: number | null }>; title: string; description: string; actionLabel: string; actionHref: string; empty: string }) {
  return <section className="nx-panel overflow-hidden" aria-label={title}>
    <div className="nx-panel-header flex flex-wrap items-center justify-between gap-3"><div><p className="nexus-eyebrow">Market overview</p><h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2><p className="mt-1 text-xs text-foreground-secondary">{description}</p></div><Link href={actionHref} className="nx-button inline-flex items-center gap-1.5 border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none">{actionLabel}<ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" /></Link></div>
    {rows.length ? <div className="overflow-x-auto"><table className="nx-table min-w-[720px] w-full text-left text-xs"><thead><tr><th className="px-3 py-2.5 font-semibold">Asset</th><th className="px-3 py-2.5 text-right font-semibold">Price</th><th className="px-3 py-2.5 text-right font-semibold">24h</th><th className="px-3 py-2.5 text-right font-semibold">Trend</th><th className="px-3 py-2.5 text-right font-semibold">Risk</th><th className="px-3 py-2.5 text-right font-semibold">Signal</th></tr></thead><tbody>{rows.map((row) => <tr key={row.assetId}><td className="px-3 py-2.5"><Link href={`/assets/${row.assetId}`} className="group flex items-center gap-2 focus-visible:outline-none"><span className="grid size-5 place-items-center rounded-sm border border-primary/25 bg-primary/10 text-[9px] font-bold text-primary">{row.symbol.slice(0, 1)}</span><span><span className="block font-semibold text-foreground group-hover:text-primary">{row.name}</span><span className="block text-[10px] text-foreground-muted">{row.symbol}</span></span></Link></td><td className="nx-number px-3 py-2.5 text-right font-semibold text-foreground">{formatPrice(row.priceUsd)}</td><td className={`nx-number px-3 py-2.5 text-right font-semibold ${(row.priceChange24hPercent ?? 0) >= 0 ? "text-success" : "text-danger"}`}>{formatPercent(row.priceChange24hPercent)}</td><td className="px-3 py-2.5 text-right"><span className="inline-flex items-center gap-1 text-foreground-secondary"><span className={`size-1.5 rounded-full ${row.trend === "UPTREND" ? "bg-success" : row.trend === "DOWNTREND" ? "bg-danger" : "bg-warning"}`} />{shortTrend(row.trend)}</span></td><td className="nx-number px-3 py-2.5 text-right text-foreground-secondary">{row.riskScore ?? "—"}</td><td className="nx-number px-3 py-2.5 text-right text-primary">{row.signalStrength ?? "—"}</td></tr>)}</tbody></table></div> : <EmptyState copy={empty} />}
  </section>;
}

function CommandMetric({ label, value, icon: Icon, tone = "primary" }: { label: string; value: string; icon: typeof Activity; tone?: Tone }) { return <article className="p-4"><Icon className={`size-4 ${toneClass(tone)}`} aria-hidden="true" /><p className="mt-5 nexus-metric-label">{label}</p><p className={`mt-1 truncate text-base font-semibold ${toneClass(tone)}`}>{value}</p></article>; }
function WorkspaceLink({ href, eyebrow, title, detail, icon: Icon }: { href: string; eyebrow: string; title: string; detail: string; icon: typeof Activity }) { return <Link href={href} className="nexus-card nexus-card--interactive nexus-density-card group p-4 focus-visible:outline-none"><div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="size-4" /></span><ArrowRight className="size-4 text-foreground-muted transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></div><p className="mt-4 nexus-eyebrow text-[10px]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2><p className="mt-1 text-xs leading-5 text-foreground-secondary">{detail}</p></Link>; }
function IntelligenceList({ title, eyebrow, icon: Icon, rows, empty }: { title: string; eyebrow: string; icon: typeof Activity; rows: Array<{ id: string; name: string; value: string; detail: string; tone: Tone }>; empty: string }) { return <section className="nexus-card overflow-hidden"><div className="flex items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-5"><Icon className="size-4 text-primary" aria-hidden="true" /><div><p className="nexus-eyebrow text-[10px]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold">{title}</h2></div></div>{rows.length ? <div className="divide-y divide-border/70">{rows.map((row) => <Link key={row.id} href={`/assets/${row.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-background-secondary/35 focus-visible:outline-none sm:px-5"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{row.name}</span><span className="mt-0.5 block truncate text-xs text-foreground-secondary">{row.detail}</span></span><span className={`nexus-numeric shrink-0 text-sm font-semibold ${toneClass(row.tone)}`}>{row.value}</span></Link>)}</div> : <EmptyState copy={empty} />}</section>; }
function MiniMetric({ label, value, tone }: { label: string; value: string; tone: Tone }) { return <div><p className="text-[10px] uppercase tracking-[0.1em] text-foreground-muted">{label}</p><p className={`nexus-numeric mt-0.5 truncate font-semibold ${toneClass(tone)}`}>{value}</p></div>; }
function StatusPill({ label, tone }: { label: string; tone: Tone }) { const status = tone === "success" ? "positive" : tone === "warning" ? "warning" : tone === "danger" ? "danger" : undefined; return <span className="nexus-status-pill" data-status={status}><span className="nexus-status-dot" />{label}</span>; }
function UnavailableNotice({ title, detail }: { title: string; detail: string }) { return <section className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/8 p-4" role="status"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><p className="text-sm font-semibold text-warning">{title}</p><p className="mt-1 text-sm text-foreground-secondary">{detail}</p></div></section>; }
function OverviewSkeleton({ label }: { label: string }) { return <div className="space-y-5" aria-label={label} aria-busy="true" role="status"><span className="sr-only">{label}</span><div className="h-52 animate-pulse rounded-2xl border border-border bg-card/60" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-border bg-card/60" />)}</div><div className="h-80 animate-pulse rounded-2xl border border-border bg-card/60" /></div>; }
function EmptyState({ copy }: { copy: string }) { return <div className="nexus-empty-state"><Radar className="size-7 text-foreground-muted" aria-hidden="true" /><p className="mt-3 max-w-md text-sm text-foreground-secondary">{copy}</p></div>; }
type Tone = "primary" | "success" | "danger" | "warning" | "foreground";
function toneClass(tone: Tone) { return tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "foreground" ? "text-foreground" : "text-primary"; }
function regimeTone(regime: string): Tone { return regime === "TRENDING_BULLISH" ? "success" : regime === "TRENDING_BEARISH" ? "danger" : regime === "HIGH_VOLATILITY" ? "warning" : "primary"; }
function displayRegime(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function shortTrend(value: string) { return value === "UPTREND" ? "Up" : value === "DOWNTREND" ? "Down" : value === "RANGE" ? "Range" : "Mixed"; }
function formatPercent(value: number | null) { return value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function formatPrice(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1 ? 2 : 6 }).format(value); }
