import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown, Info, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import TerminalChart from '@/components/TerminalChart';
import { NexusBinaryToggle } from '@/components/NexusBinaryToggle';

type PositionSide = 'long' | 'short';
type OrderType = 'market' | 'limit' | 'stop';

const positions = [
  { id: 1, pair: 'BTC/USDT', side: 'long' as const, entry: 45230.5, current: 45500, size: 1.5, pnl: 404.25, pnlPercent: 0.59 },
  { id: 2, pair: 'ETH/USDT', side: 'short' as const, entry: 2450.75, current: 2420, size: 10, pnl: 308, pnlPercent: 1.26 },
];

export default function Futures() {
  const [leverage, setLeverage] = useState(10);
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [position, setPosition] = useState<PositionSide>('long');
  const [entryPrice, setEntryPrice] = useState('45230.50');
  const [amount, setAmount] = useState('0.5');
  const [stopLoss, setStopLoss] = useState('44500');
  const [takeProfit, setTakeProfit] = useState('46000');

  const notional = useMemo(() => {
    const value = Number.parseFloat(entryPrice) * Number.parseFloat(amount);
    return Number.isFinite(value) ? value : 0;
  }, [amount, entryPrice]);
  const collateral = notional / Math.max(leverage, 1);

  const previewOrder = () => {
    toast.warning(`${position === 'long' ? 'Long' : 'Short'} position preview ready`, {
      description: `${leverage}x leverage · ${amount || '0'} BTC · ${notional.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} notional`,
    });
  };
  const unavailable = (feature: string): void => { toast.info(`${feature} unavailable`, { description: 'This reference workspace has no margin account, futures market feed, position ledger, or execution route connected.' }); };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="container flex flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">Perpetual reference workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">BTC / USDT</h1>
            <p className="mt-1 text-sm text-foreground-secondary">Illustrative controls only — no margin account, leverage service, or execution route is connected.</p>
          </div>
          <div className="flex items-end justify-between gap-4 sm:justify-end">
            <div className="text-right"><p className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">$45,230.50</p><p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-success"><ArrowUpRight className="size-4" aria-hidden="true" /> +2.45% reference move</p></div>
            <button type="button" onClick={() => unavailable('Pair selection')} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground focus-visible:outline-none">Reference pair <ChevronDown className="size-3.5" aria-hidden="true" /></button>
          </div>
        </div>
      </header>

      <div className="container py-5 sm:py-7 lg:py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
          <div className="min-w-0 xl:col-span-8"><TerminalChart symbol="BTC / USDT Perpetual" price="$45,230.50" change="+2.45%" variant="futures" /></div>

          <section className="min-w-0 rounded-2xl border border-border bg-card/75 p-4 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl sm:p-5 xl:col-span-4" aria-labelledby="futures-order-title">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Futures preview ticket</p><h2 id="futures-order-title" className="mt-1 text-lg font-semibold text-foreground">Model a position</h2></div><span className="rounded-full border border-border bg-background-secondary px-2.5 py-1 text-[11px] font-medium text-foreground-secondary">Margin unavailable</span></div>

            <NexusBinaryToggle className="mt-5" value={position} onValueChange={setPosition} ariaLabel="Position side" options={[{ value: 'long', label: 'Long', icon: <TrendingUp />, tone: 'success' }, { value: 'short', label: 'Short', icon: <TrendingDown />, tone: 'danger' }]} />

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-background-secondary p-1" role="group" aria-label="Futures order type">
              {(['market', 'limit', 'stop'] as const).map((type) => <button key={type} type="button" aria-pressed={orderType === type} onClick={() => setOrderType(type)} className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize transition-colors focus-visible:outline-none ${orderType === type ? 'bg-card text-foreground shadow-sm' : 'text-foreground-secondary hover:text-foreground'}`}>{type}</button>)}
            </div>

            <div className="mt-5 space-y-4">
              <div><div className="mb-2 flex items-center justify-between text-xs font-medium text-foreground-secondary"><label htmlFor="futures-leverage">Leverage preview</label><output className="font-mono text-sm font-semibold text-foreground">{leverage}×</output></div><input id="futures-leverage" aria-valuetext={`${leverage} times illustrative leverage`} type="range" min="1" max="125" value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full accent-primary" /><div className="mt-2 flex justify-between text-[11px] text-foreground-muted"><span>1× reference</span><span>125× reference</span></div></div>
              <label className="block"><span className="mb-2 flex justify-between text-xs font-medium text-foreground-secondary"><span>Entry price</span><span>USDT</span></span><input aria-label="Entry price in USDT" inputMode="decimal" type="number" value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} className="w-full rounded-xl border border-border bg-background-secondary px-3.5 py-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="45,230.50" /></label>
              <label className="block"><span className="mb-2 flex justify-between text-xs font-medium text-foreground-secondary"><span>Amount</span><span>BTC</span></span><input aria-label="Amount in BTC" inputMode="decimal" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-border bg-background-secondary px-3.5 py-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="0.5" /></label>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Quick allocation">{[25, 50, 75, 100].map((percentage) => <button key={percentage} type="button" onClick={() => setAmount((0.5 * (percentage / 100)).toFixed(4))} className="rounded-lg border border-border bg-background-secondary py-2 text-xs font-semibold text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none">{percentage}%</button>)}</div>
              <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-2 block text-xs font-medium text-foreground-secondary">Stop loss</span><input aria-label="Stop loss" inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} className="w-full min-w-0 rounded-xl border border-border bg-background-secondary px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" /></label><label className="block"><span className="mb-2 block text-xs font-medium text-foreground-secondary">Take profit</span><input aria-label="Take profit" inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} className="w-full min-w-0 rounded-xl border border-border bg-background-secondary px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" /></label></div>
              <div className="rounded-xl border border-border bg-background-secondary p-3.5 text-sm"><div className="flex justify-between gap-3 text-foreground-secondary"><span>Reference collateral</span><span className="font-mono">{collateral.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span></div><div className="mt-2 flex justify-between gap-3 font-semibold text-foreground"><span>Reference notional</span><span className="font-mono">{notional.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span></div></div>
              <button type="button" onClick={previewOrder} className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none ${position === 'long' ? 'bg-success hover:bg-success/90' : 'bg-danger hover:bg-danger/90'}`}>Preview {position} position</button>
              <p className="flex gap-2 text-xs leading-5 text-foreground-muted"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Local preview only. This workspace cannot open, close, or manage a position.</p>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.18)] backdrop-blur-xl xl:col-span-12" aria-labelledby="open-positions-title">
            <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">Reference ledger</p><h2 id="open-positions-title" className="mt-1 text-lg font-semibold text-foreground">Illustrative positions</h2></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{positions.length} reference rows</span></div>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-border bg-background-secondary/60 text-left text-xs font-medium uppercase tracking-[0.1em] text-foreground-muted"><tr><th className="px-5 py-3">Pair</th><th className="px-5 py-3">Side</th><th className="px-5 py-3 text-right">Entry</th><th className="px-5 py-3 text-right">Mark</th><th className="px-5 py-3 text-right">Size</th><th className="px-5 py-3 text-right">P&amp;L</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-border">{positions.map((item) => <PositionTableRow key={item.id} item={item} onUnavailable={unavailable} />)}</tbody></table></div>
            <div className="divide-y divide-border md:hidden">{positions.map((item) => <PositionMobileCard key={item.id} item={item} onUnavailable={unavailable} />)}</div>
          </section>

          <section className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-warning xl:col-span-12" aria-label="Futures risk warning"><ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><div><h2 className="text-sm font-semibold">Risk warning</h2><p className="mt-1 text-sm leading-6 text-warning/80">Futures trading carries substantial risk of loss. Use stop losses and risk controls, and trade only with capital you can afford to lose.</p></div></section>
        </motion.div>
      </div>
    </main>
  );
}

function PositionTableRow({ item, onUnavailable }: { item: (typeof positions)[number]; onUnavailable: (feature: string) => void }) {
  const long = item.side === 'long';
  return <tr className="transition-colors hover:bg-background-secondary/55"><td className="px-5 py-4 font-semibold text-foreground">{item.pair}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${long ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>{item.side.toUpperCase()}</span></td><td className="px-5 py-4 text-right font-mono text-foreground-secondary">${item.entry.toFixed(2)}</td><td className="px-5 py-4 text-right font-mono text-foreground">${item.current.toFixed(2)}</td><td className="px-5 py-4 text-right font-mono text-foreground-secondary">{item.size} BTC</td><td className="px-5 py-4 text-right"><span className="font-mono font-semibold text-success">+${item.pnl.toFixed(2)}</span><span className="ml-1 text-xs text-success">+{item.pnlPercent}%</span></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => onUnavailable(`Close ${item.pair} reference position`)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground-secondary transition-colors hover:border-danger/50 hover:text-danger focus-visible:outline-none">Close unavailable</button></td></tr>;
}

function PositionMobileCard({ item, onUnavailable }: { item: (typeof positions)[number]; onUnavailable: (feature: string) => void }) {
  const long = item.side === 'long';
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">{item.pair}</h3><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${long ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>{item.side.toUpperCase()}</span></div><div className="text-right"><p className="font-mono font-semibold text-success">+${item.pnl.toFixed(2)}</p><p className="text-xs text-success">+{item.pnlPercent}% P&amp;L</p></div></div><dl className="mt-4 grid grid-cols-3 gap-3 text-xs"><div><dt className="text-foreground-muted">Entry</dt><dd className="mt-1 font-mono text-foreground">${item.entry.toFixed(2)}</dd></div><div><dt className="text-foreground-muted">Mark</dt><dd className="mt-1 font-mono text-foreground">${item.current.toFixed(2)}</dd></div><div><dt className="text-foreground-muted">Size</dt><dd className="mt-1 font-mono text-foreground">{item.size} BTC</dd></div></dl><button type="button" onClick={() => onUnavailable(`Close ${item.pair} reference position`)} className="mt-4 w-full rounded-lg border border-border px-3 py-2.5 text-xs font-semibold text-foreground-secondary transition-colors hover:border-danger/50 hover:text-danger focus-visible:outline-none">Close unavailable</button></article>;
}
