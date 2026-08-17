import { useState } from 'react';
import { CheckCircle2, Clock3, Info, Trash2, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type Order = { id: string; pair: string; side: 'buy' | 'sell'; orderType: 'market' | 'limit' | 'stop'; price: number; amount: number; total: number; status: 'open' | 'filled' | 'cancelled'; reference: string };

const initialOpen: Order[] = [
  { id: 'btc', pair: 'BTC/USDT', side: 'buy', orderType: 'limit', price: 44500, amount: 0.5, total: 22250, status: 'open', reference: 'Reference row A' },
  { id: 'eth', pair: 'ETH/USDT', side: 'sell', orderType: 'limit', price: 2500, amount: 5, total: 12500, status: 'open', reference: 'Reference row B' },
];

const history: Order[] = [
  { id: 'history-btc', pair: 'BTC/USDT', side: 'buy', orderType: 'market', price: 45230.5, amount: 1.5, total: 67845.75, status: 'filled', reference: 'Reference row C' },
  { id: 'history-sol', pair: 'SOL/USDT', side: 'sell', orderType: 'market', price: 98.45, amount: 100, total: 9845, status: 'filled', reference: 'Reference row D' },
  { id: 'history-xrp', pair: 'XRP/USDT', side: 'buy', orderType: 'limit', price: 2, amount: 500, total: 1000, status: 'cancelled', reference: 'Reference row E' },
];

const statusStyles = { open: 'bg-warning/10 text-warning', filled: 'bg-success/10 text-success', cancelled: 'bg-destructive/10 text-destructive' } as const;
const statusLabels = { open: 'Pending layout', filled: 'Complete layout', cancelled: 'Cancelled layout' } as const;
const StatusIcon = ({ status }: { status: Order['status'] }) => status === 'open' ? <Clock3 className="size-3.5" aria-hidden="true" /> : status === 'filled' ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <XCircle className="size-3.5" aria-hidden="true" />;
const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Orders() {
  const [active, setActive] = useState<'open' | 'history'>('open');
  const [openOrders, setOpenOrders] = useState(initialOpen);
  const entries = active === 'open' ? openOrders : history;
  const cancelOrder = (order: Order) => {
    setOpenOrders((current) => current.filter((entry) => entry.id !== order.id));
    toast.info('Reference row removed', { description: `${order.pair} was removed from the local preview only. No order was cancelled.` });
  };
  const tabs: Array<{ id: 'open' | 'history'; label: string }> = [{ id: 'open', label: 'Pending layouts' }, { id: 'history', label: 'History layouts' }];
  const stats = [{ label: 'Complete layouts', value: history.filter((entry) => entry.status === 'filled').length.toString() }, { label: 'Cancelled layouts', value: history.filter((entry) => entry.status === 'cancelled').length.toString() }, { label: 'Reference aggregate', value: money(history.reduce((sum, entry) => sum + entry.total, 0)) }];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur-xl"><div className="container py-5 sm:py-7"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">Execution-ledger preview</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Orders</h1><p className="mt-1 text-sm text-foreground-secondary">Review responsive order-ledger and state patterns without a connected execution, balance, or account service.</p></div></header>
      <div className="container max-w-6xl py-5 sm:py-7 lg:py-8">
        <aside className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground-secondary" aria-label="Orders preview disclosure">All symbols, prices, quantities, totals, statuses, and rows below are deterministic interface examples. They are not current quotes, account orders, trade executions, balances, fills, cancellations, or a record of activity.</aside>
        <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl">
          <div className="border-b border-border px-4 py-3 sm:px-5"><div className="inline-flex rounded-xl border border-border bg-background-secondary p-1" role="tablist" aria-label="Reference order views">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => setActive(tab.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline-none sm:px-4 ${active === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-foreground-secondary hover:text-foreground'}`}>{tab.label}{tab.id === 'open' && openOrders.length > 0 && <span className="ml-2 rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] text-warning">{openOrders.length}</span>}</button>)}</div></div>
          {entries.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-background-secondary text-foreground-muted"><Clock3 className="size-5" aria-hidden="true" /></span>
              <h2 className="mt-4 text-base font-semibold">No local reference rows</h2>
              <p className="mt-1 max-w-sm text-sm leading-6 text-foreground-secondary">The local pending-layout cards were removed. No connected account data will replace them.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="border-b border-border bg-background-secondary/55"><tr>{['Pair', 'Side', 'Type', 'Reference price', 'Reference amount', 'Reference total', 'Layout state', 'Reference', ...(active === 'open' ? ['Action'] : [])].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">{heading}</th>)}</tr></thead>
                  <tbody className="divide-y divide-border">{entries.map((order) => <OrderTableRow key={order.id} order={order} cancellable={active === 'open'} onCancel={cancelOrder} />)}</tbody>
                </table>
              </div>
              <div className="divide-y divide-border lg:hidden">{entries.map((order) => <OrderMobileCard key={order.id} order={order} cancellable={active === 'open'} onCancel={cancelOrder} />)}</div>
            </>
          )}
        </section>
        {active === 'history' && <section className="mt-5 grid gap-3 sm:grid-cols-3">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-border bg-card/70 p-4 shadow-[0_16px_48px_rgba(3,7,34,0.12)]"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground-muted">{stat.label}</p><p className="mt-2 text-xl font-semibold tracking-tight">{stat.value}</p></div>)}</section>}
      </div>
    </main>
  );
}

function OrderTableRow({ order, cancellable, onCancel }: { order: Order; cancellable: boolean; onCancel: (order: Order) => void }) { const SideIcon = order.side === 'buy' ? TrendingUp : TrendingDown; return <tr className="hover:bg-background-secondary/45"><td className="px-4 py-4 text-sm font-semibold">{order.pair}</td><td className={`px-4 py-4 text-xs font-semibold uppercase ${order.side === 'buy' ? 'text-success' : 'text-destructive'}`}><span className="inline-flex items-center gap-1"><SideIcon className="size-3.5" aria-hidden="true" />{order.side}</span></td><td className="px-4 py-4 text-sm capitalize text-foreground-secondary">{order.orderType}</td><td className="px-4 py-4 text-sm font-medium">{money(order.price)}</td><td className="px-4 py-4 text-sm text-foreground-secondary">{order.amount}</td><td className="px-4 py-4 text-sm font-medium">{money(order.total)}</td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}><StatusIcon status={order.status} />{statusLabels[order.status]}</span></td><td className="px-4 py-4 whitespace-nowrap text-sm text-foreground-secondary">{order.reference}</td>{cancellable && <td className="px-4 py-4"><button type="button" onClick={() => onCancel(order)} aria-label={`Remove ${order.pair} local reference row`} title="Remove local reference row" className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-foreground-secondary hover:border-destructive/45 hover:text-destructive focus-visible:outline-none"><Trash2 className="size-3.5" aria-hidden="true" /></button></td>}</tr>; }
function OrderMobileCard({ order, cancellable, onCancel }: { order: Order; cancellable: boolean; onCancel: (order: Order) => void }) { const SideIcon = order.side === 'buy' ? TrendingUp : TrendingDown; return <article className="px-4 py-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{order.pair}</h2><p className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold uppercase ${order.side === 'buy' ? 'text-success' : 'text-destructive'}`}><SideIcon className="size-3.5" aria-hidden="true" />{order.side} · {order.orderType}</p></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}><StatusIcon status={order.status} />{statusLabels[order.status]}</span></div><dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><Metric label="Reference price" value={money(order.price)} /><Metric label="Reference amount" value={order.amount.toString()} /><Metric label="Reference total" value={money(order.total)} /><Metric label="Reference" value={order.reference} /></dl>{cancellable && <button type="button" onClick={() => onCancel(order)} className="mt-4 w-full rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-foreground-secondary hover:border-destructive/45 hover:text-destructive focus-visible:outline-none">Remove local row</button>}</article>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-foreground-muted">{label}</dt><dd className="mt-1 font-medium text-foreground-secondary">{value}</dd></div>; }
