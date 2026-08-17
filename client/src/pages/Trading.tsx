import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown, CircleAlert, CloudOff, Info, RefreshCw, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ProgressiveLiveCandles from "@/components/ProgressiveLiveCandles";
import { type ChartAnnotation } from "@/components/CandlestickChart";
import { LiveDataRateLimitNotice } from "@/components/LiveDataRateLimitNotice";
import { NexusBinaryToggle } from "@/components/NexusBinaryToggle";
import { getLiveRefreshControlState, useLiveFrameIntelligence, useLiveRateLimitStatus, useLiveTradingContext } from "@/hooks/useLiveMarketData";
import { trpc } from "@/lib/trpc";
import { LIVE_ANALYTICAL_DISCLOSURE } from "@/lib/liveIntelligenceDisclosure";
import { NexusDensityControl } from "@/components/NexusDensityControl";

const orderTypes = ["market", "limit", "stop"] as const;
const intervalOptions = ["15m", "1h", "4h", "1d"] as const;
const supportedPairs = [
  { symbol: "BTC", label: "BTC / USD" },
  { symbol: "ETH", label: "ETH / USD" },
  { symbol: "SOL", label: "SOL / USD" },
  { symbol: "BNB", label: "BNB / USD" },
  { symbol: "XRP", label: "XRP / USD" },
] as const;
const intelligenceAssetIds = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin", XRP: "ripple" } as const;

type OrderType = (typeof orderTypes)[number];
type TradingInterval = (typeof intervalOptions)[number];

function initialPair() {
  const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("asset")?.toUpperCase();
  return supportedPairs.some((pair) => pair.symbol === requested) ? requested! : "BTC";
}

export default function Trading() {
  const [selectedBase, setSelectedBase] = useState(initialPair);
  const [interval, setInterval] = useState<TradingInterval>("1h");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("0.5");
  const [stopMethod, setStopMethod] = useState<"fixed" | "atr" | "structure">("atr");
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<{
    requestKey: string;
    symbol: string;
    side: "buy" | "sell";
    orderType: OrderType;
    quantity: number;
    stopMethod: "fixed" | "atr" | "structure";
    triggerPriceUsd: number | null;
  } | null>(null);
  const utils = trpc.useUtils();
  const previewFallback = useMemo(() => ({ requestKey: "inactive-preview", symbol: "BTC", side: "buy" as const, orderType: "market" as const, quantity: 0.000001, stopMethod: "atr" as const, triggerPriceUsd: null }), []);
  const riskPreview = trpc.risk.getTradePlanPreview.useQuery(previewRequest ?? previewFallback, { enabled: previewRequest !== null, retry: false });
  const confirmSimulation = trpc.risk.confirmGuardedOrder.useMutation({
    onSuccess: (result) => {
      setPreviewRequest(null);
      void utils.simulationPortfolio.getState.invalidate();
      void utils.risk.getAuditHistory.invalidate();
      void utils.risk.getEmergencyStopStatus.invalidate();
      toast.success("Simulation stored", {
        description: `No exchange order was sent. The safety-gated virtual ${result.side} of ${formatQuantity(result.quantity)} ${result.symbol} was valued at ${formatPrice(result.referencePriceUsd)} from ${formatSource(result.marketSource)}.`,
      });
    },
    onError: (error) => toast.error("Simulation was not stored", { description: error.message }),
  });
  const liveQuery = useLiveTradingContext({ symbol: selectedBase, interval });
  const intelligenceQuery = trpc.intelligence.asset.useQuery({ assetId: intelligenceAssetIds[selectedBase as keyof typeof intelligenceAssetIds], timeframes: [interval], preferredTimeframe: interval }, { staleTime: 30_000, retry: 1 });
  const response = liveQuery.data;
  const live = response?.success ? response.data : null;
  const providerMessage = !response?.success ? response?.error?.message : liveQuery.error?.message;
  const rateLimit = useLiveRateLimitStatus(response);
  const quote = live?.quote.quote ?? null;
  const referencePrice = quote?.priceUsd ?? null;
  const intelligence = intelligenceQuery.data?.success ? intelligenceQuery.data.data : null;
  const primaryFrame = intelligence?.timeframes.find((frame) => frame.timeframe === interval) ?? intelligence?.timeframes[0] ?? null;
  const chartAnnotations = useMemo<ChartAnnotation[]>(() => {
    const annotations: ChartAnnotation[] = [];
    if (riskPreview.data?.stop) annotations.push({ id: "risk-stop", price: riskPreview.data.stop.stopPriceUsd, label: "PLAN STOP", tone: "risk", detail: "Paper-trading protection plan" });
    if (riskPreview.data?.rewardRisk) annotations.push({ id: "risk-target", price: riskPreview.data.rewardRisk.targetPriceUsd, label: "PLAN TARGET", tone: "target", detail: "Paper-trading reward/risk plan" });
    if (!showIntelligence || primaryFrame?.structure.status !== "AVAILABLE") return annotations;
    primaryFrame.structure.value.support.slice(0, 1).forEach((level) => annotations.push({ id: `support-${level.price}`, price: level.price, label: "SUPPORT", tone: "structure", detail: `${level.touches} confirmed touches` }));
    primaryFrame.structure.value.resistance.slice(0, 1).forEach((level) => annotations.push({ id: `resistance-${level.price}`, price: level.price, label: "RESISTANCE", tone: "intelligence", detail: `${level.touches} confirmed touches` }));
    return annotations;
  }, [primaryFrame, riskPreview.data?.rewardRisk, riskPreview.data?.stop, showIntelligence]);

  useEffect(() => {
    if (referencePrice !== null && orderType === "market") setPrice(toInputPrice(referencePrice));
  }, [orderType, referencePrice]);

  const numericPrice = Number.parseFloat(price);
  const numericAmount = Number.parseFloat(amount);
  const total = Number.isFinite(numericPrice * numericAmount) ? numericPrice * numericAmount : 0;
  const validationError = useMemo(() => {
    if (amount.trim() === "" || !Number.isFinite(numericAmount) || numericAmount <= 0) return `Enter a positive ${selectedBase} amount.`;
    if (orderType !== "market" && (price.trim() === "" || !Number.isFinite(numericPrice) || numericPrice <= 0)) return "Enter a valid limit or stop price.";
    if (orderType === "market" && referencePrice === null) return "A live reference price is required before previewing a market simulation.";
    if (!Number.isFinite(total) || total <= 0) return "The simulated order total must be greater than zero.";
    return null;
  }, [amount, numericAmount, numericPrice, orderType, price, referencePrice, selectedBase, total]);

  const handlePreview = () => {
    if (validationError) {
      toast.error("Review the simulated order", { description: validationError });
      return;
    }
    setPreviewRequest({
      requestKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${selectedBase}-${side}`,
      symbol: selectedBase,
      side,
      orderType,
      quantity: numericAmount,
      stopMethod,
      triggerPriceUsd: orderType === "market" ? null : numericPrice,
    });
  };

  const handleConfirm = () => {
    if (validationError || confirmSimulation.isPending || !previewRequest || riskPreview.data?.gate.decision !== "ACCEPTED") return;
    confirmSimulation.mutate(previewRequest);
  };

  const selectedPair = supportedPairs.find((pair) => pair.symbol === selectedBase) ?? supportedPairs[0];
  const isInitialLoading = liveQuery.isLoading && !live;
  const stale = live?.isStale ?? false;

  return (
    <main className="nexus-surface min-h-screen text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="nexus-density-header container flex flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">Live spot simulation workspace</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{selectedPair.label}</h1>
              <label className="sr-only" htmlFor="live-trading-pair">Trading pair</label>
              <select id="live-trading-pair" value={selectedBase} onChange={(event) => setSelectedBase(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground-secondary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25">
                {supportedPairs.map((pair) => <option key={pair.symbol} value={pair.symbol}>{pair.label}</option>)}
              </select>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-foreground-secondary">Read-only public market data powers price, candles, depth, and tape. The ticket below is simulation-only and cannot submit a real trade.</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 sm:justify-end">
            <NexusDensityControl />
            <LiveStatus isOnline={liveQuery.isOnline} isFetching={liveQuery.isFetching} isStale={stale} isRateLimited={rateLimit.isRateLimited} retryAfterSeconds={rateLimit.retryAfterSeconds} cachedAt={live?.cachedAt ?? null} onRefresh={() => void liveQuery.refetch()} />
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{formatPrice(referencePrice)}</p>
              <Change change={quote?.priceChange24hPercent ?? null} suffix="24h" />
            </div>
          </div>
        </div>
      </header>

      <div className="nexus-density-shell container py-5 sm:py-7 lg:py-8">
        {!liveQuery.isOnline ? <MarketNotice icon={<CloudOff className="size-4" aria-hidden="true" />}>You are offline. Automatic market refresh is paused until the connection returns.</MarketNotice> : null}
        {stale && live ? <MarketNotice icon={<CircleAlert className="size-4" aria-hidden="true" />}>Showing cached live context from {formatUpdatedAt(live.cachedAt)} while an upstream market feed recovers.</MarketNotice> : null}
        {rateLimit.isRateLimited ? <LiveDataRateLimitNotice retryAfterSeconds={rateLimit.retryAfterSeconds} onRetry={() => void liveQuery.refetch()} /> : null}
        {providerMessage && !live && !rateLimit.isRateLimited ? <MarketError message={providerMessage} onRetry={() => void liveQuery.refetch()} /> : null}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="nexus-density-grid mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
          <div className="min-w-0 space-y-3 xl:col-span-8">
            {isInitialLoading ? <ChartSkeleton /> : <><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5"><div className="inline-flex rounded-lg border border-border bg-background-secondary p-1" role="group" aria-label="Candlestick interval">{intervalOptions.map((option) => <button key={option} type="button" aria-pressed={interval === option} onClick={() => setInterval(option)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-none ${interval === option ? "bg-primary text-primary-foreground" : "text-foreground-secondary hover:bg-card hover:text-foreground"}`}>{option.toUpperCase()}</button>)}</div><button type="button" onClick={() => setShowIntelligence((current) => !current)} aria-pressed={showIntelligence} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none ${showIntelligence ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-foreground-secondary hover:bg-background-secondary hover:text-foreground"}`}><Sparkles className="size-3.5" />Intelligence {showIntelligence ? "on" : "off"}</button></div><ProgressiveLiveCandles initialCandles={live?.candles.candles ?? []} initialSnapshotAt={live?.candles.cachedAt ?? null} symbol={selectedBase} interval={interval} source={live?.candles.source ?? "binance"} sourceLabel={`${formatSource(live?.candles.source ?? "binance")} · ${live ? formatUpdatedAt(live.cachedAt) : "connecting"}`} isStale={stale} annotations={chartAnnotations} />{showIntelligence ? <ChartIntelligenceOverlay intelligence={intelligence} primaryFrame={primaryFrame} assetId={intelligenceAssetIds[selectedBase as keyof typeof intelligenceAssetIds]} source={live?.candles.source ?? null} interval={interval} isLoading={intelligenceQuery.isLoading} errorMessage={!intelligenceQuery.data?.success ? intelligenceQuery.data?.error?.message : intelligenceQuery.error?.message} /> : null}</>}
          </div>

          <section className="nexus-density-card min-w-0 rounded-2xl border border-border bg-card/75 p-4 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl sm:p-5 xl:col-span-4" aria-labelledby="spot-order-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Simulation-only order ticket</p>
                <h2 id="spot-order-title" className="mt-1 text-lg font-semibold text-foreground">Model an order</h2>
              </div>
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">No exchange execution</span>
            </div>

            <NexusBinaryToggle className="mt-5" value={side} onValueChange={setSide} ariaLabel="Order side" options={[{ value: "buy", label: "Buy", icon: <ArrowUpRight />, tone: "success" }, { value: "sell", label: "Sell", icon: <ArrowDownRight />, tone: "danger" }]} />

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-background-secondary p-1" role="group" aria-label="Order type">
              {orderTypes.map((type) => <button key={type} type="button" aria-pressed={orderType === type} onClick={() => setOrderType(type)} className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize transition-colors focus-visible:outline-none ${orderType === type ? "bg-card text-foreground shadow-sm" : "text-foreground-secondary hover:text-foreground"}`}>{type}</button>)}
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-xs font-medium text-foreground-secondary"><span>{orderType === "market" ? "Live reference price" : "Simulation price"}</span><span>USD</span></span>
                <input aria-label="Price in USD" inputMode="decimal" type="number" value={price} disabled={orderType === "market"} onChange={(event) => setPrice(event.target.value)} className="w-full rounded-xl border border-border bg-background-secondary px-3.5 py-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted disabled:cursor-not-allowed disabled:opacity-70 focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="0.00" />
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-xs font-medium text-foreground-secondary"><span>Protective stop method</span><span>Paper plan</span></span>
                <select value={stopMethod} onChange={(event) => setStopMethod(event.target.value as typeof stopMethod)} className="w-full rounded-xl border border-border bg-background-secondary px-3.5 py-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25">
                  <option value="atr">ATR based</option>
                  <option value="fixed">Fixed percentage</option>
                  <option value="structure">Market structure</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-xs font-medium text-foreground-secondary"><span>Simulation amount</span><span>{selectedBase}</span></span>
                <div className="flex gap-2">
                  <input aria-label={`Amount in ${selectedBase}`} inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-background-secondary px-3.5 py-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="0.00" />
                  <button type="button" onClick={() => setAmount(selectedBase === "BTC" ? "0.01" : "1")} className="rounded-xl border border-border bg-background-secondary px-3 text-xs font-semibold text-foreground-secondary transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none">Example</button>
                </div>
              </label>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Quick simulated allocation">
                {["25%", "50%", "75%", "100%"].map((percentage) => <button key={percentage} type="button" onClick={() => setAmount(((selectedBase === "BTC" ? 0.01 : 1) * (Number.parseInt(percentage, 10) / 100)).toString())} className="rounded-lg border border-border bg-background-secondary py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none">{percentage}</button>)}
              </div>
              <div className="rounded-xl border border-border bg-background-secondary p-3.5"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-foreground-secondary">Simulation total</span><span className="font-mono font-semibold text-foreground">{formatPrice(total || null)}</span></div></div>
              {validationError ? <p className="flex gap-2 text-xs leading-5 text-danger" role="alert"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{validationError}</p> : null}
              <button type="button" onClick={handlePreview} disabled={Boolean(validationError)} className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none ${side === "buy" ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90"}`}>Preview {side === "buy" ? "buy" : "sell"} simulation</button>
              <p className="flex gap-2 text-xs leading-5 text-foreground-muted"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Confirmation stores a virtual transaction only. Its valuation is refreshed from the server’s live public quote; no exchange account or real order is used.</p>
            </div>
          </section>

          {previewRequest ? <RiskPlanReview plan={riskPreview.data} isLoading={riskPreview.isLoading} error={riskPreview.error?.message} isPending={confirmSimulation.isPending} onCancel={() => setPreviewRequest(null)} onConfirm={handleConfirm} /> : null}

          <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl xl:col-span-7" aria-labelledby="order-book-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Live market depth</p><h2 id="order-book-title" className="mt-1 text-lg font-semibold text-foreground">Read-only order book</h2></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{formatSource(live?.orderBook.source)}</span></div>
            <div className="p-4 sm:p-5" aria-busy={isInitialLoading}>
              <div className="grid grid-cols-[1fr_.7fr_1fr] gap-2 text-[10px] font-medium uppercase tracking-[0.1em] text-foreground-muted sm:gap-4 sm:text-xs"><span>Price</span><span className="text-right">Amount</span><span className="text-right">Total</span></div>
              {isInitialLoading ? <OrderBookSkeleton /> : live ? <><div className="mt-2 space-y-1">{live.orderBook.asks.slice(0, 8).map((ask, index) => <OrderBookRow key={`ask-${index}-${ask.priceUsd}`} price={ask.priceUsd} amount={ask.quantity} total={ask.totalUsd} side="ask" />)}</div><div className="my-3 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-xs"><span className="text-foreground-secondary">Live reference mid</span><span className="font-mono font-semibold text-foreground">{formatPrice(referencePrice)}</span></div><div className="space-y-1">{live.orderBook.bids.slice(0, 8).map((bid, index) => <OrderBookRow key={`bid-${index}-${bid.priceUsd}`} price={bid.priceUsd} amount={bid.quantity} total={bid.totalUsd} side="bid" />)}</div></> : <EmptyLivePanel label="No live depth is available for this pair yet." />}
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl xl:col-span-5" aria-labelledby="recent-trades-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Live public tape</p><h2 id="recent-trades-title" className="mt-1 text-lg font-semibold text-foreground">Recent market trades</h2></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{formatSource(live?.trades.source)}</span></div>
            <div className="p-4 sm:p-5" aria-busy={isInitialLoading}>
              <div className="grid grid-cols-[1.1fr_.75fr_.85fr_.7fr] gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-foreground-muted sm:gap-3 sm:text-xs"><span>Price</span><span className="text-right">Amount</span><span className="text-right">Time</span><span className="text-right">Side</span></div>
              {isInitialLoading ? <TapeSkeleton /> : live?.trades.trades.length ? <div className="mt-2 divide-y divide-border/80">{live.trades.trades.map((trade) => <TradeRow key={`${trade.id}-${trade.occurredAt}`} price={trade.priceUsd} amount={trade.quantity} time={trade.occurredAt} side={trade.side} />)}</div> : <EmptyLivePanel label="No recent public trades are available for this pair yet." />}
            </div>
          </section>
        </motion.div>
      </div>
    </main>
  );
}

function RiskPlanReview({ plan, isLoading, error, isPending, onCancel, onConfirm }: { plan: { gate: { decision: "ACCEPTED" | "REJECTED"; primaryReason: string | null; checks: Array<{ id: string; label: string; status: "PASS" | "BLOCK" | "NOT_APPLICABLE"; reason: string }> }; referencePriceUsd: number; stop: { stopPriceUsd: number } | null; sizing: { approvedQuantity: number; plannedLossUsd: number } | null; rewardRisk: { targetPriceUsd: number; rewardRiskRatio: number } | null; riskLevel: { level: string | null } } | undefined; isLoading: boolean; error?: string; isPending: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (isLoading) return <section className="xl:col-span-12 rounded-2xl border border-border bg-card/75 p-5 text-sm text-foreground-secondary" aria-live="polite">Building a deterministic paper-risk plan from the latest public data…</section>;
  if (!plan || error) return <section className="xl:col-span-12 rounded-2xl border border-danger/30 bg-danger/10 p-5 text-sm text-danger" role="alert"><p>{error ?? "Risk plan is unavailable. No simulation can be confirmed."}</p><button type="button" onClick={onCancel} className="mt-3 rounded-lg border border-danger/30 px-3 py-2 text-xs font-semibold focus-visible:outline-none">Edit simulation</button></section>;
  const accepted = plan.gate.decision === "ACCEPTED";
  return <section className={`xl:col-span-12 rounded-2xl border p-4 shadow-[0_24px_80px_rgba(3,7,34,0.2)] backdrop-blur-xl sm:p-5 ${accepted ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}`} aria-labelledby="risk-plan-title"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex gap-3"><span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${accepted ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>{accepted ? <ShieldCheck className="size-5" aria-hidden="true" /> : <ShieldAlert className="size-5" aria-hidden="true" />}</span><div><p className={`text-xs font-semibold uppercase tracking-[0.16em] ${accepted ? "text-success" : "text-danger"}`}>Trade Safety Gate · {accepted ? "accepted" : "blocked"}</p><h2 id="risk-plan-title" className="mt-1 text-base font-semibold text-foreground">{accepted ? "Paper plan is within current configured boundaries" : plan.gate.primaryReason ?? "Paper plan is blocked"}</h2><p className="mt-1 text-sm text-foreground-secondary">No exchange order can be submitted from this workspace. Final confirmation re-evaluates the protection gate.</p></div></div><div className="flex flex-wrap gap-3"><button type="button" onClick={onCancel} disabled={isPending} className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground disabled:opacity-60 focus-visible:outline-none">Edit plan</button><button type="button" onClick={onConfirm} disabled={!accepted || isPending} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none">{isPending ? "Storing paper trade…" : accepted ? "Confirm paper trade" : "Confirmation blocked"}</button></div></div><dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><PlanStat label="Entry" value={formatPrice(plan.referencePriceUsd)} /><PlanStat label="Stop" value={formatPrice(plan.stop?.stopPriceUsd ?? null)} /><PlanStat label="Target" value={formatPrice(plan.rewardRisk?.targetPriceUsd ?? null)} /><PlanStat label="Risk level" value={plan.riskLevel.level ?? "Unavailable"} /><PlanStat label="Approved size" value={plan.sizing ? formatQuantity(plan.sizing.approvedQuantity) : "—"} /><PlanStat label="Planned loss" value={formatPrice(plan.sizing?.plannedLossUsd ?? null)} /><PlanStat label="Reward / risk" value={plan.rewardRisk ? `${plan.rewardRisk.rewardRiskRatio.toFixed(2)}×` : "—"} /></dl><ul className="mt-5 grid gap-2 sm:grid-cols-2">{plan.gate.checks.map((check) => <li key={check.id} className={`rounded-lg border px-3 py-2 text-xs ${check.status === "BLOCK" ? "border-danger/25 bg-danger/10 text-danger" : check.status === "PASS" ? "border-success/25 bg-success/10 text-success" : "border-border bg-background-secondary text-foreground-secondary"}`}><span className="font-semibold">{check.label}</span><span className="ml-1.5 opacity-90">{check.reason}</span></li>)}</ul></section>;
}
function PlanStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-background-secondary/80 p-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">{label}</dt><dd className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{value}</dd></div>; }

function LiveStatus({ isOnline, isFetching, isStale, isRateLimited, retryAfterSeconds, cachedAt, onRefresh }: { isOnline: boolean; isFetching: boolean; isStale: boolean; isRateLimited: boolean; retryAfterSeconds: number; cachedAt: number | null; onRefresh: () => void }) {
  const text = !isOnline ? "Offline" : isStale ? `Cached · ${cachedAt ? formatUpdatedAt(cachedAt) : "awaiting"}` : `Live · ${cachedAt ? formatUpdatedAt(cachedAt) : "connecting"}`;
  const tone = !isOnline || isStale ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success";
  const refreshControl = getLiveRefreshControlState({ isOnline, isFetching, isRateLimited });
  return <div className="flex items-center gap-2"><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone}`}><span className={`size-2 rounded-full ${!isOnline || isStale ? "bg-warning" : "bg-success"} ${isFetching ? "animate-pulse" : ""}`} aria-hidden="true" />{text}</span><button type="button" onClick={onRefresh} disabled={refreshControl.disabled} className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none" aria-label={isRateLimited ? `Live trading refresh paused for about ${retryAfterSeconds} seconds` : "Refresh live trading data"}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" /></button></div>;
}

function MarketNotice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) { return <aside className="mb-5 flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" role="status">{icon}<span>{children}</span></aside>; }
function MarketError({ message, onRetry }: { message: string; onRetry: () => void }) { return <aside className="mb-5 flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{message}</span><button type="button" onClick={onRetry} className="self-start rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-danger/10 focus-visible:outline-none sm:self-auto">Retry live data</button></aside>; }
function Change({ change, suffix }: { change: number | null; suffix: string }) { if (change === null) return <p className="mt-1 text-sm font-medium text-foreground-muted">Awaiting market change</p>; const positive = change >= 0; const Icon = positive ? ArrowUpRight : ArrowDownRight; return <p className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold ${positive ? "text-success" : "text-danger"}`}><Icon className="size-4" aria-hidden="true" />{positive ? "+" : ""}{change.toFixed(2)}% {suffix}</p>; }
function OrderBookRow({ price, amount, total, side }: { price: number; amount: number; total: number; side: "ask" | "bid" }) { const isAsk = side === "ask"; return <div className="grid grid-cols-[1fr_.7fr_1fr] gap-2 rounded-lg px-1 py-1.5 text-xs transition-colors hover:bg-background-secondary sm:gap-4 sm:px-2 sm:text-sm"><span className={`truncate font-mono font-medium ${isAsk ? "text-danger" : "text-success"}`}>{formatPrice(price)}</span><span className="truncate text-right font-mono text-foreground-secondary">{formatQuantity(amount)}</span><span className="truncate text-right font-mono text-foreground-secondary">{formatCompactCurrency(total)}</span></div>; }
function TradeRow({ price, amount, time, side }: { price: number; amount: number; time: number; side: "buy" | "sell" }) { const buy = side === "buy"; const Icon = buy ? ArrowUpRight : ArrowDownRight; return <div className="grid grid-cols-[1.1fr_.75fr_.85fr_.7fr] gap-2 py-2.5 text-xs sm:gap-3 sm:text-sm"><span className="truncate font-mono font-semibold text-foreground">{formatPrice(price)}</span><span className="truncate text-right font-mono text-foreground-secondary">{formatQuantity(amount)}</span><span className="truncate text-right font-mono text-foreground-muted">{formatUpdatedAt(time)}</span><span className={`inline-flex justify-end gap-1 font-semibold ${buy ? "text-success" : "text-danger"}`}><Icon className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">{side}</span></span></div>; }
function EmptyLivePanel({ label }: { label: string }) { return <p className="py-8 text-center text-sm text-foreground-muted">{label}</p>; }
function ChartSkeleton() { return <section className="h-[460px] rounded-2xl border border-border bg-card" aria-label="Loading live price chart" aria-busy="true" />; }
type ChartIntelligenceData = { opportunityScore: { value: number | null }; riskScore: { value: number | null }; signalStrength: { value: number | null } };
type ChartIntelligenceFrame = { metadata?: { quality?: string; sampleCount?: number; unavailableReasons?: string[] }; structure?: { status: string; value: { trend: string; event: string } | null }; regime?: { status: string; value: { regime: string } | null } };
function ChartIntelligenceOverlay({ intelligence, primaryFrame, assetId, source, interval, isLoading, errorMessage }: { intelligence: ChartIntelligenceData | null; primaryFrame: ChartIntelligenceFrame | null; assetId: "bitcoin" | "ethereum" | "solana" | "binancecoin" | "ripple"; source: "binance" | "coinbase" | null; interval: TradingInterval; isLoading: boolean; errorMessage?: string | null }) {
  const liveFrameQuery = useLiveFrameIntelligence({ assetId, timeframe: interval, source, enabled: source !== null }); const liveFrame = liveFrameQuery.data?.success ? liveFrameQuery.data.data : null; const liveIntelligence = liveFrame?.intelligence ?? intelligence; const livePrimaryFrame = liveFrame?.intelligence.timeframes.find((frame) => frame.timeframe === interval) ?? liveFrame?.intelligence.timeframes[0] ?? primaryFrame;
  if ((isLoading || liveFrameQuery.isLoading) && !liveIntelligence) return <section className="rounded-xl border border-border bg-card/55 p-4 text-sm text-foreground-secondary">Loading deterministic Intelligence evidence for this timeframe…</section>;
  if (!liveIntelligence || !livePrimaryFrame) return <section className="rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm text-warning">Intelligence overlay is unavailable{errorMessage ? `: ${errorMessage}` : "."} No levels or signals were drawn.</section>;
  const structure = livePrimaryFrame.structure?.status === "AVAILABLE" ? livePrimaryFrame.structure.value : null; const regime = livePrimaryFrame.regime?.status === "AVAILABLE" ? livePrimaryFrame.regime.value : null;
  return <section className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Live analytical Intelligence · optional overlay</p><p className="mt-1 text-sm text-foreground-secondary">{liveFrame?.source ?? source ?? "provider"} · {LIVE_ANALYTICAL_DISCLOSURE}</p></div><span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-mono text-foreground-secondary">{livePrimaryFrame.metadata?.quality ?? "UNAVAILABLE"} · {livePrimaryFrame.metadata?.sampleCount ?? 0} candles{liveFrame ? ` · ${formatUpdatedAt(liveFrame.cachedAt)}` : ""}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><ChartEvidence label="Structure" value={structure ? `${structure.trend} · ${structure.event}` : "Unavailable"} /><ChartEvidence label="Regime" value={regime?.regime ?? "Unavailable"} /><ChartEvidence label="Scores" value={`${liveIntelligence.opportunityScore.value ?? "—"} opp · ${liveIntelligence.riskScore.value ?? "—"} risk · ${liveIntelligence.signalStrength.value ?? "—"} strength`} /></div>{livePrimaryFrame.metadata?.unavailableReasons?.length ? <p className="mt-3 text-xs text-warning">{livePrimaryFrame.metadata.unavailableReasons.join(" ")}</p> : null}</section>;
}
function ChartEvidence({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background/45 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">{label}</p><p className="mt-1 text-xs font-medium text-foreground-secondary">{value}</p></div>; }
function OrderBookSkeleton() { return <div className="mt-3 space-y-2" aria-label="Loading live order book" aria-busy="true">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="h-7 rounded bg-muted" />)}</div>; }
function TapeSkeleton() { return <div className="mt-3 space-y-2" aria-label="Loading recent market trades" aria-busy="true">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-8 rounded bg-muted" />)}</div>; }
function formatSource(source: "binance" | "coinbase" | "mixed" | undefined) { if (source === "coinbase") return "Coinbase Exchange"; if (source === "binance") return "Binance Public"; if (source === "mixed") return "Mixed public feeds"; return "Live provider"; }
function formatPrice(value: number | null) { if (value === null || !Number.isFinite(value)) return "—"; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 6 : 2 }).format(value); }
function formatCompactCurrency(value: number | null) { if (value === null || !Number.isFinite(value)) return "—"; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value); }
function formatQuantity(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value); }
function formatUpdatedAt(value: number) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function formatChange(value: number | null) { if (value === null || !Number.isFinite(value)) return "—"; return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function toInputPrice(value: number) { return value < 1 ? value.toFixed(6) : value.toFixed(2); }
