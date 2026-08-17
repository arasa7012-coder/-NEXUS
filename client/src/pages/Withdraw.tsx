import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Info, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Asset = { symbol: string; balance: number; value: number };
type Destination = { id: string; label: string; network: string };

const referenceAssets: Asset[] = [
  { symbol: 'BTC', balance: 2.5, value: 112575 },
  { symbol: 'ETH', balance: 15.3, value: 37500 },
  { symbol: 'USDT', balance: 50000, value: 50000 },
  { symbol: 'SOL', balance: 250, value: 24612 },
];

const referenceDestinations: Destination[] = [
  { id: 'external', label: 'Reference external destination', network: 'Bitcoin' },
  { id: 'exchange', label: 'Reference exchange destination', network: 'Ethereum' },
];

export default function Withdraw() {
  const [assetSymbol, setAssetSymbol] = useState('BTC');
  const [amountInput, setAmountInput] = useState('');
  const [destinationId, setDestinationId] = useState('external');
  const [stage, setStage] = useState<'details' | 'review' | 'complete'>('details');
  const asset = referenceAssets.find((entry) => entry.symbol === assetSymbol) ?? referenceAssets[0];
  const destination = referenceDestinations.find((entry) => entry.id === destinationId) ?? referenceDestinations[0];
  const amount = Number(amountInput) || 0;
  const referenceFee = useMemo(() => amount * 0.001, [amount]);
  const amountError = amountInput && (amount <= 0 || amount > asset.balance)
    ? (amount <= 0 ? 'Enter a hypothetical amount greater than zero.' : `Amount exceeds the ${asset.balance} ${asset.symbol} reference balance.`)
    : '';

  const review = () => {
    if (!amountInput || amountError) {
      toast.error(amountError || 'Enter a hypothetical amount before continuing.');
      return;
    }
    setStage('review');
  };

  const submitPreview = () => {
    setStage('complete');
    toast.info('No blockchain transaction was sent.', { description: 'This workspace has no connected wallet, destination, identity flow, or custody provider.' });
  };

  const reset = () => {
    setAmountInput('');
    setStage('details');
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="container py-5 sm:py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">Wallet outflow preview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Withdraw</h1>
          <p className="mt-1 text-sm text-foreground-secondary">Review a display-only asset, destination, and fee layout. No transfer capability is connected.</p>
        </div>
      </header>

      <div className="container max-w-5xl py-5 sm:py-7 lg:py-8">
        <aside className="mb-5 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-sm leading-6 text-foreground-secondary" aria-label="Withdrawal safety boundary">
          This is a non-operational withdrawal preview. Reference balances, destinations, networks, and fees are deterministic interface content; no asset can be moved, no destination is verified, and no transaction can be created here.
        </aside>

        {stage === 'details' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl">
              <div className="border-b border-border p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">1. Select reference asset</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {referenceAssets.map((entry) => (
                    <button key={entry.symbol} type="button" onClick={() => setAssetSymbol(entry.symbol)} className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none ${assetSymbol === entry.symbol ? 'border-primary/45 bg-primary/12' : 'border-border bg-background-secondary hover:border-primary/30'}`}>
                      <span className="block text-sm font-semibold">{entry.symbol}</span>
                      <span className="mt-1 block text-xs text-foreground-secondary">Reference: {entry.balance.toLocaleString()} {entry.symbol}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-b border-border p-4 sm:p-5">
                <label htmlFor="withdrawal-amount" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">2. Hypothetical amount</label>
                <div className="relative mt-3">
                  <input id="withdrawal-amount" value={amountInput} inputMode="decimal" onChange={(event) => setAmountInput(event.target.value)} placeholder="0.00" className={`w-full rounded-xl border bg-background-secondary px-3.5 py-3.5 pr-28 text-lg font-medium outline-none transition-colors ${amountError ? 'border-destructive/50 focus:border-destructive' : 'border-border focus:border-primary/55'}`} />
                  <button type="button" onClick={() => setAmountInput(asset.balance.toString())} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-primary/12 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/18 focus-visible:outline-none">Reference max</button>
                </div>
                <div className="mt-2 flex justify-between gap-4 text-xs">
                  <span className={amountError ? 'text-destructive' : 'text-foreground-secondary'}>{amountError || `Reference balance: ${asset.balance.toLocaleString()} ${asset.symbol}`}</span>
                  <span className="text-foreground-muted">Illustrative value: ${asset.value.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">3. Reference destination</p>
                <div className="mt-3 space-y-2">
                  {referenceDestinations.map((entry) => (
                    <button key={entry.id} type="button" onClick={() => setDestinationId(entry.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none ${destinationId === entry.id ? 'border-primary/45 bg-primary/8' : 'border-border bg-background-secondary hover:border-primary/30'}`}>
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-4" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{entry.label}</span><span className="mt-1 block text-xs text-foreground-secondary">No address configured · display-only selection</span><span className="mt-1 block text-xs text-foreground-muted">Reference {entry.network} network</span></span>
                      {destinationId === entry.id && <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-5">
              <Summary asset={asset.symbol} amount={amount} fee={referenceFee} />
              <section className="rounded-2xl border border-warning/25 bg-warning/8 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="text-sm font-semibold text-warning">Preview boundary</h2><p className="mt-1 text-xs leading-5 text-foreground-secondary">This review does not validate a network or destination. Verify current details directly with a real provider before any asset movement.</p></div></div></section>
              <button type="button" onClick={review} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none"><Send className="size-4" aria-hidden="true" />Review preview</button>
            </aside>
          </div>
        )}

        {stage === 'review' && <Review asset={asset.symbol} amount={amount} fee={referenceFee} destination={destination} onBack={() => setStage('details')} onConfirm={submitPreview} />}

        {stage === 'complete' && (
          <section className="mx-auto max-w-xl rounded-2xl border border-border bg-card/75 p-6 text-center shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl sm:p-8">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-warning/10 text-warning"><AlertTriangle className="size-5" aria-hidden="true" /></span>
            <h2 className="mt-4 text-xl font-semibold">Withdrawal preview complete</h2>
            <p className="mt-2 text-sm leading-6 text-foreground-secondary">No assets were moved. This workflow intentionally stops before any real withdrawal because no custody provider, account, destination, or identity verification is configured.</p>
            <button type="button" onClick={reset} className="mt-6 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none">Start another preview</button>
          </section>
        )}
      </div>
    </main>
  );
}

function Summary({ asset, amount, fee }: { asset: string; amount: number; fee: number }) {
  return <section className="rounded-2xl border border-border bg-card/75 p-4 shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">Illustrative review</p><dl className="mt-3 divide-y divide-border">{[['Hypothetical amount', `${amount || 0} ${asset}`], ['Reference fee', `${fee.toFixed(6)} ${asset}`], ['Illustrative recipient amount', `${Math.max(amount - fee, 0).toFixed(6)} ${asset}`]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-3 first:pt-0"><dt className="text-xs text-foreground-secondary">{label}</dt><dd className="text-right text-sm font-semibold">{value}</dd></div>)}</dl><p className="mt-3 text-xs leading-5 text-foreground-muted">The fee is a deterministic example, not a live network quote.</p></section>;
}

function Review({ asset, amount, fee, destination, onBack, onConfirm }: { asset: string; amount: number; fee: number; destination: Destination; onBack: () => void; onConfirm: () => void }) {
  return <section className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_20px_64px_rgba(3,7,34,0.16)] backdrop-blur-xl"><header className="border-b border-border p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">Final preview review</p><h2 className="mt-1 text-xl font-semibold">Confirm non-submission</h2><p className="mt-1 text-sm text-foreground-secondary">Review the illustrative destination and fee. The final step only confirms the preview boundary; it does not submit anything.</p></header><dl className="divide-y divide-border p-5">{[['Asset', asset], ['Hypothetical amount', `${amount} ${asset}`], ['Reference fee', `${fee.toFixed(6)} ${asset}`], ['Reference destination', destination.label], ['Reference network', destination.network]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-sm text-foreground-secondary">{label}</dt><dd className="max-w-[58%] break-all text-right text-sm font-semibold">{value}</dd></div>)}</dl><div className="flex flex-col-reverse gap-2 border-t border-border p-5 sm:flex-row"><button type="button" onClick={onBack} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground-secondary hover:text-foreground focus-visible:outline-none"><ChevronLeft className="size-4" aria-hidden="true" />Back</button><button type="button" onClick={onConfirm} className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none">Confirm preview</button></div></section>;
}
