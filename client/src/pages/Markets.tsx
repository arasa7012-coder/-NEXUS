import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, CloudOff, Info, RefreshCw, Search, Sparkles, Star } from "lucide-react";
import { Link } from "wouter";
import { getLiveRefreshControlState, useLiveMarketDirectory, useLiveMarketSearch, useLiveRateLimitStatus } from "@/hooks/useLiveMarketData";
import { LiveDataRateLimitNotice } from "@/components/LiveDataRateLimitNotice";
import { NexusDensityControl } from "@/components/NexusDensityControl";
import { useAssetIntelligence } from "@/hooks/useMarketIntelligence";
import { trpc } from "@/lib/trpc";

type MarketOrder = "market_cap_desc" | "market_cap_asc" | "volume_desc" | "volume_asc" | "id_asc" | "id_desc";
type DirectionFilter = "all" | "gainers" | "losers";

const pageSize = 50;
const intelligenceAssetIds = new Set(["bitcoin", "ethereum", "solana", "binancecoin", "ripple", "cardano", "dogecoin", "chainlink"]);

export default function Markets() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState<MarketOrder>("market_cap_desc");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const deferredSearch = useDeferredValue(searchTerm);
  const directory = useLiveMarketDirectory({ page, perPage: pageSize, order });
  const search = useLiveMarketSearch(deferredSearch);
  const searchActive = search.normalizedQuery.length >= 2;
  const goldSearchMatch = /gold|xau/i.test(deferredSearch.trim());
  const active = searchActive ? search : directory;
  const response = searchActive ? search.data : directory.data;
  const responseError = response && !response.success ? response.error : null;
  const marketData = response?.success ? response.data : null;
  const rateLimit = useLiveRateLimitStatus(response);
  const refreshControl = getLiveRefreshControlState({ isOnline: active.isOnline, isFetching: active.isFetching, isRateLimited: rateLimit.isRateLimited });

  const assets = useMemo(() => {
    const source = marketData?.assets ?? [];
    if (direction === "gainers") return source.filter((asset) => (asset.priceChange24hPercent ?? 0) > 0);
    if (direction === "losers") return source.filter((asset) => (asset.priceChange24hPercent ?? 0) < 0);
    return source;
  }, [direction, marketData?.assets]);

  const summary = useMemo(() => ({
    marketCap: assets.reduce((total, asset) => total + (asset.marketCapUsd ?? 0), 0),
    volume: assets.reduce((total, asset) => total + (asset.volume24hUsd ?? 0), 0),
    leaders: assets.filter((asset) => (asset.priceChange24hPercent ?? 0) > 0).length,
  }), [assets]);
  const intelligenceAssets = useMemo(() => searchActive ? [] : assets.filter((asset) => intelligenceAssetIds.has(asset.id)).slice(0, 8), [assets, searchActive]);

  const updateSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isInitialLoading = active.isLoading && !marketData;
  const hasError = Boolean(responseError || active.error) && !marketData;
  const errorMessage = responseError?.message ?? active.error?.message ?? "Live market data is temporarily unavailable. Please retry shortly.";

  return (
    <main className="nexus-surface min-h-screen text-foreground">
      <header className="border-b border-border bg-background/72 backdrop-blur-xl">
        <div className="nexus-density-header container flex flex-col gap-5 py-6 sm:py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Verified market directory</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Markets, without the noise.</h1>
              <p className="mt-1 max-w-2xl text-sm text-foreground-secondary">Browse live cryptocurrency statistics, then open an asset workspace for price movement and supply context.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2"><NexusDensityControl /><MarketStatus isOnline={active.isOnline} isFetching={active.isFetching} isStale={marketData?.isStale ?? false} updatedAt={marketData?.cachedAt ?? null} /></div>
          </div>

          <aside className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground-secondary" aria-label="Live market data disclosure">
            CoinGecko market data is read-only and may be delayed. Values are live market information, not investment research or trading instructions. Order execution remains simulation-only.
          </aside>

          {!active.isOnline ? <OfflineNotice /> : null}
          {marketData?.isStale ? <StaleNotice updatedAt={marketData.cachedAt} onRetry={() => void active.refetch()} /> : null}
          {rateLimit.isRateLimited ? <LiveDataRateLimitNotice retryAfterSeconds={rateLimit.retryAfterSeconds} onRetry={() => void active.refetch()} /> : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px_220px]">
            <label className="relative">
              <span className="sr-only">Search live markets</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden="true" />
              <input value={searchTerm} onChange={(event) => updateSearch(event.target.value)} placeholder="Search assets or symbols" className="w-full rounded-xl border border-border bg-card px-10 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </label>
            <label>
              <span className="sr-only">Sort live markets</span>
              <select value={order} disabled={searchActive} onChange={(event) => { setOrder(event.target.value as MarketOrder); setPage(1); }} className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-foreground outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="market_cap_desc">Market cap: high to low</option>
                <option value="market_cap_asc">Market cap: low to high</option>
                <option value="volume_desc">Volume: high to low</option>
                <option value="volume_asc">Volume: low to high</option>
                <option value="id_asc">Name: A to Z</option>
                <option value="id_desc">Name: Z to A</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by 24 hour movement</span>
              <select value={direction} onChange={(event) => setDirection(event.target.value as DirectionFilter)} className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="all">All 24h movements</option>
                <option value="gainers">24h gainers</option>
                <option value="losers">24h losers</option>
              </select>
            </label>
          </div>

          {searchActive ? <p className="text-xs text-foreground-muted">Provider-ranked search results for “{search.normalizedQuery}”. Clear the search to browse paginated market rankings.</p> : null}
          <GoldSearchResult searchMatched={goldSearchMatch} />
        </div>
      </header>

      <div className="nexus-density-shell container py-5 sm:py-7 lg:py-8">
        <section className="nexus-card overflow-hidden" aria-labelledby="market-table-title" aria-busy={isInitialLoading}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Asset directory</p>
              <h2 id="market-table-title" className="mt-1 text-lg font-semibold">{searchActive ? "Search results" : "Live market rankings"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{assets.length} live assets</span>
              <button type="button" onClick={() => void active.refetch()} disabled={refreshControl.disabled} className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none" aria-label={rateLimit.isRateLimited ? `Live market refresh paused for about ${rateLimit.retryAfterSeconds} seconds` : "Refresh live market data"}>
                <RefreshCw className={`size-3.5 ${active.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              </button>
            </div>
          </div>

          {hasError && !rateLimit.isRateLimited ? <MarketError message={errorMessage} onRetry={() => void active.refetch()} /> : null}
          {isInitialLoading ? <MarketLoading /> : null}
          {!hasError && !isInitialLoading && assets.length ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="nx-table nexus-density-table w-full min-w-[1180px] text-sm">
                  <thead className="border-b border-border bg-background-secondary/60 text-left text-xs font-medium uppercase tracking-[0.1em] text-foreground-muted">
                    <tr>
                      <th className="w-16 px-5 py-3 text-right">Rank</th>
                      <th className="px-5 py-3">Asset</th>
                      <th className="px-5 py-3 text-right">Price</th>
                      <th className="px-5 py-3 text-right">24h movement</th>
                      <th className="w-36 px-5 py-3 text-center">Verified chart</th>
                      <th className="px-5 py-3 text-right">24h volume</th>
                      <th className="px-5 py-3 text-right">Market cap</th>
                      <th className="px-5 py-3 text-right">Trend</th>
                      <th className="px-5 py-3 text-right">Risk</th>
                      <th className="px-5 py-3 text-right">Intelligence</th>
                      <th className="w-20 px-5 py-3 text-right">Watch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assets.map((asset) => <MarketTableRow key={asset.id} asset={asset} isFavorite={favorites.has(asset.id)} onFavorite={toggleFavorite} />)}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-border lg:hidden">
                {assets.map((asset) => <MarketCard key={asset.id} asset={asset} isFavorite={favorites.has(asset.id)} onFavorite={toggleFavorite} />)}
              </div>
            </>
          ) : null}
          {!hasError && !isInitialLoading && !assets.length ? <EmptyMarkets query={searchTerm} direction={direction} /> : null}

          {!searchActive && !isInitialLoading && !hasError ? (
            <Pagination page={page} hasMore={marketData?.hasMore ?? false} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => current + 1)} />
          ) : null}
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-3" aria-label="Visible live-market summary">
          <MarketStat label="Visible market cap" value={formatCompactCurrency(summary.marketCap)} note="Sum of loaded live assets" />
          <MarketStat label="Visible 24h volume" value={formatCompactCurrency(summary.volume)} note="Provider-reported USD volume" />
          <MarketStat label="24h gainers" value={summary.leaders.toLocaleString("en-US")} note="Within the visible result set" />
        </section>
      </div>
    </main>
  );
}

function GoldSearchResult({ searchMatched }: { searchMatched: boolean }) {
  const quote = trpc.commodityMarket.quote.useQuery({ assetId: "xau-usd" }, { staleTime: 60_000, retry: 1 });
  const data = quote.data?.success ? quote.data.data : null;
  const message = quote.data?.success === false ? quote.data.error.message : null;
  return <article className="mt-3 flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-xl bg-warning/10 font-bold text-warning">Au</span><div><p className="font-semibold text-foreground">Gold <span className="font-mono text-foreground-secondary">XAU/USD</span>{searchMatched ? <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">SEARCH MATCH</span> : null}</p><p className="text-xs text-foreground-muted">COMMODITY · Twelve Data · {data?.marketStatus ?? message ?? "DATA UNAVAILABLE"}</p></div></div><div className="flex items-center gap-4"><span className="font-mono text-sm font-semibold text-foreground">{data?.currentPrice === undefined ? "DATA UNAVAILABLE" : formatPrice(data.currentPrice)}</span><Link href="/assets/xau-usd" className="rounded-lg border border-warning/30 px-3 py-2 text-xs font-semibold text-warning transition-colors hover:bg-warning/10 focus-visible:outline-none">Open Gold</Link></div></article>;
}

interface LiveAsset {
  id: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  marketCapRank: number | null;
  priceUsd: number | null;
  priceChange24hPercent: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  providerUpdatedAt: number;
  providerTimestampOrigin: "provider" | "fetched";
}

function MarketStatus({ isOnline, isFetching, isStale, updatedAt }: { isOnline: boolean; isFetching: boolean; isStale: boolean; updatedAt: number | null }) {
  if (!isOnline) return <span className="inline-flex items-center gap-2 self-start rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning sm:self-auto"><CloudOff className="size-3.5" aria-hidden="true" /> Offline</span>;
  if (isStale) return <span className="inline-flex items-center gap-2 self-start rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning sm:self-auto"><CircleAlert className="size-3.5" aria-hidden="true" /> Cached · {formatUpdatedAt(updatedAt)}</span>;
  return <span className="inline-flex items-center gap-2 self-start rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success sm:self-auto"><span className={`size-2 rounded-full bg-success ${isFetching ? "animate-pulse" : ""}`} aria-hidden="true" /> Live · {updatedAt ? formatUpdatedAt(updatedAt) : "connecting"}</span>;
}

function OfflineNotice() {
  return <aside className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" role="status"><CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>You are offline. Automatic refresh is paused until the connection returns.</span></aside>;
}

function StaleNotice({ updatedAt, onRetry }: { updatedAt: number; onRetry: () => void }) {
  return <aside className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between" role="status"><span>Showing the most recent cached market response from {formatUpdatedAt(updatedAt)} while the provider recovers.</span><button type="button" onClick={onRetry} className="self-start rounded-lg border border-warning/35 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-warning/10 focus-visible:outline-none sm:self-auto">Retry now</button></aside>;
}

function AssetIdentity({ asset }: { asset: LiveAsset }) {
  const timing = asset.providerUpdatedAt
    ? `${asset.providerTimestampOrigin === "provider" ? "provider update" : "fetched"} ${formatUpdatedAt(asset.providerUpdatedAt)}`
    : "awaiting update";
  return <Link href={`/assets/${encodeURIComponent(asset.id)}`} className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none"><AssetAvatar asset={asset} /><div className="min-w-0"><p className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">{asset.name}</p><p className="mt-0.5 text-xs text-foreground-muted">{asset.symbol} · {timing}</p></div></Link>;
}

function AssetAvatar({ asset }: { asset: LiveAsset }) {
  return <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/15 text-sm font-bold text-primary"><img src={asset.imageUrl ?? ""} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /><span className={asset.imageUrl ? "sr-only" : ""}>{asset.symbol.slice(0, 2)}</span></span>;
}

function MarketTableRow({ asset, isFavorite, onFavorite }: { asset: LiveAsset; isFavorite: boolean; onFavorite: (id: string) => void }) {
  const intelligence = useAssetIntelligence(asset.id, "4h");
  const intelligenceData = intelligence.data?.success ? intelligence.data.data : null;
  const primary = intelligenceData?.timeframes.find((frame) => frame.timeframe === intelligenceData.primaryTimeframe) ?? null;
  const trend = primary?.structure.status === "AVAILABLE" ? humanize(primary.structure.value.trend) : "Data unavailable";
  const risk = intelligenceData?.riskScore.value ?? null;
  const signal = intelligenceData?.signalStrength.value ?? null;
  return <tr><td className="px-5 py-3 text-right font-mono text-foreground-muted">{asset.marketCapRank ?? "—"}</td><td className="px-5 py-3"><AssetIdentity asset={asset} /></td><td className="px-5 py-3 text-right font-mono font-semibold text-foreground">{formatPrice(asset.priceUsd)}</td><td className="px-5 py-3 text-right"><ChangeBadge change={asset.priceChange24hPercent} /></td><td className="px-5 py-3"><VerifiedMiniCandleCell asset={asset} /></td><td className="px-5 py-3 text-right font-mono text-foreground-secondary">{formatCompactCurrency(asset.volume24hUsd)}</td><td className="px-5 py-3 text-right font-mono text-foreground-secondary">{formatCompactCurrency(asset.marketCapUsd)}</td><td className="px-5 py-3 text-right"><span className="inline-flex items-center gap-1 text-xs text-foreground-secondary"><span className={`size-1.5 rounded-full ${primary?.structure.status === "AVAILABLE" && primary.structure.value.trend === "UPTREND" ? "bg-success" : primary?.structure.status === "AVAILABLE" && primary.structure.value.trend === "DOWNTREND" ? "bg-danger" : "bg-foreground-muted"}`} />{trend}</span></td><td className="px-5 py-3 text-right font-mono text-foreground-secondary">{risk === null ? "—" : `${risk}/100`}</td><td className="px-5 py-3 text-right font-mono text-primary">{signal ?? "—"}</td><td className="px-5 py-3 text-right"><FavoriteButton asset={asset} isFavorite={isFavorite} onFavorite={onFavorite} /></td></tr>;
}

function VerifiedMiniCandleCell({ asset }: { asset: LiveAsset }) {
  const supported = intelligenceAssetIds.has(asset.id);
  const candles = trpc.marketData.candles.useQuery({ symbol: asset.symbol, interval: "4h", limit: 20 }, { enabled: supported && Boolean(asset.symbol), staleTime: 30_000, retry: 1 });
  const data = candles.data?.success ? candles.data.data : null;
  if (!supported) return <span className="text-[10px] uppercase tracking-[.08em] text-foreground-muted">Data unavailable</span>;
  if (!data?.candles.length) return <span className="text-[10px] uppercase tracking-[.08em] text-foreground-muted">{candles.isLoading ? "Loading" : "Data unavailable"}</span>;
  return <div className="min-w-28"><MiniCandlePreview candles={data.candles} /><span className="block text-center text-[9px] text-foreground-muted">{data.source} · 4h</span></div>;
}

function MarketCard({ asset, isFavorite, onFavorite }: { asset: LiveAsset; isFavorite: boolean; onFavorite: (id: string) => void }) {
  return <article className="nexus-density-card p-4"><div className="flex items-start justify-between gap-3"><AssetIdentity asset={asset} /><FavoriteButton asset={asset} isFavorite={isFavorite} onFavorite={onFavorite} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><Metric label="Price" value={formatPrice(asset.priceUsd)} /><Metric label="24h movement" value={<ChangeBadge change={asset.priceChange24hPercent} />} /><Metric label="24h volume" value={formatCompactCurrency(asset.volume24hUsd)} /><Metric label="Market cap" value={formatCompactCurrency(asset.marketCapUsd)} /></dl><Link href={`/assets/${encodeURIComponent(asset.id)}`} className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2.5 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none">Open asset details</Link></article>;
}

function PremiumMarketCard({ asset }: { asset: LiveAsset }) {
  const intelligence = useAssetIntelligence(asset.id, "4h");
  const candles = trpc.marketData.candles.useQuery({ symbol: asset.symbol, interval: "4h", limit: 28 }, { enabled: Boolean(asset.symbol), staleTime: 30_000, retry: 1 });
  const intelligenceData = intelligence.data?.success ? intelligence.data.data : null;
  const primary = intelligenceData?.timeframes.find((frame) => frame.timeframe === intelligenceData.primaryTimeframe) ?? null;
  const candleData = candles.data?.success ? candles.data.data : null;
  const trend = primary?.structure.status === "AVAILABLE" ? humanize(primary.structure.value.trend) : "Insufficient data";
  const momentum = primary?.momentum.status === "AVAILABLE" ? humanize(primary.momentum.value.direction) : "Insufficient data";
  const volatility = primary?.volatility.status === "AVAILABLE" ? humanize(primary.volatility.value.level) : "Insufficient data";
  const risk = intelligenceData?.riskScore.value ?? null;
  const analysis = intelligenceData?.explanation.summary ?? "Insufficient data: Nexus will not render an analysis without verified evidence.";
  return <article className="nexus-card nexus-card--interactive nexus-density-card flex min-h-[348px] flex-col p-4">
    <div className="flex items-start justify-between gap-3"><AssetIdentity asset={asset} /><ChangeBadge change={asset.priceChange24hPercent} /></div>
    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="nexus-numeric text-xl font-bold text-foreground">{formatPrice(asset.priceUsd)}</p><p className="mt-1 text-xs text-foreground-muted">Vol. {formatCompactCurrency(asset.volume24hUsd)} · Cap {formatCompactCurrency(asset.marketCapUsd)}</p></div><Link href={`/assets/${encodeURIComponent(asset.id)}`} className="rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary focus-visible:outline-none">Open</Link></div>
    <div className="mt-4 min-h-24 rounded-xl border border-border/70 bg-background/35 p-2"><MiniCandlePreview candles={candleData?.candles ?? []} /><p className="mt-1 text-[10px] text-foreground-muted">{candleData ? `${candleData.source} · verified 4h candles` : candles.isLoading ? "Loading verified candles" : "No verified candles available"}</p></div>
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><TerminalDatum label="Risk" value={risk === null ? "Insufficient data" : `${risk}/100`} /><TerminalDatum label="Momentum" value={momentum} /><TerminalDatum label="Trend" value={trend} /><TerminalDatum label="Volatility" value={volatility} /></dl>
    <div className="mt-4 border-t border-border/70 pt-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-primary"><Sparkles className="size-3" aria-hidden="true" /> Nexus analysis</p><p className="mt-1.5 line-clamp-2 text-xs leading-5 text-foreground-secondary">{analysis}</p></div>
  </article>;
}

function MiniCandlePreview({ candles }: { candles: Array<{ open: number; high: number; low: number; close: number }> }) {
  if (!candles.length) return <div className="grid h-16 place-items-center text-xs text-foreground-muted">No verified OHLCV</div>;
  const visible = candles.slice(-24);
  const minimum = Math.min(...visible.map((candle) => candle.low));
  const maximum = Math.max(...visible.map((candle) => candle.high));
  const range = maximum - minimum || 1;
  const y = (price: number) => 58 - ((price - minimum) / range) * 52;
  const width = 100 / visible.length;
  return <svg className="h-16 w-full" viewBox="0 0 100 64" preserveAspectRatio="none" role="img" aria-label="Verified four hour candlestick preview"><title>Verified four hour candlestick preview</title>{visible.map((candle, index) => { const x = index * width + width / 2; const up = candle.close >= candle.open; const color = up ? "var(--success)" : "var(--danger)"; const bodyTop = y(Math.max(candle.open, candle.close)); const bodyBottom = y(Math.min(candle.open, candle.close)); return <g key={index}><line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={0.55} opacity={0.84} /><rect x={x - Math.max(width * 0.27, 0.35)} y={bodyTop} width={Math.max(width * 0.54, 0.7)} height={Math.max(bodyBottom - bodyTop, 0.8)} rx={0.32} fill={color} /></g>; })}</svg>;
}

function TerminalDatum({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-muted">{label}</dt><dd className="mt-1 truncate text-xs font-semibold text-foreground-secondary">{value}</dd></div>; }

function FavoriteButton({ asset, isFavorite, onFavorite }: { asset: LiveAsset; isFavorite: boolean; onFavorite: (id: string) => void }) {
  return <button type="button" onClick={() => onFavorite(asset.id)} aria-label={`${isFavorite ? "Remove" : "Add"} ${asset.name} ${isFavorite ? "from" : "to"} local watchlist`} aria-pressed={isFavorite} className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none ${isFavorite ? "border-warning/50 bg-warning/10 text-warning" : "border-border text-foreground-muted hover:border-warning/50 hover:text-warning"}`}><Star className="size-4" fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" /></button>;
}

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return <span className="text-xs text-foreground-muted">—</span>;
  const positive = change >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}><Icon className="size-3.5" aria-hidden="true" />{positive ? "+" : ""}{change.toFixed(2)}%</span>;
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-foreground-muted">{label}</dt><dd className="mt-1 font-mono font-semibold text-foreground">{value}</dd></div>;
}

function Pagination({ page, hasMore, onPrevious, onNext }: { page: number; hasMore: boolean; onPrevious: () => void; onNext: () => void }) {
  return <nav className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5" aria-label="Market directory pages"><p className="text-xs text-foreground-muted">Page {page} · 50 assets per page</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={onPrevious} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none"><ChevronLeft className="size-3.5" aria-hidden="true" /> Previous</button><button type="button" disabled={!hasMore} onClick={onNext} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none">Next <ChevronRight className="size-3.5" aria-hidden="true" /></button></div></nav>;
}

function MarketLoading() {
  return <div className="space-y-3 p-4 sm:p-5" aria-live="polite"><span className="sr-only">Loading live market data</span>{Array.from({ length: 8 }).map((_, index) => <div key={index} className="grid grid-cols-[2fr_1fr_1fr] gap-4 rounded-xl border border-border/60 p-4 sm:grid-cols-[2fr_1fr_1fr_1fr]"><div className="h-10 rounded-lg bg-muted" /><div className="h-10 rounded-lg bg-muted" /><div className="h-10 rounded-lg bg-muted" /><div className="hidden h-10 rounded-lg bg-muted sm:block" /></div>)}</div>;
}

function MarketError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex flex-col items-center gap-3 p-10 text-center"><CircleAlert className="size-8 text-danger" aria-hidden="true" /><h3 className="font-semibold text-foreground">Live market data is unavailable</h3><p className="max-w-md text-sm leading-6 text-foreground-secondary">{message}</p><button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none">Retry live data</button></div>;
}

function EmptyMarkets({ query, direction }: { query: string; direction: DirectionFilter }) {
  const detail = query.trim().length >= 2 ? `No live asset matches “${query.trim()}”.` : direction === "all" ? "No live assets are available in this result set." : `No visible assets match the ${direction} filter.`;
  return <div className="p-10 text-center"><Search className="mx-auto size-8 text-foreground-muted" aria-hidden="true" /><h3 className="mt-3 font-semibold text-foreground">No matching market</h3><p className="mt-1 text-sm text-foreground-secondary">{detail} Try a different name, ticker, or movement filter.</p></div>;
}

function MarketStat({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="nexus-density-card rounded-2xl border border-border bg-card/82 p-5 shadow-[0_18px_50px_rgba(3,7,34,0.15)]"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground-muted">{label}</p><p className="nexus-numeric mt-3 text-2xl font-semibold text-foreground">{value}</p><p className="mt-2 text-sm text-foreground-secondary">{note}</p></article>;
}

function formatPrice(value: number | null) {
  if (value === null) return "—";
  const digits = value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatCompactCurrency(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatUpdatedAt(value: number | null) {
  if (!value) return "awaiting update";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
