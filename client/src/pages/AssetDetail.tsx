import { useId, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { Activity, ArrowDownRight, ArrowLeft, ArrowUpRight, BarChart3, BrainCircuit, CircleAlert, CloudOff, ExternalLink, Gauge, Radar, RefreshCw, ShieldAlert, Sparkles, Waves } from "lucide-react";
import { Link, useRoute } from "wouter";
import { getLiveRefreshControlState, useLiveAssetMarket, useLiveRateLimitStatus, useLiveRefreshPolicy } from "@/hooks/useLiveMarketData";
import { useAssetIntelligence, type IntelligenceTimeframe } from "@/hooks/useMarketIntelligence";
import { LiveDataRateLimitNotice } from "@/components/LiveDataRateLimitNotice";
import ProgressiveLiveCandles from "@/components/ProgressiveLiveCandles";
import { type ChartAnnotation } from "@/components/CandlestickChart";
import { trpc } from "@/lib/trpc";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AssetIntelligenceResponse = RouterOutputs["intelligence"]["asset"];
type AssetIntelligenceModel = Extract<AssetIntelligenceResponse, { success: true }>["data"];
type TimeframeAnalysisModel = AssetIntelligenceModel["timeframes"][number];

interface AssetDetailModel {
  id: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  marketCapRank: number | null;
  priceUsd: number | null;
  priceChange1hPercent: number | null;
  priceChange24hPercent: number | null;
  priceChange7dPercent: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  high24hUsd: number | null;
  low24hUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  providerUpdatedAt: number;
  providerTimestampOrigin: "provider" | "fetched";
  sparkline7d: number[];
  description: string | null;
  homepage: string | null;
  categories: string[];
}

export default function AssetDetail() {
  const [, params] = useRoute("/assets/:id");
  const assetId = params?.id ?? "";
  const [preferredTimeframe, setPreferredTimeframe] = useState<IntelligenceTimeframe>("4h");
  const detail = useLiveAssetMarket(assetId);
  const intelligence = useAssetIntelligence(assetId, preferredTimeframe);
  const response = detail.data;
  const intelligenceResponse = intelligence.data;
  const data = response?.success ? response.data : null;
  const intelligenceData = intelligenceResponse?.success ? intelligenceResponse.data : null;
  const asset = data?.asset as AssetDetailModel | undefined;
  const candlePolicy = useLiveRefreshPolicy(30_000);
  const candleQuery = trpc.marketData.candles.useQuery({ symbol: asset?.symbol ?? "BTC", interval: preferredTimeframe, limit: 80 }, { ...candlePolicy, enabled: candlePolicy.enabled && Boolean(asset?.symbol) });
  const candleResponse = candleQuery.data;
  const candleData = candleResponse?.success ? candleResponse.data : null;
  const errorMessage = !response?.success ? response?.error?.message : detail.error?.message;
  const rateLimit = useLiveRateLimitStatus(response);
  const intelligenceRateLimit = useLiveRateLimitStatus(intelligenceResponse);
  const isRateLimited = rateLimit.isRateLimited || intelligenceRateLimit.isRateLimited;
  const retryAfterSeconds = Math.max(rateLimit.retryAfterSeconds, intelligenceRateLimit.retryAfterSeconds);
  const refreshControl = getLiveRefreshControlState({ isOnline: detail.isOnline && intelligence.isOnline, isFetching: detail.isFetching || intelligence.isFetching, isRateLimited });
  const refreshAll = () => void Promise.all([detail.refetch(), candleQuery.refetch(), ...(intelligence.isSupported ? [intelligence.refetch()] : [])]);

  if (detail.isLoading && !asset) return <AssetSkeleton />;

  if (!asset || !data) {
    const unavailableMessage = rateLimit.isRateLimited
      ? `The public market provider has temporarily limited requests. Try this asset again in about ${rateLimit.retryAfterSeconds} seconds.`
      : errorMessage ?? "The requested asset is not available from the live market provider.";
    return <AssetUnavailable message={unavailableMessage} onRetry={refreshAll} retryBlocked={rateLimit.isRateLimited} />;
  }

  const isPositive = (asset.priceChange24hPercent ?? 0) >= 0;

  return (
    <main className="nexus-surface min-h-screen text-foreground">
      <header className="border-b border-border bg-background/72 backdrop-blur-xl">
        <div className="container flex flex-col gap-4 py-6 sm:py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/markets" className="inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-none">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to markets
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <AssetStatus isOnline={detail.isOnline} isFetching={detail.isFetching} isStale={data.isStale} updatedAt={data.cachedAt} />
              {intelligence.isSupported ? <IntelligenceStatus data={intelligenceData} isFetching={intelligence.isFetching} /> : null}
              <button type="button" onClick={refreshAll} disabled={refreshControl.disabled} className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none" aria-label={isRateLimited ? `Live asset refresh paused for about ${retryAfterSeconds} seconds` : "Refresh live asset and intelligence data"}>
                <RefreshCw className={`size-4 ${detail.isFetching || intelligence.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              </button>
            </div>
          </div>

          {!detail.isOnline ? <LiveNotice icon={<CloudOff className="size-4" aria-hidden="true" />} tone="warning">You are offline. The most recently loaded live asset data will remain visible until your connection returns.</LiveNotice> : null}
          {data.isStale ? <LiveNotice icon={<CircleAlert className="size-4" aria-hidden="true" />} tone="warning">Showing the most recent cached market response from {formatUpdatedAt(data.cachedAt)} while the provider recovers.</LiveNotice> : null}
          {isRateLimited ? <LiveDataRateLimitNotice retryAfterSeconds={retryAfterSeconds} onRetry={refreshAll} /> : null}
        </div>
      </header>

      <div className="container py-5 sm:py-7 lg:py-8">
        <section className="nexus-card nexus-card--hero p-4 sm:p-5" aria-labelledby="asset-title">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <AssetMark asset={asset} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 id="asset-title" className="truncate text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{asset.name}</h1>
                  <span className="rounded-full border border-border bg-background-secondary px-2.5 py-1 font-mono text-xs font-semibold text-foreground-secondary">{asset.symbol}</span>
                  {asset.marketCapRank ? <span className="text-xs font-medium text-foreground-muted">Rank #{asset.marketCapRank}</span> : null}
                </div>
                <p className="mt-2 text-sm text-foreground-secondary">Live market statistics from CoinGecko. Prices are informational; the connected trading workspace remains simulation-only.</p>
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Asset categories">
                  {asset.categories.slice(0, 4).map((category) => <span key={category} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{category}</span>)}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 lg:min-w-[240px] lg:text-right">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">Current price</span>
              <span className="nexus-numeric text-2xl font-semibold tracking-tight text-foreground">{formatPrice(asset.priceUsd)}</span>
              <Movement change={asset.priceChange24hPercent} label="24h" compact />
              <Link href={`/copilot?asset=${encodeURIComponent(asset.id)}`} className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none"><BrainCircuit className="size-3.5" aria-hidden="true" /> Ask Nexus</Link>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
          <AssetCandlestickChart asset={asset} candles={candleData?.candles ?? []} initialSnapshotAt={candleData?.cachedAt ?? null} source={candleData?.source ?? "binance"} sourceLabel={candleData ? `${formatSource(candleData.source)} · ${formatUpdatedAt(candleData.cachedAt)}` : "Candles unavailable"} isStale={candleData?.isStale ?? false} errorMessage={!candleResponse?.success ? candleResponse?.error?.message ?? candleQuery.error?.message : undefined} intelligence={intelligenceData} preferredTimeframe={preferredTimeframe} />
          <aside className="space-y-5" aria-label={`${asset.name} market statistics`}>
            <Panel title="Market statistics">
              <dl className="grid grid-cols-2 divide-x divide-y divide-border">
                <Statistic label="24h high" value={formatPrice(asset.high24hUsd)} />
                <Statistic label="24h low" value={formatPrice(asset.low24hUsd)} />
                <Statistic label="24h volume" value={formatCompactCurrency(asset.volume24hUsd)} />
                <Statistic label="Market cap" value={formatCompactCurrency(asset.marketCapUsd)} />
              </dl>
            </Panel>
            <Panel title="Recent movement">
              <dl className="grid divide-y divide-border">
                <MovementRow label="1 hour" change={asset.priceChange1hPercent} />
                <MovementRow label="24 hours" change={asset.priceChange24hPercent} />
                <MovementRow label="7 days" change={asset.priceChange7dPercent} />
              </dl>
            </Panel>
          </aside>
        </section>

        <AssetIntelligencePanel
          supported={intelligence.isSupported}
          data={intelligenceData}
          isLoading={intelligence.isLoading}
          error={intelligenceResponse?.success === false ? intelligenceResponse.error.message : intelligence.error?.message ?? null}
          onRetry={() => void intelligence.refetch()}
          selectedTimeframe={preferredTimeframe}
          onTimeframeChange={setPreferredTimeframe}
        />

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Panel title="Supply information">
            <dl className="grid gap-4 sm:grid-cols-3">
              <SupplyStatistic label="Circulating supply" value={asset.circulatingSupply} symbol={asset.symbol} />
              <SupplyStatistic label="Total supply" value={asset.totalSupply} symbol={asset.symbol} />
              <SupplyStatistic label="Max supply" value={asset.maxSupply} symbol={asset.symbol} />
            </dl>
            <SupplyProgress circulating={asset.circulatingSupply} maximum={asset.maxSupply} />
          </Panel>
          <Panel title="Asset context">
            {asset.description ? <p className="line-clamp-5 text-sm leading-6 text-foreground-secondary">{stripHtml(asset.description)}</p> : <p className="text-sm leading-6 text-foreground-muted">The provider has not supplied a descriptive summary for this asset.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href={`/trading?asset=${encodeURIComponent(asset.symbol)}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.97] focus-visible:outline-none">Open simulation workspace <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
              {asset.homepage ? <a href={asset.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none">Official site <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function IntelligenceStatus({ data, isFetching }: { data: AssetIntelligenceModel | null; isFetching: boolean }) {
  const primary = data?.timeframes.find((frame) => frame.timeframe === data.primaryTimeframe);
  if (!data || !primary) {
    return <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background-secondary px-3 py-1.5 text-xs font-semibold text-foreground-muted"><Radar className={`size-3.5 ${isFetching ? "animate-pulse" : ""}`} aria-hidden="true" /> Intelligence pending</span>;
  }
  const stale = primary.metadata.quality === "STALE";
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${stale ? "border-warning/30 bg-warning/10 text-warning" : "border-primary/30 bg-primary/10 text-primary"}`}><Radar className={`size-3.5 ${isFetching ? "animate-pulse" : ""}`} aria-hidden="true" /> Nexus {stale ? "stale" : "live"} · {data.primaryTimeframe}</span>;
}

function AssetIntelligencePanel({ supported, data, isLoading, error, onRetry, selectedTimeframe, onTimeframeChange }: { supported: boolean; data: AssetIntelligenceModel | null; isLoading: boolean; error: string | null; onRetry: () => void; selectedTimeframe: IntelligenceTimeframe; onTimeframeChange: (timeframe: IntelligenceTimeframe) => void }) {
  if (!supported) {
    return (
      <section className="mt-5 rounded-2xl border border-border bg-card/75 p-5">
        <div className="flex items-start gap-3"><Radar className="mt-0.5 size-5 text-foreground-muted" aria-hidden="true" /><div><h2 className="text-base font-semibold">Nexus intelligence is unavailable for this asset</h2><p className="mt-1 text-sm leading-6 text-foreground-secondary">Market statistics remain live, but the bounded Version 2.0 intelligence universe currently supports BTC, ETH, SOL, BNB, XRP, ADA, DOGE, and LINK only.</p></div></div>
      </section>
    );
  }

  if (isLoading && !data) {
    return <section className="mt-5 space-y-5" aria-label="Loading Nexus intelligence" aria-busy="true" role="status"><span className="sr-only">Loading Nexus asset intelligence</span><div className="h-36 animate-pulse rounded-2xl border border-primary/20 bg-card/70" /><div className="grid gap-5 xl:grid-cols-2"><div className="h-72 animate-pulse rounded-2xl border border-border bg-card/70" /><div className="h-72 animate-pulse rounded-2xl border border-border bg-card/70" /></div></section>;
  }

  if (!data) {
    return (
      <section className="mt-5 rounded-2xl border border-warning/30 bg-warning/8 p-5" role="status">
        <div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-5 text-warning" aria-hidden="true" /><div><h2 className="text-base font-semibold text-warning">Nexus intelligence is unavailable</h2><p className="mt-1 text-sm leading-6 text-foreground-secondary">{error ?? "Required public-exchange evidence is unavailable."}</p><button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-warning/30 px-3.5 py-2 text-sm font-semibold text-warning focus-visible:outline-none">Retry analysis</button></div></div>
      </section>
    );
  }

  const primary = data.timeframes.find((frame) => frame.timeframe === data.primaryTimeframe) ?? null;
  const regime = data.regime.status === "AVAILABLE" ? humanizeIntelligence(data.regime.value.regime) : "Unavailable";
  const alignment = data.multiTimeframe.status === "AVAILABLE" ? humanizeIntelligence(data.multiTimeframe.value.alignment) : "Unavailable";

  return (
    <section className="mt-5 space-y-5" aria-labelledby="asset-intelligence-title">
      <div className="nx-panel border-primary/25 p-4 shadow-[0_14px_30px_rgba(0,0,0,.3)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"><Sparkles className="size-3.5" aria-hidden="true" />Nexus asset intelligence</p>
            <h2 id="asset-intelligence-title" className="mt-1 text-xl font-semibold">Evidence, not prediction</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground-secondary">Scores combine deterministic structure, momentum, volume, volatility, and timeframe agreement. They are analytical indexes—not profit probabilities or execution instructions.</p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end"><label className="text-xs font-semibold text-foreground-secondary"><span className="mr-2">Primary timeframe</span><select value={selectedTimeframe} onChange={(event) => onTimeframeChange(event.target.value as IntelligenceTimeframe)} className="rounded-lg border border-border bg-background-secondary px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none"><option value="5m">5m</option><option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option><option value="1d">1D</option></select></label><div className="flex flex-wrap gap-2"><IntelligencePill label={regime} tone={regimeToneIntelligence(regime)} /><IntelligencePill label={alignment} tone="primary" />{primary ? <IntelligencePill label={`${primary.metadata.quality} · ${primary.metadata.source}`} tone={primary.metadata.quality === "STALE" ? "warning" : "success"} /> : null}</div></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ScoreCard label="Opportunity" score={data.opportunityScore} icon={Sparkles} />
          <ScoreCard label="Risk" score={data.riskScore} icon={ShieldAlert} reverse />
          <ScoreCard label="Signal strength" score={data.signalStrength} icon={Activity} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Current market state">
          {primary ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <IntelligenceDatum label="Primary timeframe" value={primary.timeframe} />
              <IntelligenceDatum label="Regime" value={regime} />
              <IntelligenceDatum label="Structure" value={primary.structure.status === "AVAILABLE" ? humanizeIntelligence(primary.structure.value.trend) : "Unavailable"} />
              <IntelligenceDatum label="Momentum" value={primary.momentum.status === "AVAILABLE" ? humanizeIntelligence(primary.momentum.value.direction) : "Unavailable"} />
              <IntelligenceDatum label="Volatility" value={primary.volatility.status === "AVAILABLE" ? humanizeIntelligence(primary.volatility.value.level) : "Unavailable"} />
              <IntelligenceDatum label="Volume" value={primary.volume.status === "AVAILABLE" ? `${humanizeIntelligence(primary.volume.value.trend)} · ${primary.volume.value.relativeVolume.toFixed(2)}x` : "Unavailable"} />
            </dl>
          ) : <p className="text-sm text-foreground-secondary">No timeframe meets the minimum evidence contract.</p>}
          {primary?.structure.status === "AVAILABLE" ? (
            <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <LevelList label="Confirmed support" levels={primary.structure.value.support.slice(-3).reverse()} />
              <LevelList label="Confirmed resistance" levels={primary.structure.value.resistance.slice(0, 3)} />
            </div>
          ) : null}
        </Panel>

        <Panel title="Technical evidence">
          {primary ? <IndicatorGrid frame={primary} /> : <p className="text-sm text-foreground-secondary">Technical evidence is unavailable without a primary timeframe.</p>}
          <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-foreground-muted">Indicators are calculated from validated public-exchange candles. Unavailable metrics remain unavailable; no neutral values are substituted.</p>
        </Panel>
      </div>

      <Panel title="Multi-timeframe intelligence">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-foreground-secondary">5m, 15m, 1h, 4h, and 1D are compared only when each frame has enough validated candles.</p><IntelligencePill label={alignment} tone={alignment.includes("Conflict") ? "warning" : alignment.includes("Bullish") ? "success" : alignment.includes("Bearish") ? "danger" : "primary"} /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{data.timeframes.map((frame) => <TimeframeCard key={frame.timeframe} frame={frame} />)}</div>
      </Panel>

      <section className="rounded-2xl border border-primary/25 bg-card/75 shadow-[0_18px_60px_rgba(3,7,34,0.13)] backdrop-blur-xl" aria-labelledby="nexus-explanation-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Structured explanation</p><h2 id="nexus-explanation-title" className="mt-1 text-base font-semibold">Why Nexus reached this state</h2></div><span className="rounded-full border border-warning/30 bg-warning/8 px-3 py-1.5 text-xs font-semibold text-warning">Not financial advice</span></div>
        <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div><p className="text-base font-semibold leading-7">{data.explanation.summary}</p><p className="mt-3 text-sm leading-6 text-foreground-secondary"><strong className="text-foreground">What:</strong> {data.explanation.what}</p><p className="mt-2 text-sm leading-6 text-foreground-secondary"><strong className="text-foreground">Why:</strong> {data.explanation.why}</p><p className="mt-4 text-xs leading-5 text-foreground-muted">{data.explanation.disclaimer}</p></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><EvidenceList label="Supporting evidence" items={data.explanation.evidence} tone="success" /><EvidenceList label="Risks and limitations" items={data.explanation.risks} tone="warning" /></div>
        </div>
      </section>
    </section>
  );
}

function ScoreCard({ label, score, icon: Icon, reverse = false }: { label: string; score: AssetIntelligenceModel["opportunityScore"]; icon: typeof Activity; reverse?: boolean }) {
  const value = score.value;
  const tone = value === null ? "text-foreground-muted" : reverse ? (value >= 60 ? "text-danger" : value >= 35 ? "text-warning" : "text-success") : value >= 70 ? "text-success" : value >= 40 ? "text-primary" : "text-warning";
  return <div className="rounded-xl border border-border bg-background-secondary/55 p-4"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground-muted"><Icon className="size-3.5" aria-hidden="true" />{label}</span><span className={`font-mono text-xl font-semibold ${tone}`}>{value === null ? "—" : value}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background"><div className={`h-full rounded-full ${reverse ? "bg-gradient-to-r from-success via-warning to-danger" : "bg-gradient-to-r from-primary to-accent"}`} style={{ width: `${value ?? 0}%` }} /></div><p className="mt-2 text-xs text-foreground-muted">{value === null ? score.unavailableReason : `${score.coveragePercent}% evidence coverage`}</p></div>;
}

function IndicatorGrid({ frame }: { frame: TimeframeAnalysisModel }) {
  const indicators = frame.indicators;
  return <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><IntelligenceDatum label="SMA 20" value={numberMetric(indicators.sma20)} /><IntelligenceDatum label="EMA 20" value={numberMetric(indicators.ema20)} /><IntelligenceDatum label="SMA 50" value={numberMetric(indicators.sma50)} /><IntelligenceDatum label="EMA 50" value={numberMetric(indicators.ema50)} /><IntelligenceDatum label="RSI 14" value={numberMetric(indicators.rsi14, 2)} /><IntelligenceDatum label="MACD hist." value={indicators.macd.status === "AVAILABLE" ? formatTechnical(indicators.macd.value.histogram) : "—"} /><IntelligenceDatum label="ATR 14" value={indicators.atr14.status === "AVAILABLE" ? `${indicators.atr14.value.percent.toFixed(2)}%` : "—"} /><IntelligenceDatum label="Band width" value={indicators.bollinger20.status === "AVAILABLE" ? `${indicators.bollinger20.value.widthPercent.toFixed(2)}%` : "—"} /></dl>;
}

function TimeframeCard({ frame }: { frame: TimeframeAnalysisModel }) {
  return <article className="rounded-xl border border-border bg-background-secondary/55 p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-mono text-sm font-semibold text-primary">{frame.timeframe}</h3><span className={`text-[10px] font-semibold uppercase ${frame.metadata.quality === "LIVE" ? "text-success" : frame.metadata.quality === "STALE" ? "text-warning" : "text-foreground-muted"}`}>{frame.metadata.quality}</span></div><dl className="mt-3 space-y-2 text-xs"><FrameDatum label="Trend" value={frame.structure.status === "AVAILABLE" ? humanizeIntelligence(frame.structure.value.trend) : "Unavailable"} /><FrameDatum label="Momentum" value={frame.momentum.status === "AVAILABLE" ? humanizeIntelligence(frame.momentum.value.direction) : "Unavailable"} /><FrameDatum label="Volatility" value={frame.volatility.status === "AVAILABLE" ? humanizeIntelligence(frame.volatility.value.level) : "Unavailable"} /></dl>{frame.metadata.unavailableReasons.length ? <p className="mt-3 text-[11px] leading-4 text-warning">{frame.metadata.unavailableReasons[0]}</p> : null}</article>;
}

function LevelList({ label, levels }: { label: string; levels: Array<{ price: number; touches: number }> }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">{label}</p>{levels.length ? <ul className="mt-2 space-y-1.5">{levels.map((level) => <li key={`${label}-${level.price}`} className="flex items-center justify-between gap-3 text-xs"><span className="font-mono font-semibold">{formatPrice(level.price)}</span><span className="text-foreground-muted">{level.touches} touches</span></li>)}</ul> : <p className="mt-2 text-xs text-foreground-muted">No multi-touch level confirmed.</p>}</div>;
}

function EvidenceList({ label, items, tone }: { label: string; items: string[]; tone: "success" | "warning" }) {
  return <div><p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${tone === "success" ? "text-success" : "text-warning"}`}>{label}</p><ul className="mt-2 space-y-2">{items.length ? items.map((item, index) => <li key={`${label}-${index}`} className="flex gap-2 text-xs leading-5 text-foreground-secondary"><span className={`mt-2 size-1.5 shrink-0 rounded-full ${tone === "success" ? "bg-success" : "bg-warning"}`} aria-hidden="true" />{item}</li>) : <li className="text-xs text-foreground-muted">No evidence available.</li>}</ul></div>;
}

function IntelligenceDatum({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background-secondary/45 p-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-muted">{label}</dt><dd className="mt-1 truncate text-sm font-semibold text-foreground">{value}</dd></div>; }
function FrameDatum({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-2"><dt className="text-foreground-muted">{label}</dt><dd className="truncate font-semibold text-foreground">{value}</dd></div>; }
function IntelligencePill({ label, tone }: { label: string; tone: "primary" | "success" | "danger" | "warning" }) { const style = tone === "success" ? "border-success/30 bg-success/8 text-success" : tone === "danger" ? "border-danger/30 bg-danger/8 text-danger" : tone === "warning" ? "border-warning/30 bg-warning/8 text-warning" : "border-primary/30 bg-primary/8 text-primary"; return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>; }
function humanizeIntelligence(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function regimeToneIntelligence(regime: string): "primary" | "success" | "danger" | "warning" { return regime.includes("Bullish") ? "success" : regime.includes("Bearish") ? "danger" : regime.includes("High Volatility") ? "warning" : "primary"; }
function numberMetric(metric: { status: "AVAILABLE"; value: number } | { status: "UNAVAILABLE"; value: null }, digits = 4) { return metric.status === "AVAILABLE" ? formatTechnical(metric.value, digits) : "—"; }
function formatTechnical(value: number, digits = 4) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value); }

function AssetCandlestickChart({ asset, candles, initialSnapshotAt, source, sourceLabel, isStale, errorMessage, intelligence, preferredTimeframe }: { asset: AssetDetailModel; candles: Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number }>; initialSnapshotAt: number | null; source: "binance" | "coinbase"; sourceLabel: string; isStale: boolean; errorMessage?: string; intelligence: AssetIntelligenceModel | null; preferredTimeframe: IntelligenceTimeframe }) {
  const [showIntelligence, setShowIntelligence] = useState(false);
  const frame = intelligence?.timeframes.find((item) => item.timeframe === preferredTimeframe) ?? intelligence?.timeframes[0] ?? null;
  const annotations = useMemo<ChartAnnotation[]>(() => { if (!showIntelligence || frame?.structure.status !== "AVAILABLE") return []; return [...frame.structure.value.support.slice(0, 1).map((level) => ({ id: `support-${level.price}`, price: level.price, label: "SUPPORT", tone: "structure" as const })), ...frame.structure.value.resistance.slice(0, 1).map((level) => ({ id: `resistance-${level.price}`, price: level.price, label: "RESISTANCE", tone: "intelligence" as const }))]; }, [frame, showIntelligence]);
  return <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.22)] backdrop-blur-xl"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted"><BarChart3 className="size-3.5 text-primary" aria-hidden="true" />Live OHLCV candles</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{asset.name} · {preferredTimeframe.toUpperCase()}</h2><p className="mt-1 text-xs text-foreground-secondary">Exchange candles are separate from CoinGecko summary statistics; no candle is rebuilt from the seven-day sparkline.</p></div><button type="button" onClick={() => setShowIntelligence((current) => !current)} aria-pressed={showIntelligence} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-none ${showIntelligence ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-foreground-secondary hover:bg-background-secondary"}`}><Sparkles className="size-3.5" />Intelligence {showIntelligence ? "on" : "off"}</button></div>{errorMessage && !candles.length ? <div className="px-5 py-3 text-sm text-warning">{errorMessage}</div> : <ProgressiveLiveCandles initialCandles={candles} initialSnapshotAt={initialSnapshotAt} symbol={asset.symbol} interval={preferredTimeframe} source={source} sourceLabel={sourceLabel} isStale={isStale} annotations={annotations} />}{showIntelligence ? <div className="border-t border-border bg-primary/5 px-4 py-3 text-xs text-foreground-secondary sm:px-5">{frame?.metadata.quality === "LIVE" || frame?.metadata.quality === "STALE" ? <>Structure: {frame.structure.status === "AVAILABLE" ? `${frame.structure.value.trend} · ${frame.structure.value.event}` : "unavailable"}. Overlay draws at most one confirmed support and resistance level and remains descriptive.</> : <>Intelligence evidence is unavailable for this timeframe; no overlay level was drawn.</>}</div> : null}</section>;
}

function AssetPriceChart({ asset }: { asset: AssetDetailModel }) {
  const chartId = useId().replace(/:/g, "");
  const series = useMemo(() => asset.sparkline7d.filter((value) => Number.isFinite(value)), [asset.sparkline7d]);
  const positive = (asset.priceChange7dPercent ?? 0) >= 0;
  const path = useMemo(() => makePath(series, 900, 320, 24), [series]);
  const areaPath = path ? `${path} L 876 296 L 24 296 Z` : "";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.22)] backdrop-blur-xl" aria-labelledby={`${chartId}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5 sm:py-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted"><BarChart3 className="size-3.5 text-primary" aria-hidden="true" /> Live price movement</div>
          <h2 id={`${chartId}-title`} className="mt-2 text-xl font-semibold tracking-tight">{asset.name} · 7 days</h2>
        </div>
        <div className="rounded-full border border-border bg-background-secondary px-2.5 py-1 text-xs font-medium text-foreground-secondary">CoinGecko · {asset.providerTimestampOrigin === "provider" ? "provider update" : "fetched"} {formatUpdatedAt(asset.providerUpdatedAt)}</div>
      </div>
      <figure className="relative h-[280px] overflow-hidden bg-[radial-gradient(circle_at_70%_10%,rgba(147,51,234,0.18),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.96))] sm:h-[360px]" aria-label={`${asset.name} seven day price movement chart`}>
        {series.length >= 2 ? (
          <svg viewBox="0 0 900 320" preserveAspectRatio="none" className="size-full" role="img" aria-hidden="true">
            <defs>
              <linearGradient id={`${chartId}-line`} x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="55%" stopColor="#ec4899" /><stop offset="100%" stopColor={positive ? "#34d399" : "#fb7185"} /></linearGradient>
              <linearGradient id={`${chartId}-area`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity="0.28" /><stop offset="100%" stopColor="#a855f7" stopOpacity="0" /></linearGradient>
            </defs>
            {[52, 108, 164, 220, 276].map((y) => <line key={y} x1="24" x2="876" y1={y} y2={y} stroke="rgba(148,163,184,0.13)" strokeWidth="1" />)}
            <path d={areaPath} fill={`url(#${chartId}-area)`} />
            <path d={path} fill="none" stroke={`url(#${chartId}-line)`} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : <div className="flex size-full items-center justify-center px-6 text-center text-sm text-foreground-muted">The provider has not returned enough recent prices to draw a seven-day chart yet.</div>}
        <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 bg-slate-950/55 px-4 py-3 text-[11px] text-foreground-muted backdrop-blur-sm sm:px-5"><span>Provider-backed seven-day price sequence</span><Movement change={asset.priceChange7dPercent} label="7d" compact /></figcaption>
      </figure>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card/75 shadow-[0_18px_60px_rgba(3,7,34,0.13)] backdrop-blur-xl"><h2 className="border-b border-border px-4 py-4 text-base font-semibold sm:px-5">{title}</h2><div className="p-4 sm:p-5">{children}</div></section>;
}

function Statistic({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-3 py-3 first:pl-0 nth-[2n]:pr-0"><dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{label}</dt><dd className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{value}</dd></div>;
}

function SupplyStatistic({ label, value, symbol }: { label: string; value: number | null; symbol: string }) {
  return <div><dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{label}</dt><dd className="mt-1 font-mono text-sm font-semibold text-foreground">{value === null ? "—" : `${formatQuantity(value)} ${symbol}`}</dd></div>;
}

function SupplyProgress({ circulating, maximum }: { circulating: number | null; maximum: number | null }) {
  if (circulating === null || maximum === null || maximum <= 0) return <p className="mt-5 text-xs text-foreground-muted">The provider has not supplied enough maximum-supply data to calculate circulation.</p>;
  const percent = Math.min(100, Math.max(0, (circulating / maximum) * 100));
  return <div className="mt-5"><div className="mb-2 flex items-center justify-between text-xs text-foreground-muted"><span>Maximum supply in circulation</span><span className="font-mono">{percent.toFixed(2)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-background-secondary"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-transform" style={{ width: `${percent}%` }} /></div></div>;
}

function MovementRow({ label, change }: { label: string; change: number | null }) {
  return <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><dt className="text-sm text-foreground-secondary">{label}</dt><dd><Movement change={change} label="" /></dd></div>;
}

function Movement({ change, label, compact = false }: { change: number | null; label: string; compact?: boolean }) {
  if (change === null) return <span className="font-mono text-sm text-foreground-muted">—</span>;
  const positive = change >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-1 font-mono text-sm font-semibold ${positive ? "text-success" : "text-danger"}`}><Icon className={compact ? "size-3" : "size-3.5"} aria-hidden="true" />{positive ? "+" : ""}{change.toFixed(2)}%{label ? <span className="font-sans text-xs font-medium opacity-75">{label}</span> : null}</span>;
}

function AssetMark({ asset }: { asset: AssetDetailModel }) {
  return <span className="relative inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/15 text-lg font-bold text-primary"><span aria-hidden={Boolean(asset.imageUrl)}>{asset.symbol.slice(0, 2)}</span>{asset.imageUrl ? <img src={asset.imageUrl} alt={`${asset.name} mark`} className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span>;
}

function AssetStatus({ isOnline, isFetching, isStale, updatedAt }: { isOnline: boolean; isFetching: boolean; isStale: boolean; updatedAt: number }) {
  if (!isOnline) return <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning"><CloudOff className="size-3.5" aria-hidden="true" /> Offline</span>;
  if (isStale) return <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning"><CircleAlert className="size-3.5" aria-hidden="true" /> Cached · {formatUpdatedAt(updatedAt)}</span>;
  return <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success"><span className={`size-2 rounded-full bg-success ${isFetching ? "animate-pulse" : ""}`} aria-hidden="true" /> Live · {formatUpdatedAt(updatedAt)}</span>;
}

function LiveNotice({ icon, tone, children }: { icon: React.ReactNode; tone: "warning"; children: React.ReactNode }) {
  return <aside className={`flex gap-2 rounded-xl border px-4 py-3 text-sm ${tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : ""}`} role="status">{icon}<span>{children}</span></aside>;
}

function AssetUnavailable({ message, onRetry, retryBlocked = false }: { message: string; onRetry: () => void; retryBlocked?: boolean }) {
  return <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6"><section className="mx-auto max-w-xl rounded-2xl border border-border bg-card/75 p-6 shadow-[0_24px_80px_rgba(3,7,34,0.18)]"><CircleAlert className="size-6 text-warning" aria-hidden="true" /><h1 className="mt-4 text-xl font-semibold">Live asset data is unavailable</h1><p className="mt-2 text-sm leading-6 text-foreground-secondary">{message}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={retryBlocked} onClick={onRetry} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none">{retryBlocked ? "Retry paused" : "Retry live data"}</button><Link href="/markets" className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-none">Back to markets</Link></div></section></main>;
}

function AssetSkeleton() {
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6"><div className="container space-y-5"><div className="h-4 w-32 rounded bg-muted" /><div className="h-36 rounded-2xl border border-border bg-card" /><div className="grid gap-5 xl:grid-cols-[1.55fr_0.8fr]"><div className="h-[360px] rounded-2xl border border-border bg-card" /><div className="space-y-5"><div className="h-48 rounded-2xl border border-border bg-card" /><div className="h-40 rounded-2xl border border-border bg-card" /></div></div></div></main>;
}

function makePath(values: number[], width: number, height: number, padding: number) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function stripHtml(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function formatPrice(value: number | null) { if (value === null) return "—"; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 6 : 2 }).format(value); }
function formatCompactCurrency(value: number | null) { if (value === null) return "—"; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value); }
function formatQuantity(value: number) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 3 }).format(value); }
function formatUpdatedAt(value: number) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function formatSource(source: "binance" | "coinbase" | "mixed") { return source === "coinbase" ? "Coinbase Exchange" : source === "binance" ? "Binance Public" : "Mixed public feeds"; }
