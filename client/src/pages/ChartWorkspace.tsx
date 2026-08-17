import React, { useMemo, useState } from "react";
import { BarChart3, CloudOff, Sparkles } from "lucide-react";
import ProgressiveLiveCandles from "@/components/ProgressiveLiveCandles";
import { NexusDensityControl } from "@/components/NexusDensityControl";
import type { ChartAnnotation } from "@/components/CandlestickChart";
import { useLiveFrameIntelligence, useLiveTradingContext } from "@/hooks/useLiveMarketData";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { LIVE_ANALYTICAL_DISCLOSURE } from "@/lib/liveIntelligenceDisclosure";

const pairs = [
  { symbol: "BTC", label: "BTC / USD", assetId: "bitcoin" },
  { symbol: "ETH", label: "ETH / USD", assetId: "ethereum" },
  { symbol: "SOL", label: "SOL / USD", assetId: "solana" },
  { symbol: "BNB", label: "BNB / USD", assetId: "binancecoin" },
  { symbol: "XRP", label: "XRP / USD", assetId: "ripple" },
] as const;
const intervals = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const intelligenceIntervals = ["5m", "15m", "1h", "4h", "1d"] as const;
const contextIntervals = ["15m", "1h", "4h", "1d"] as const;
type Interval = (typeof intervals)[number];
type IntelligenceInterval = (typeof intelligenceIntervals)[number];
type ContextInterval = (typeof contextIntervals)[number];

function isIntelligenceInterval(interval: Interval): interval is IntelligenceInterval {
  return interval !== "1m";
}

function isContextInterval(interval: Interval): interval is ContextInterval {
  return interval !== "1m" && interval !== "5m";
}

export default function ChartWorkspace() {
  const { t } = useLanguage();
  const [symbol, setSymbol] = useState<(typeof pairs)[number]["symbol"]>("BTC");
  const [interval, setInterval] = useState<Interval>("1h");
  const [intelligenceEnabled, setIntelligenceEnabled] = useState(false);
  const selected = pairs.find((pair) => pair.symbol === symbol) ?? pairs[0];
  const supportsIntelligence = isIntelligenceInterval(interval);
  const supportsTradingContext = isContextInterval(interval);
  const intelligenceInterval: IntelligenceInterval = supportsIntelligence ? interval : "5m";
  const liveQuery = useLiveTradingContext({ symbol, interval: supportsTradingContext ? interval : "15m" });
  const directCandleQuery = trpc.marketData.candles.useQuery({ symbol, interval, limit: 120 }, { enabled: !supportsTradingContext, staleTime: 30_000, retry: 1 });
  const response = liveQuery.data;
  const live = response?.success ? response.data : null;
  const directResponse = directCandleQuery.data;
  const directCandles = directResponse?.success ? directResponse.data : null;
  const activeCandles = supportsTradingContext ? live?.candles ?? null : directCandles;
  const activeIsStale = supportsTradingContext ? live?.isStale ?? false : directCandles?.isStale ?? false;
  const activeCachedAt = supportsTradingContext ? live?.cachedAt ?? null : directCandles?.cachedAt ?? null;
  const intelligenceQuery = trpc.intelligence.asset.useQuery(
    { assetId: selected.assetId, timeframes: [intelligenceInterval], preferredTimeframe: intelligenceInterval },
    { enabled: intelligenceEnabled && supportsIntelligence, staleTime: 30_000, retry: 1 },
  );
  const primaryFrame = intelligenceQuery.data?.success
    ? intelligenceQuery.data.data.timeframes.find((frame) => frame.timeframe === intelligenceInterval) ?? intelligenceQuery.data.data.timeframes[0]
    : null;
  const annotations = useMemo<ChartAnnotation[]>(() => {
    if (!intelligenceEnabled || primaryFrame?.structure.status !== "AVAILABLE") return [];
    return [
      ...primaryFrame.structure.value.support.slice(0, 1).map((level) => ({ id: `support-${level.price}`, price: level.price, label: "SUPPORT", tone: "structure" as const, detail: `${level.touches} confirmed touches` })),
      ...primaryFrame.structure.value.resistance.slice(0, 1).map((level) => ({ id: `resistance-${level.price}`, price: level.price, label: "RESISTANCE", tone: "intelligence" as const, detail: `${level.touches} confirmed touches` })),
    ];
  }, [intelligenceEnabled, primaryFrame]);

  return (
    <main className="nexus-surface min-h-screen text-foreground">
      <header className="border-b border-border bg-background/72 backdrop-blur-xl">
        <div className="nexus-density-header container flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:py-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("chartWorkspace")}</p>
            <h1 className="nexus-numeric mt-1 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl" data-financial-value>{selected.label}</h1>
            <p className="mt-1 max-w-2xl text-sm text-foreground-secondary">{t("liveVerified")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <NexusDensityControl />
            <label className="grid gap-1 text-xs text-foreground-muted">
              {t("asset")}
              <select aria-label={t("asset")} value={symbol} onChange={(event) => setSymbol(event.target.value as typeof symbol)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                {pairs.map((pair) => <option key={pair.symbol} value={pair.symbol}>{pair.label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap rounded-md border border-border bg-card p-1" role="group" aria-label={t("timeframe")}>
              {intervals.map((option) => <button key={option} type="button" aria-pressed={interval === option} onClick={() => setInterval(option)} className={`nx-button px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${interval === option ? "bg-primary text-primary-foreground" : "text-foreground-secondary hover:bg-background-secondary"}`}>{option.toUpperCase()}</button>)}
              {[["30m", "The active verified provider contract does not expose a 30m interval."], ["1W", "The active verified provider contract does not expose a 1W interval."], ["1M", "The active verified provider contract does not expose a 1M interval."]].map(([label, detail]) => <span key={label} aria-disabled="true" className="cursor-not-allowed rounded-md px-2.5 py-1.5 text-xs font-semibold text-foreground-muted" title={detail}>{label} · unavailable</span>)}
            </div>
            <button type="button" aria-pressed={intelligenceEnabled} onClick={() => setIntelligenceEnabled((value) => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${intelligenceEnabled ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-foreground-secondary"}`}>
              <Sparkles className="size-3.5" />{t("intelligence")} {intelligenceEnabled ? t("enabled") : t("disabled")}
            </button>
          </div>
        </div>
      </header>
      <div className="nexus-density-shell container py-5 sm:py-7">
        <section className="nx-panel nexus-density-card p-3 shadow-[0_14px_30px_rgba(0,0,0,.28)] sm:p-4">
          {activeCandles ? (
            <ProgressiveLiveCandles symbol={symbol} interval={interval} source={activeCandles.source} initialCandles={activeCandles.candles} initialSnapshotAt={activeCandles.cachedAt} sourceLabel={`${activeCandles.source} · ${activeCachedAt ? new Date(activeCachedAt).toLocaleString() : "timestamp unavailable"}`} isStale={activeIsStale} annotations={annotations} />
          ) : (
            <div className="grid min-h-80 place-items-center rounded-xl border border-dashed border-border bg-background/35 px-5 text-center">
              <div>
                <BarChart3 className="mx-auto size-7 text-primary" />
                <p className="mt-3 font-medium">{liveQuery.isLoading || directCandleQuery.isLoading ? t("loadingChart") : t("noChartData")}</p>
                <p className="mt-1 text-sm text-foreground-muted">{!liveQuery.isLoading && !directCandleQuery.isLoading ? response?.success === false ? response.error.message : directResponse?.success === false ? directResponse.error.message : liveQuery.error?.message ?? directCandleQuery.error?.message ?? t("chartEmpty") : ""}</p>
                {!liveQuery.isOnline ? <p className="mt-3 inline-flex items-center gap-1 text-xs text-warning"><CloudOff className="size-3.5" />{t("offlinePaused")}</p> : null}
              </div>
            </div>
          )}
        </section>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="nx-panel p-3"><p className="nexus-eyebrow">Chart tools</p><div className="mt-2 flex flex-wrap gap-2"><span className="nexus-status-pill" data-status="positive"><span className="nexus-status-dot" />Volume</span><span className="nexus-status-pill" data-status="positive"><span className="nexus-status-dot" />SMA / ATR</span><span className="nexus-status-pill" title="The current chart renderer does not expose an EMA overlay."><span className="nexus-status-dot" />EMA unavailable</span><span className="nexus-status-pill" title="The current chart renderer does not expose RSI or MACD panels."><span className="nexus-status-dot" />RSI / MACD unavailable</span></div><p className="mt-3 text-xs text-foreground-secondary">Zoom, pan, crosshair, selected-candle evidence, and validated gap visibility are available in the chart. Unavailable tools are not simulated.</p></section>
          <aside className="nx-panel p-3" aria-label={t("intelligenceEvidence")}>{intelligenceEnabled && supportsIntelligence ? <LiveWorkspaceIntelligence assetId={selected.assetId} interval={intelligenceInterval} source={activeCandles?.source ?? null} fallbackLoading={intelligenceQuery.isLoading} fallbackAvailable={Boolean(primaryFrame)} /> : <><p className="nexus-eyebrow">{t("intelligenceEvidence")}</p><p className="mt-2 text-xs leading-5 text-foreground-secondary">{intelligenceEnabled ? "No eligible evidence exists for this interval." : "Enable Intelligence only when you want the current evidence rail."}</p></>}</aside>
        </div>
        {intelligenceEnabled && !supportsIntelligence ? <section className="nexus-density-card mt-4 rounded-md border border-warning/30 bg-warning/8 p-4 text-sm text-warning" role="status">The active 1m chart remains provider-verified, but Nexus Intelligence has no eligible deterministic 1m evidence contract. No analysis or annotation is shown.</section> : null}
      </div>
    </main>
  );
}

function LiveWorkspaceIntelligence({ assetId, interval, source, fallbackLoading, fallbackAvailable }: { assetId: (typeof pairs)[number]["assetId"]; interval: IntelligenceInterval; source: "binance" | "coinbase" | null; fallbackLoading: boolean; fallbackAvailable: boolean }) {
  const { t } = useLanguage();
  const query = useLiveFrameIntelligence({ assetId, timeframe: interval, source, enabled: source !== null });
  const live = query.data?.success ? query.data.data : null;
  const frame = live?.intelligence.timeframes.find((candidate) => candidate.timeframe === interval) ?? live?.intelligence.timeframes[0];
  return <section><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">{t("intelligenceEvidence")} · live analytical refresh</p><p className="mt-2 text-xs leading-5 text-foreground-secondary">{query.isLoading || fallbackLoading ? t("evidenceLoading") : frame ?? fallbackAvailable ? LIVE_ANALYTICAL_DISCLOSURE : t("evidenceUnavailable")}</p>{live ? <p className="mt-2 text-[10px] text-foreground-muted">{live.source} · {new Date(live.cachedAt).toLocaleTimeString()} · {frame?.metadata?.quality ?? "UNAVAILABLE"}</p> : null}</section>;
}
