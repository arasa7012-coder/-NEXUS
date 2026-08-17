import * as React from "react";
import { ArrowDownRight, ArrowUpRight, BriefcaseBusiness, CloudOff, CircleAlert, History, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useLiveSimulationPortfolio } from "@/hooks/useLiveMarketData";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type SimulationPosition = {
  symbol: string;
  quantity: number;
  averageCostUsd: number;
  currentPriceUsd: number | null;
  marketValueUsd: number;
  costBasisUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercent: number;
  allocationPercent: number;
  source: "binance" | "coinbase" | null;
  providerUpdatedAt: number | null;
  isStale: boolean;
  unavailable: boolean;
};

type SimulationTransaction = {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop";
  quantity: number;
  referencePriceUsd: number;
  notionalUsd: number;
  marketSource: string;
  executedAt: string | Date;
};

export default function Portfolio() {
  const simulationQuery = useLiveSimulationPortfolio();
  const state = simulationQuery.data;
  const portfolio = state?.portfolio ?? null;
  const positions = (state?.positions ?? []) as SimulationPosition[];
  const transactions = (state?.transactions ?? []) as SimulationTransaction[];
  const emergency = trpc.risk.getEmergencyStopStatus.useQuery();
  const protection = trpc.risk.getPortfolioProtection.useQuery(undefined, { enabled: Boolean(state) });
  const monitoring = trpc.risk.monitorPositions.useQuery(undefined, { enabled: Boolean(state) });
  const utils = trpc.useUtils();
  const activateEmergency = trpc.risk.activateEmergencyStop.useMutation({
    onSuccess: () => { void utils.risk.getEmergencyStopStatus.invalidate(); void utils.risk.monitorPositions.invalidate(); toast.success("Emergency Stop activated for paper trading"); },
    onError: (error) => toast.error("Emergency Stop was not activated", { description: error.message }),
  });
  const resetEmergency = trpc.risk.resetEmergencyStop.useMutation({
    onSuccess: () => { void utils.risk.getEmergencyStopStatus.invalidate(); toast.success("Emergency Stop reset"); },
    onError: (error) => toast.error("Emergency Stop was not reset", { description: error.message }),
  });
  const refreshProtection = () => { void simulationQuery.refetch(); void protection.refetch(); void monitoring.refetch(); void emergency.refetch(); };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="container flex flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">Server-valued virtual ledger</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Simulation portfolio</h1>
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">No exchange account</span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-foreground-secondary">Track virtual cash, simulated positions, live-valued allocation, and immutable preview-only order history. Nothing here submits or mirrors a real trade.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PortfolioStatus isOnline={simulationQuery.isOnline} isFetching={simulationQuery.isFetching} isStale={state?.isStale ?? false} />
            <button type="button" onClick={refreshProtection} disabled={!simulationQuery.isOnline || simulationQuery.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none">
              <RefreshCw className={`size-3.5 ${simulationQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh valuation
            </button>
          </div>
        </div>
      </header>

      <div className="container py-5 sm:py-7 lg:py-8">
        {!simulationQuery.isOnline ? <PortfolioNotice icon={<CloudOff className="size-4" aria-hidden="true" />}>You are offline. Portfolio refresh is paused until the connection returns.</PortfolioNotice> : null}
        {state?.isStale ? <PortfolioNotice icon={<CircleAlert className="size-4" aria-hidden="true" />}>Showing the latest available virtual ledger valuation while one or more public prices refresh.</PortfolioNotice> : null}
        {state?.unavailableSymbols.length ? <PortfolioNotice icon={<CircleAlert className="size-4" aria-hidden="true" />}>A current valuation is unavailable for {state.unavailableSymbols.join(", ")}; its allocation is temporarily excluded from the live total.</PortfolioNotice> : null}

        {simulationQuery.isLoading ? <PortfolioSkeleton /> : simulationQuery.error || !state || !portfolio ? <PortfolioError message={simulationQuery.error?.message ?? "The simulation ledger is unavailable."} onRetry={() => void simulationQuery.refetch()} /> : <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Simulation portfolio summary">
            <PortfolioStat label="Portfolio value" value={formatCurrency(portfolio.totalValueUsd)} helper="Live-valued virtual assets plus cash" />
            <PortfolioStat label="Virtual cash" value={formatCurrency(portfolio.cashBalanceUsd)} helper={`${portfolio.cashAllocationPercent.toFixed(1)}% allocation`} />
            <PortfolioStat label="Unrealized P/L" value={formatSignedCurrency(portfolio.totalUnrealizedPnlUsd)} helper={formatSignedPercent(portfolio.totalUnrealizedPnlPercent)} tone={portfolio.totalUnrealizedPnlUsd >= 0 ? "positive" : "negative"} />
            <PortfolioStat label="Open positions" value={String(positions.length)} helper={`${transactions.length} virtual transaction${transactions.length === 1 ? "" : "s"}`} />
          </section>

          <section className={`mt-5 rounded-2xl border p-4 shadow-[0_18px_50px_rgba(3,7,34,0.15)] sm:flex sm:items-center sm:justify-between sm:gap-6 ${emergency.data?.active ? "border-danger/30 bg-danger/10" : "border-success/25 bg-success/10"}`} aria-labelledby="paper-protection-title"><div className="flex gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${emergency.data?.active ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}><ShieldCheck className="size-5" aria-hidden="true" /></span><div><p className={`text-xs font-semibold uppercase tracking-[0.16em] ${emergency.data?.active ? "text-danger" : "text-success"}`}>Paper-trading protection</p><h2 id="paper-protection-title" className="mt-1 font-semibold">{emergency.data?.active ? "Emergency Stop is active" : "Emergency Stop is ready"}</h2><p className="mt-1 text-sm text-foreground-secondary">{emergency.data?.active ? emergency.data.reason ?? "New paper trades are blocked until reset." : `${monitoring.data?.positions.length ?? 0} open position${(monitoring.data?.positions.length ?? 0) === 1 ? "" : "s"} evaluated during this active session. Monitoring records observations only; it never sells automatically.`}</p></div></div><div className="mt-4 flex flex-wrap gap-3 sm:mt-0">{emergency.data?.active ? <button type="button" onClick={() => resetEmergency.mutate()} disabled={resetEmergency.isPending} className="rounded-lg border border-danger/35 px-3.5 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60 focus-visible:outline-none">{resetEmergency.isPending ? "Resetting…" : "Reset Emergency Stop"}</button> : <button type="button" onClick={() => { const reason = window.prompt("Reason for paper-trading Emergency Stop:"); if (reason?.trim()) activateEmergency.mutate({ reason: reason.trim() }); }} disabled={activateEmergency.isPending} className="rounded-lg border border-warning/35 bg-warning/10 px-3.5 py-2 text-sm font-semibold text-warning transition-colors hover:bg-warning/15 disabled:opacity-60 focus-visible:outline-none">{activateEmergency.isPending ? "Activating…" : "Activate Emergency Stop"}</button>}<a href="/audit-log" className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-none">View audit log</a></div></section>

          {protection.data ? <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Daily paper-trading protection"><ProtectionMetric label="Total exposure" value={`${protection.data.exposure.totalExposurePercent.toFixed(1)}%`} detail={`${formatCurrency(protection.data.exposure.totalExposureUsd)} of virtual equity`} /><ProtectionMetric label="Daily loss" value={`${protection.data.dailyProtection.dailyLossPercent.toFixed(2)}% / ${protection.data.settings.maxDailyLossPercent.toFixed(2)}%`} detail={`Realized ${formatSignedCurrency(protection.data.dailyProtection.realizedPnlTodayUsd)} today`} tone={protection.data.dailyProtection.dailyLossPercent >= protection.data.settings.maxDailyLossPercent ? "warning" : "default"} /><ProtectionMetric label="Daily drawdown" value={`${protection.data.dailyProtection.dailyDrawdownPercent.toFixed(2)}% / ${protection.data.settings.maxDailyDrawdownPercent.toFixed(2)}%`} detail={protection.data.dailyProtection.cooldownActive ? "Cooldown active" : "UTC day protection"} tone={protection.data.dailyProtection.cooldownActive ? "warning" : "default"} /></section> : null}

          {monitoring.data?.positions.length ? <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_18px_50px_rgba(3,7,34,0.15)]" aria-labelledby="position-protection-title"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Session-scoped observation</p><h2 id="position-protection-title" className="mt-1 text-lg font-semibold">Position protection monitor</h2></div><span className="text-xs text-foreground-muted">{monitoring.data.evaluatedAt ? `Evaluated ${formatTime(monitoring.data.evaluatedAt)}` : "Awaiting evaluation"}</span></div><div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">{monitoring.data.positions.map((position) => <article key={position.positionId} className="p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{position.symbol}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${position.protectionStatus === "MONITORED" ? "bg-success/10 text-success" : position.protectionStatus === "DATA_UNAVAILABLE" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"}`}>{position.protectionStatus.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm text-foreground-secondary">Price {formatCurrency(position.currentPriceUsd)} · stop {formatCurrency(position.stopPriceUsd)} · target {formatCurrency(position.targetPriceUsd)}</p><p className="mt-1 text-xs text-foreground-muted">{position.regimeChanged ? `Regime changed: ${position.openingRegime ?? "unavailable"} → ${position.currentRegime ?? "unavailable"}` : `Risk level: ${position.currentRiskLevel ?? "unavailable"}`}</p></article>)}</div></section> : null}

          <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.85fr)] xl:gap-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl" aria-labelledby="virtual-holdings-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Live allocation</p><h2 id="virtual-holdings-title" className="mt-1 text-lg font-semibold text-foreground">Virtual holdings</h2></div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Server-valued</span>
              </div>
              {positions.length ? <>
                <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[780px] text-sm"><thead className="border-b border-border bg-background-secondary/60 text-left text-xs font-medium uppercase tracking-[0.1em] text-foreground-muted"><tr><th className="px-5 py-3">Asset</th><th className="px-5 py-3 text-right">Quantity</th><th className="px-5 py-3 text-right">Live value</th><th className="px-5 py-3 text-right">Unrealized P/L</th><th className="px-5 py-3 text-right">Allocation</th></tr></thead><tbody className="divide-y divide-border">{positions.map((position) => <HoldingRow key={position.symbol} position={position} />)}</tbody></table></div>
                <div className="divide-y divide-border md:hidden">{positions.map((position) => <HoldingCard key={position.symbol} position={position} />)}</div>
              </> : <EmptyPositions />}
            </div>

            <aside className="rounded-2xl border border-border bg-card/75 p-4 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl sm:p-5" aria-labelledby="allocation-title">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Breakdown</p><h2 id="allocation-title" className="mt-1 text-lg font-semibold text-foreground">Allocation</h2></div><WalletCards className="size-5 text-primary" aria-hidden="true" /></div>
              <div className="mt-5 space-y-4"><AllocationRow label="USD virtual cash" percent={portfolio.cashAllocationPercent} value={portfolio.cashBalanceUsd} tone="cash" />{positions.map((position) => <AllocationRow key={position.symbol} label={position.symbol} percent={position.allocationPercent} value={position.marketValueUsd} tone={position.unavailable ? "muted" : "asset"} />)}</div>
              <div className="mt-6 rounded-xl border border-border bg-background-secondary p-3.5 text-xs leading-5 text-foreground-secondary"><ShieldCheck className="mr-2 inline size-4 text-primary" aria-hidden="true" />Valuation reads the public market quote on the server. A missing quote never becomes a fabricated price.</div>
            </aside>
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl" aria-labelledby="transaction-history-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Immutable simulation ledger</p><h2 id="transaction-history-title" className="mt-1 text-lg font-semibold text-foreground">Virtual transaction history</h2></div><History className="size-5 text-primary" aria-hidden="true" /></div>
            {transactions.length ? <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-border bg-background-secondary/60 text-left text-xs font-medium uppercase tracking-[0.1em] text-foreground-muted"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">Action</th><th className="px-5 py-3 text-right">Quantity</th><th className="px-5 py-3 text-right">Server reference</th><th className="px-5 py-3 text-right">Virtual notional</th><th className="px-5 py-3 text-right">Source</th></tr></thead><tbody className="divide-y divide-border">{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</tbody></table></div><div className="divide-y divide-border md:hidden">{transactions.map((transaction) => <TransactionCard key={transaction.id} transaction={transaction} />)}</div></> : <EmptyTransactions />}
          </section>
        </>}
      </div>
    </main>
  );
}

function PortfolioStatus({ isOnline, isFetching, isStale }: { isOnline: boolean; isFetching: boolean; isStale: boolean }) {
  const label = !isOnline ? "Offline" : isStale ? "Latest valuation cached" : "Live valuation";
  const tone = !isOnline || isStale ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success";
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone}`} aria-live="polite"><span className={`size-2 rounded-full ${!isOnline || isStale ? "bg-warning" : "bg-success"} ${isFetching ? "animate-pulse" : ""}`} aria-hidden="true" />{label}</span>;
}

function PortfolioStat({ label, value, helper, tone = "default" }: { label: string; value: string; helper: string; tone?: "default" | "positive" | "negative" }) {
  const valueTone = tone === "positive" ? "text-success" : tone === "negative" ? "text-danger" : "text-foreground";
  return <dl className="rounded-2xl border border-border bg-card/75 p-5 shadow-[0_18px_50px_rgba(3,7,34,0.15)]"><dt className="text-sm text-foreground-secondary">{label}</dt><dd className={`mt-2 font-mono text-2xl font-semibold sm:text-3xl ${valueTone}`}>{value}</dd><p className="mt-2 text-xs text-foreground-muted">{helper}</p></dl>;
}
function ProtectionMetric({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "warning" }) { return <dl className={`rounded-2xl border p-4 ${tone === "warning" ? "border-warning/30 bg-warning/10" : "border-border bg-card/75"}`}><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground-muted">{label}</dt><dd className={`mt-2 font-mono text-lg font-semibold ${tone === "warning" ? "text-warning" : "text-foreground"}`}>{value}</dd><p className="mt-1 text-xs text-foreground-secondary">{detail}</p></dl>; }

function HoldingRow({ position }: { position: SimulationPosition }) {
  const positive = position.unrealizedPnlUsd >= 0;
  return <tr className="transition-colors hover:bg-background-secondary/55"><td className="px-5 py-4"><div className="font-semibold text-foreground">{position.symbol}</div><div className="mt-1 text-xs text-foreground-muted">{position.unavailable ? "Live price unavailable" : `${formatSource(position.source)} · ${position.providerUpdatedAt ? formatTime(position.providerUpdatedAt) : "freshness unavailable"}`}</div></td><td className="px-5 py-4 text-right font-mono text-foreground-secondary">{formatQuantity(position.quantity)}</td><td className="px-5 py-4 text-right"><div className="font-mono font-semibold text-foreground">{position.unavailable ? "Awaiting quote" : formatCurrency(position.marketValueUsd)}</div><div className="mt-1 text-xs text-foreground-muted">at {formatCurrency(position.currentPriceUsd)}</div></td><td className={`px-5 py-4 text-right font-mono font-semibold ${positive ? "text-success" : "text-danger"}`}>{formatSignedCurrency(position.unrealizedPnlUsd)}<div className="mt-1 text-xs font-medium">{formatSignedPercent(position.unrealizedPnlPercent)}</div></td><td className="px-5 py-4 text-right font-mono text-foreground-secondary">{position.allocationPercent.toFixed(1)}%</td></tr>;
}

function HoldingCard({ position }: { position: SimulationPosition }) {
  const positive = position.unrealizedPnlUsd >= 0;
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">{position.symbol}</h3><p className="mt-1 text-xs text-foreground-muted">{position.unavailable ? "Live price unavailable" : formatSource(position.source)}</p></div><p className="font-mono font-semibold text-foreground">{position.unavailable ? "Awaiting quote" : formatCurrency(position.marketValueUsd)}</p></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-foreground-muted">Quantity</dt><dd className="mt-1 font-mono text-foreground">{formatQuantity(position.quantity)}</dd></div><div><dt className="text-foreground-muted">Allocation</dt><dd className="mt-1 font-mono text-foreground">{position.allocationPercent.toFixed(1)}%</dd></div><div><dt className="text-foreground-muted">Average cost</dt><dd className="mt-1 font-mono text-foreground">{formatCurrency(position.averageCostUsd)}</dd></div><div><dt className="text-foreground-muted">Unrealized P/L</dt><dd className={`mt-1 font-mono font-semibold ${positive ? "text-success" : "text-danger"}`}>{formatSignedCurrency(position.unrealizedPnlUsd)}</dd></div></dl></article>;
}

function AllocationRow({ label, percent, value, tone }: { label: string; percent: number; value: number; tone: "cash" | "asset" | "muted" }) {
  const color = tone === "cash" ? "bg-primary" : tone === "muted" ? "bg-foreground-muted" : "bg-success";
  return <div><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-foreground">{label}</span><span className="font-mono text-foreground-secondary">{percent.toFixed(1)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-background-secondary"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} /></div><p className="mt-1.5 text-xs text-foreground-muted">{formatCurrency(value)}</p></div>;
}

function TransactionRow({ transaction }: { transaction: SimulationTransaction }) {
  const buy = transaction.side === "buy";
  const Icon = buy ? ArrowUpRight : ArrowDownRight;
  return <tr className="transition-colors hover:bg-background-secondary/55"><td className="px-5 py-4 text-foreground-secondary">{formatDateTime(transaction.executedAt)}</td><td className={`px-5 py-4 font-semibold ${buy ? "text-success" : "text-danger"}`}><Icon className="mr-1 inline size-4" aria-hidden="true" />{buy ? "Buy" : "Sell"} {transaction.symbol}<span className="ml-2 rounded-full bg-background-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-foreground-muted">{transaction.orderType}</span></td><td className="px-5 py-4 text-right font-mono text-foreground-secondary">{formatQuantity(transaction.quantity)}</td><td className="px-5 py-4 text-right font-mono text-foreground-secondary">{formatCurrency(transaction.referencePriceUsd)}</td><td className="px-5 py-4 text-right font-mono font-semibold text-foreground">{formatCurrency(transaction.notionalUsd)}</td><td className="px-5 py-4 text-right text-xs text-foreground-muted">{formatSource(transaction.marketSource)}</td></tr>;
}

function TransactionCard({ transaction }: { transaction: SimulationTransaction }) {
  const buy = transaction.side === "buy";
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><div><p className={`font-semibold ${buy ? "text-success" : "text-danger"}`}>{buy ? "Buy" : "Sell"} {transaction.symbol}</p><p className="mt-1 text-xs text-foreground-muted">{formatDateTime(transaction.executedAt)} · {transaction.orderType}</p></div><p className="font-mono font-semibold text-foreground">{formatCurrency(transaction.notionalUsd)}</p></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-foreground-muted">Quantity</dt><dd className="mt-1 font-mono text-foreground">{formatQuantity(transaction.quantity)}</dd></div><div><dt className="text-foreground-muted">Server reference</dt><dd className="mt-1 font-mono text-foreground">{formatCurrency(transaction.referencePriceUsd)}</dd></div></dl></article>;
}

function PortfolioNotice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) { return <aside className="mb-5 flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" role="status">{icon}<span>{children}</span></aside>; }
function PortfolioError({ message, onRetry }: { message: string; onRetry: () => void }) { return <section className="rounded-2xl border border-danger/30 bg-danger/10 p-8 text-center sm:p-10"><CircleAlert className="mx-auto size-8 text-danger" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold text-foreground">The simulation ledger is unavailable</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-foreground-secondary">{message}</p><button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none"><RefreshCw className="size-4" aria-hidden="true" /> Retry simulation ledger</button></section>; }
function PortfolioSkeleton() { return <div className="space-y-5"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-card" />)}</div><div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.85fr)]"><div className="h-96 animate-pulse rounded-2xl bg-card" /><div className="h-96 animate-pulse rounded-2xl bg-card" /></div><div className="h-72 animate-pulse rounded-2xl bg-card" /></div>; }
function EmptyPositions() { return <div className="p-8 text-center sm:p-10"><BriefcaseBusiness className="mx-auto size-8 text-foreground-muted" aria-hidden="true" /><h3 className="mt-3 font-semibold text-foreground">No virtual positions yet</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-foreground-secondary">Create a simulation-only order from the Trading workspace to add an asset here. The first view starts with virtual cash only.</p><a href="/trading" className="mt-5 inline-flex rounded-lg bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none">Open simulation ticket</a></div>; }
function EmptyTransactions() { return <div className="p-8 text-center sm:p-10"><History className="mx-auto size-8 text-foreground-muted" aria-hidden="true" /><h3 className="mt-3 font-semibold text-foreground">No virtual transactions yet</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-foreground-secondary">Confirmed simulation orders are recorded here with the server’s live public reference price. They never reach an exchange.</p></div>; }
function formatCurrency(value: number | null) { if (value === null || !Number.isFinite(value)) return "—"; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function formatSignedCurrency(value: number) { const sign = value > 0 ? "+" : value < 0 ? "−" : ""; return `${sign}${formatCurrency(Math.abs(value))}`; }
function formatSignedPercent(value: number) { const sign = value > 0 ? "+" : value < 0 ? "−" : ""; return `${sign}${Math.abs(value).toFixed(2)}%`; }
function formatQuantity(value: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value); }
function formatTime(value: number) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function formatDateTime(value: string | Date) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(); }
function formatSource(value: string | null) { if (value === "coinbase") return "Coinbase Exchange"; if (value === "binance") return "Binance Public"; return value ? value.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) : "Live provider"; }
