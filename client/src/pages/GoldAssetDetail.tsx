import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, CircleAlert, RefreshCw, ShieldAlert, Star } from "lucide-react";
import { Link } from "wouter";
import CandlestickChart from "@/components/CandlestickChart";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

const labels: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W", "1mo": "1M" };

function money(value: number | null | undefined, loading = false) {
  return value === null || value === undefined ? (loading ? "Loading verified data…" : "DATA UNAVAILABLE") : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "DATA UNAVAILABLE" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function providerMessage(error: { code: string; message: string } | null | undefined) {
  return error?.message ?? "MARKET DATA TEMPORARILY UNAVAILABLE";
}

export default function GoldAssetDetail() {
  const [timeframe, setTimeframe] = useState<"1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1mo">("1h");
  const auth = useAuth();
  const utils = trpc.useUtils();
  const capabilities = trpc.commodityMarket.capabilities.useQuery({ assetId: "xau-usd" }, { staleTime: 60_000, retry: 1 });
  const quote = trpc.commodityMarket.quote.useQuery({ assetId: "xau-usd" }, { staleTime: 60_000, refetchInterval: 60_000, retry: 1 });
  const capabilityData = capabilities.data?.success ? capabilities.data.data : null;
  const supportedTimeframes = capabilityData?.supportedTimeframes ?? [];
  const candles = trpc.commodityMarket.candles.useQuery({ assetId: "xau-usd", timeframe, limit: 80 }, { enabled: supportedTimeframes.includes(timeframe), staleTime: 60_000, refetchInterval: 60_000, retry: 1 });
  const watchlist = trpc.commodityMarket.watchlist.useQuery(undefined, { enabled: auth.isAuthenticated, staleTime: 30_000 });
  const addWatch = trpc.commodityMarket.addGoldToWatchlist.useMutation({ onSuccess: () => void utils.commodityMarket.watchlist.invalidate() });
  const removeWatch = trpc.commodityMarket.removeGoldFromWatchlist.useMutation({ onSuccess: () => void utils.commodityMarket.watchlist.invalidate() });
  const quoteData = quote.data?.success ? quote.data.data : null;
  const candleData = candles.data?.success ? candles.data.data : null;
  const isWatched = Boolean(watchlist.data?.some((entry) => entry.assetId === "xau-usd"));
  const chartData = useMemo(() => (candleData?.candles ?? []).map((candle) => ({ timestamp: candle.openTime, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume ?? 0 })), [candleData?.candles]);
  const busy = quote.isFetching || candles.isFetching;
  const refresh = () => void Promise.all([quote.refetch(), capabilities.refetch(), candles.refetch()]);

  return (
    <main className="nexus-surface min-h-screen text-foreground">
      <header className="border-b border-border bg-background/72 backdrop-blur-xl">
        <div className="container flex flex-col gap-4 py-6 sm:py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/markets" className="inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-none"><ArrowLeft className="size-4" />Back to markets</Link>
            <div className="flex flex-wrap items-center gap-2">
              {quote.isLoading ? <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">LOADING</span> : <MarketStatus value={quoteData?.marketStatus ?? "DATA_UNAVAILABLE"} />}
              <button type="button" onClick={refresh} disabled={busy} className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50 focus-visible:outline-none" aria-label="Refresh Twelve Data Gold market data"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /></button>
            </div>
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/8 px-4 py-3 text-sm leading-6 text-foreground-secondary">
            <strong className="text-warning">Commodity monitoring only.</strong> Gold is not a crypto token, contract, on-chain asset, Smart Money subject, or inferred portfolio holding. Public commercial display remains <strong>NOT VERIFIED</strong> until the account holder confirms Twelve Data licensing.
          </div>
        </div>
      </header>

      <div className="container py-5 sm:py-7 lg:py-8">
        <section className="nexus-card nexus-card--hero p-4 sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4"><span className="inline-flex size-14 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 text-xl font-black text-warning">Au</span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Gold</h1><span className="rounded-full border border-border bg-background-secondary px-2.5 py-1 font-mono text-xs font-semibold text-foreground-secondary">XAU/USD</span><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">COMMODITY</span></div><p className="mt-2 text-sm text-foreground-secondary">Twelve Data market source · bid/ask and volume are displayed only when returned by the provider.</p></div></div>
            <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 lg:min-w-[260px] lg:text-right"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">Current price</span><span className="nexus-numeric text-2xl font-semibold text-foreground">{money(quoteData?.currentPrice, quote.isLoading)}</span><span className={quoteData?.change24hPercent !== null && quoteData?.change24hPercent !== undefined && quoteData.change24hPercent >= 0 ? "font-mono text-sm text-success" : "font-mono text-sm text-danger"}>Provider change {quote.isLoading ? "Loading…" : percent(quoteData?.change24hPercent)}</span><span className="text-[11px] text-foreground-muted">Provider update: {quoteData?.providerUpdatedAt ? new Date(quoteData.providerUpdatedAt).toLocaleString() : quote.isLoading ? "Loading verified timestamp…" : "DATA UNAVAILABLE"}</span><Link href="/chart/xau-usd" className="mt-1 inline-flex items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 focus-visible:outline-none">Open full Gold chart</Link></div>
          </div>
        </section>

        {quote.data?.success === false ? <ProviderNotice message={providerMessage(quote.data.error)} /> : null}
        {capabilities.data?.success === false ? <ProviderNotice message={providerMessage(capabilities.data.error)} /> : null}

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
          <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.22)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"><BarChart3 className="size-3.5" />Verified OHLC</p><h2 className="mt-1 text-lg font-semibold">Gold chart</h2></div><div className="flex flex-wrap gap-1.5">{supportedTimeframes.map((item) => <button key={item} type="button" onClick={() => setTimeframe(item)} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-none ${timeframe === item ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-foreground-secondary hover:border-primary/35"}`}>{labels[item]}</button>)}</div></div>{candles.isLoading ? <div className="grid h-[430px] place-items-center text-sm text-foreground-muted">Loading verified Twelve Data OHLC…</div> : candles.data?.success === false ? <ProviderNotice message={providerMessage(candles.data.error)} /> : <CandlestickChart data={chartData} height={430} symbol="XAU/USD · Gold" interval={labels[timeframe]} sourceLabel="Twelve Data · verified OHLC" isStale={candleData?.isStale ?? false} showVolume={false} />}</section>
          <aside className="space-y-5"><Panel title="Market statistics"><dl className="grid grid-cols-2 divide-x divide-y divide-border"><Datum label="Provider high" value={money(quoteData?.high24h)} /><Datum label="Provider low" value={money(quoteData?.low24h)} /><Datum label="Previous close" value={money(quoteData?.previousClose)} /><Datum label="Bid / Ask" value={quoteData?.bid !== null && quoteData?.bid !== undefined && quoteData?.ask !== null && quoteData?.ask !== undefined ? `${money(quoteData.bid)} / ${money(quoteData.ask)}` : "DATA UNAVAILABLE"} /></dl></Panel><Panel title="Watchlist"><p className="text-sm leading-6 text-foreground-secondary">Adding Gold here records only a personal monitoring preference. It does not create a gold holding, broker account, RWA balance, or paper position.</p><button type="button" disabled={addWatch.isPending || removeWatch.isPending} onClick={() => { if (!auth.isAuthenticated) { startLogin(); return; } if (isWatched) removeWatch.mutate(); else addWatch.mutate(); }} className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none ${isWatched ? "border-warning/35 bg-warning/10 text-warning" : "border-primary/30 bg-primary/10 text-primary"}`}><Star className="size-4" fill={isWatched ? "currentColor" : "none"} />{isWatched ? "Remove from watchlist" : auth.isAuthenticated ? "Add to watchlist" : "Sign in to watch Gold"}</button></Panel><Panel title="Market Intelligence"><div className="flex gap-2 text-sm leading-6 text-foreground-secondary"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-foreground-muted" />Crypto on-chain Smart Money is intentionally not applied to Gold. A separate, source-backed commodity intelligence model would be required.</div></Panel></aside>
        </section>
      </div>
    </main>
  );
}

function MarketStatus({ value }: { value: "LIVE" | "DELAYED" | "MARKET_CLOSED" | "DATA_UNAVAILABLE" }) { const style = value === "LIVE" ? "border-success/30 bg-success/10 text-success" : value === "DELAYED" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-background-secondary text-foreground-muted"; return <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${style}`}>{value}</span>; }
function ProviderNotice({ message }: { message: string }) { return <aside className="mt-5 flex gap-2 rounded-xl border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning" role="status"><CircleAlert className="mt-0.5 size-4 shrink-0" />{message}</aside>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-border bg-card/75 shadow-[0_18px_60px_rgba(3,7,34,0.13)]"><h2 className="border-b border-border px-4 py-4 text-base font-semibold">{title}</h2><div className="p-4">{children}</div></section>; }
function Datum({ label, value }: { label: string; value: string }) { return <div className="min-w-0 px-3 py-3 first:pl-0 nth-[2n]:pr-0"><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-muted">{label}</dt><dd className="mt-1 break-words font-mono text-xs font-semibold text-foreground">{value}</dd></div>; }
