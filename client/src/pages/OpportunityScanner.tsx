import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { ArrowLeft, ArrowRight, BarChart3, CircleAlert, Filter, Radar, RefreshCcw, ShieldAlert, Sparkles } from "lucide-react";
import { Link } from "wouter";
import {
  useOpportunityScanner,
  type IntelligenceTimeframe,
  type IntelligenceTrend,
} from "@/hooks/useMarketIntelligence";
import { getLiveRefreshControlState, useLiveRateLimitStatus } from "@/hooks/useLiveMarketData";
import { LiveDataRateLimitNotice } from "@/components/LiveDataRateLimitNotice";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ScannerResponse = RouterOutputs["intelligence"]["scanner"];
type ScannerData = Extract<ScannerResponse, { success: true }>["data"];
type ScannerRow = ScannerData["rows"][number];

const supportedMarkets = [
  ["", "All supported markets"],
  ["bitcoin", "Bitcoin · BTC"],
  ["ethereum", "Ethereum · ETH"],
  ["solana", "Solana · SOL"],
  ["binancecoin", "BNB"],
  ["ripple", "XRP"],
  ["cardano", "Cardano · ADA"],
  ["dogecoin", "Dogecoin · DOGE"],
  ["chainlink", "Chainlink · LINK"],
] as const;

type SortMode = "opportunity" | "risk" | "signal" | "volume";

export default function OpportunityScanner() {
  const [assetId, setAssetId] = useState<(typeof supportedMarkets)[number][0]>("");
  const [timeframe, setTimeframe] = useState<IntelligenceTimeframe>("4h");
  const [minimumOpportunity, setMinimumOpportunity] = useState(0);
  const [maximumRisk, setMaximumRisk] = useState(100);
  const [minimumVolumeUsd, setMinimumVolumeUsd] = useState(0);
  const [trend, setTrend] = useState<"" | IntelligenceTrend>("");
  const [sort, setSort] = useState<SortMode>("opportunity");

  const query = useOpportunityScanner({
    assetId: assetId || undefined,
    timeframe,
    minimumOpportunity,
    maximumRisk,
    minimumVolumeUsd,
    trend: trend || undefined,
  });
  const response = query.data;
  const data = response?.success ? response.data : null;
  const error = response?.success === false ? response.error.message : query.error?.message ?? null;
  const rateLimit = useLiveRateLimitStatus(response);
  const refreshControl = getLiveRefreshControlState({ isOnline: query.isOnline, isFetching: query.isFetching, isRateLimited: rateLimit.isRateLimited });
  const rows = useMemo(() => sortRows(data?.rows ?? [], sort), [data?.rows, sort]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="container py-5 sm:py-7">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" />Back to overview</Link>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Nexus intelligence</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Opportunity scanner</h1>
              <p className="mt-1 max-w-2xl text-sm text-foreground-secondary">Rank supported assets using real evidence and explainable indexes. No row is a trade instruction or profit probability.</p>
            </div>
            <button type="button" onClick={() => void query.refetch()} disabled={refreshControl.disabled} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"><RefreshCcw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />{query.isFetching ? "Scanning" : "Refresh scan"}</button>
          </div>
        </div>
      </header>

      <div className="container space-y-5 py-5 sm:py-7 lg:py-8">
        <section className="rounded-2xl border border-border bg-card/75 p-4 shadow-[0_18px_60px_rgba(3,7,34,0.13)] sm:p-5" aria-labelledby="scanner-filters-title">
          <div className="mb-4 flex items-center gap-2"><Filter className="size-4 text-primary" aria-hidden="true" /><h2 id="scanner-filters-title" className="text-base font-semibold">Evidence filters</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <FilterSelect label="Market" value={assetId} onChange={(value) => setAssetId(value as typeof assetId)} options={supportedMarkets.map(([value, label]) => ({ value, label }))} />
            <FilterSelect label="Timeframe" value={timeframe} onChange={(value) => setTimeframe(value as IntelligenceTimeframe)} options={["5m", "15m", "1h", "4h", "1d"].map((value) => ({ value, label: value === "1d" ? "1D" : value }))} />
            <FilterSelect label="Minimum opportunity" value={String(minimumOpportunity)} onChange={(value) => setMinimumOpportunity(Number(value))} options={[0, 25, 50, 70].map((value) => ({ value: String(value), label: `${value}/100` }))} />
            <FilterSelect label="Maximum risk" value={String(maximumRisk)} onChange={(value) => setMaximumRisk(Number(value))} options={[100, 75, 50, 25].map((value) => ({ value: String(value), label: `${value}/100` }))} />
            <FilterSelect label="24h volume" value={String(minimumVolumeUsd)} onChange={(value) => setMinimumVolumeUsd(Number(value))} options={[{ value: "0", label: "Any volume" }, { value: "100000000", label: "$100M+" }, { value: "1000000000", label: "$1B+" }, { value: "5000000000", label: "$5B+" }]} />
            <FilterSelect label="Trend" value={trend} onChange={(value) => setTrend(value as typeof trend)} options={[{ value: "", label: "Any trend" }, { value: "UPTREND", label: "Uptrend" }, { value: "DOWNTREND", label: "Downtrend" }, { value: "RANGE", label: "Range" }, { value: "MIXED", label: "Mixed" }]} />
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusPill label={query.isOnline ? "Online" : "Offline"} tone={query.isOnline ? "success" : "warning"} />
            {data ? <StatusPill label={data.isStale ? "Stale evidence" : "Live evidence"} tone={data.isStale ? "warning" : "success"} /> : null}
            {data ? <span className="text-foreground-muted">{data.rows.length} ranked · {data.omitted.length} omitted · {formatTimestamp(data.scannedAt)}</span> : null}
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground-secondary">Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none">
              <option value="opportunity">Opportunity · high to low</option><option value="risk">Risk · low to high</option><option value="signal">Signal · high to low</option><option value="volume">24h volume · high to low</option>
            </select>
          </label>
        </div>

        {error ? <section className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/8 p-4" role="status"><CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><p className="text-sm font-semibold text-warning">Scanner data is unavailable</p><p className="mt-1 text-sm text-foreground-secondary">{error}</p></div></section> : null}
        {rateLimit.isRateLimited ? <LiveDataRateLimitNotice retryAfterSeconds={rateLimit.retryAfterSeconds} onRetry={() => void query.refetch()} /> : null}

        {query.isLoading && !data ? <ScannerSkeleton /> : data ? (
          <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl" aria-labelledby="scanner-results-title">
            <div className="border-b border-border px-4 py-4 sm:px-5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Current evidence</p><h2 id="scanner-results-title" className="mt-1 text-lg font-semibold">Ranked assets</h2></div>
            {rows.length ? <><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b border-border bg-background-secondary/55 text-[11px] uppercase tracking-[0.1em] text-foreground-muted"><tr><TableHead>Asset</TableHead><TableHead>Price / 24h</TableHead><TableHead>Regime</TableHead><TableHead>Trend</TableHead><TableHead>Opportunity</TableHead><TableHead>Risk</TableHead><TableHead>Signal</TableHead><TableHead>Volume</TableHead><TableHead><span className="sr-only">Open</span></TableHead></tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <ScannerTableRow key={row.assetId} row={row} />)}</tbody></table></div><div className="grid gap-3 p-4 lg:hidden">{rows.map((row) => <ScannerCard key={row.assetId} row={row} />)}</div></> : <EmptyScanner omitted={data.omitted} />}
          </section>
        ) : <EmptyScanner omitted={[]} />}

        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 size-5 text-primary" aria-hidden="true" /><div><h2 className="text-sm font-semibold">How ranking works</h2><p className="mt-1 text-sm leading-6 text-foreground-secondary">Nexus ranks only assets with sufficient structure, momentum, volatility, and multi-timeframe evidence. Opportunity, risk, and signal strength are separate analytical indexes; unavailable evidence removes the asset instead of creating a neutral score.</p></div></div></section>
      </div>
    </main>
  );
}

function ScannerTableRow({ row }: { row: ScannerRow }) {
  return <tr className="hover:bg-background-secondary/35"><td className="px-4 py-3.5 sm:px-5"><Link href={`/assets/${row.assetId}`} className="font-semibold hover:text-primary focus-visible:outline-none">{row.name} <span className="text-foreground-muted">{row.symbol}</span></Link><p className="mt-0.5 text-xs text-foreground-muted">{row.primaryTimeframe} · {row.source}</p></td><td className="px-4 py-3.5"><span className="font-mono font-semibold">{formatPrice(row.priceUsd)}</span><p className={`mt-0.5 font-mono text-xs ${Number(row.priceChange24hPercent ?? 0) >= 0 ? "text-success" : "text-danger"}`}>{formatPercent(row.priceChange24hPercent)}</p></td><td className="px-4 py-3.5 text-xs font-semibold">{humanize(row.regime)}</td><td className="px-4 py-3.5 text-xs">{humanize(row.trend)}</td><ScoreCell value={row.opportunityScore} tone="primary" /><ScoreCell value={row.riskScore} tone={row.riskScore >= 60 ? "danger" : "warning"} /><ScoreCell value={row.signalStrength} tone="foreground" /><td className="px-4 py-3.5 font-mono text-xs">{formatCompact(row.volume24hUsd)}</td><td className="px-4 py-3.5"><Link href={`/assets/${row.assetId}`} aria-label={`Open ${row.name} intelligence`} className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-foreground-secondary hover:border-primary/50 hover:text-primary focus-visible:outline-none"><ArrowRight className="size-4" aria-hidden="true" /></Link></td></tr>;
}

function ScannerCard({ row }: { row: ScannerRow }) {
  return <Link href={`/assets/${row.assetId}`} className="rounded-xl border border-border bg-background-secondary/45 p-4 focus-visible:outline-none"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{row.name} <span className="text-foreground-muted">{row.symbol}</span></h3><p className="mt-1 text-xs text-foreground-secondary">{humanize(row.regime)} · {row.primaryTimeframe}</p></div><span className="font-mono text-lg font-semibold text-primary">{row.opportunityScore}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><CardDatum label="Risk" value={`${row.riskScore}`} tone={row.riskScore >= 60 ? "danger" : "warning"} /><CardDatum label="Signal" value={`${row.signalStrength}`} tone="foreground" /><CardDatum label="Trend" value={humanize(row.trend)} tone="foreground" /></div><div className="mt-3 flex items-center justify-between text-xs"><span className="font-mono">{formatPrice(row.priceUsd)}</span><span className={(row.priceChange24hPercent ?? 0) >= 0 ? "text-success" : "text-danger"}>{formatPercent(row.priceChange24hPercent)}</span></div></Link>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="text-xs font-semibold text-foreground-secondary"><span className="mb-1.5 block">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-border bg-background-secondary px-3 py-2.5 text-sm font-medium text-foreground focus-visible:outline-none">{options.map((option) => <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>; }
function TableHead({ children }: { children: React.ReactNode }) { return <th scope="col" className="px-4 py-3 font-semibold first:pl-5 last:pr-5">{children}</th>; }
function ScoreCell({ value, tone }: { value: number; tone: "primary" | "danger" | "warning" | "foreground" }) { return <td className={`px-4 py-3.5 font-mono font-semibold ${toneClass(tone)}`}>{value}</td>; }
function CardDatum({ label, value, tone }: { label: string; value: string; tone: "danger" | "warning" | "foreground" }) { return <div><p className="text-[10px] uppercase tracking-[0.1em] text-foreground-muted">{label}</p><p className={`mt-0.5 truncate text-xs font-semibold ${toneClass(tone)}`}>{value}</p></div>; }
function StatusPill({ label, tone }: { label: string; tone: "success" | "warning" }) { return <span className={`rounded-full border px-2.5 py-1 font-semibold ${tone === "success" ? "border-success/30 bg-success/8 text-success" : "border-warning/30 bg-warning/8 text-warning"}`}>{label}</span>; }
function EmptyScanner({ omitted }: { omitted: Array<{ assetId: string; reason: string }> }) { return <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center"><Radar className="size-8 text-foreground-muted" aria-hidden="true" /><h3 className="mt-3 text-base font-semibold">No qualifying opportunity evidence</h3><p className="mt-2 max-w-lg text-sm leading-6 text-foreground-secondary">Adjust filters or retry when the public data feeds are available. {omitted.length ? `${omitted.length} asset${omitted.length === 1 ? " was" : "s were"} omitted because required evidence was unavailable.` : ""}</p></div>; }
function ScannerSkeleton() { return <div className="space-y-3 rounded-2xl border border-border bg-card/75 p-5" aria-label="Loading scanner results" aria-busy="true" role="status"><span className="sr-only">Loading scanner results</span>{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-background-secondary" />)}</div>; }
function sortRows(rows: ScannerRow[], sort: SortMode) { return [...rows].sort((left, right) => sort === "risk" ? left.riskScore - right.riskScore : sort === "signal" ? right.signalStrength - left.signalStrength : sort === "volume" ? (right.volume24hUsd ?? 0) - (left.volume24hUsd ?? 0) : right.opportunityScore - left.opportunityScore || left.riskScore - right.riskScore); }
function toneClass(tone: string) { return tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "text-foreground"; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatTimestamp(value: number) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function formatPrice(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1 ? 2 : 6 }).format(value); }
function formatPercent(value: number | null) { return value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function formatCompact(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value); }
