import React, { useId, useMemo, useState } from 'react';
import { Activity, BarChart3, ChevronDown, Maximize2 } from 'lucide-react';

type ChartVariant = 'spot' | 'futures';
type Interval = '15m' | '1h' | '4h' | '1d';

interface TerminalChartProps {
  symbol: string;
  price: string;
  change: string;
  variant?: ChartVariant;
  series?: number[];
  interval?: Interval;
  onIntervalChange?: (interval: Interval) => void;
  sourceLabel?: string;
  isStale?: boolean;
  marketStats?: {
    high24h: string;
    low24h: string;
    volume24h: string;
    finalLabel?: string;
    finalValue?: string;
  };
}

const intervals: Array<{ value: Interval; label: string }> = [
  { value: '15m', label: '15M' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

const spotSeries = [72, 64, 68, 56, 61, 53, 58, 49, 55, 51, 61, 57, 65, 60, 70, 66, 74, 69, 79, 73, 82, 78, 89, 84, 92];
const futuresSeries = [64, 70, 57, 66, 52, 60, 48, 58, 53, 66, 60, 72, 64, 76, 69, 82, 73, 86, 78, 91, 84, 96, 88, 100, 94];

function createPath(values: number[], width: number, height: number, padding: number) {
  const min = Math.min(...values) - 6;
  const max = Math.max(...values) + 6;
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export default function TerminalChart({ symbol, price, change, variant = 'spot', series, interval: controlledInterval, onIntervalChange, sourceLabel, isStale = false, marketStats }: TerminalChartProps) {
  const [uncontrolledInterval, setUncontrolledInterval] = useState<Interval>('1h');
  const [isExpanded, setIsExpanded] = useState(false);
  const chartId = useId().replace(/:/g, '');
  const positive = !change.trim().startsWith('-');
  const interval = controlledInterval ?? uncontrolledInterval;
  const source = series && series.length >= 2 ? series : (variant === 'spot' ? spotSeries : futuresSeries);
  const liveSeries = Boolean(series && series.length >= 2);

  const chartSeries = useMemo(() => {
    if (liveSeries) return source;
    const intervalShift = intervals.findIndex((option) => option.value === interval) * 2;
    return source.map((value, index) => value + ((index + intervalShift) % 5) - 2);
  }, [interval, liveSeries, source]);

  const path = useMemo(() => createPath(chartSeries, 900, 320, 24), [chartSeries]);
  const areaPath = `${path} L 876 296 L 24 296 Z`;
  const directionLabel = positive ? 'positive' : 'negative';
  const stats = marketStats ?? {
    high24h: variant === 'spot' ? '$46,120.00' : '$46,480.00',
    low24h: variant === 'spot' ? '$44,780.00' : '$44,520.00',
    volume24h: variant === 'spot' ? '$1.84B' : '$742.4M',
    finalLabel: variant === 'spot' ? 'Display mode' : 'Open interest',
    finalValue: variant === 'spot' ? 'Reference' : '$1.26B',
  };

  const updateInterval = (nextInterval: Interval) => {
    if (onIntervalChange) onIntervalChange(nextInterval);
    else setUncontrolledInterval(nextInterval);
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card/75 shadow-[0_24px_80px_rgba(3,7,34,0.22)] backdrop-blur-xl" aria-labelledby={`${chartId}-title`}>
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">
              <Activity className="size-3.5 text-primary" aria-hidden="true" />
              Market terminal
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <h2 id={`${chartId}-title`} className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{symbol}</h2>
              <span className="font-mono text-sm text-foreground-secondary">{price}</span>
              <span className={positive ? 'text-sm font-semibold text-success' : 'text-sm font-semibold text-danger'}>{change}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-1 text-[11px] font-medium text-foreground-secondary">
              <span className={`size-1.5 rounded-full ${positive ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
              {isStale ? 'Cached market data' : sourceLabel ?? (liveSeries ? 'Live market data' : 'Reference display')}
            </span>
            <button type="button" onClick={() => setIsExpanded((expanded) => !expanded)} aria-pressed={isExpanded} className="rounded-lg p-2 text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground focus-visible:outline-none" aria-label={isExpanded ? "Collapse chart preview" : "Expand chart preview"}>
              <Maximize2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex max-w-full rounded-xl border border-border bg-background-secondary p-1" role="group" aria-label="Chart interval">
            {intervals.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={interval === option.value}
                onClick={() => updateInterval(option.value)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none ${
                  interval === option.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground-secondary hover:bg-card hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span title="No indicator source is connected to this reference display." className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground-muted" aria-label="Indicators unavailable for this reference display">
            <BarChart3 className="size-4" aria-hidden="true" />
            Indicators unavailable
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>

      <figure className={`relative overflow-hidden bg-[radial-gradient(circle_at_70%_10%,rgba(147,51,234,0.18),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.96))] ${isExpanded ? "h-[480px] sm:h-[560px]" : "h-[280px] sm:h-[340px]"}`} aria-label={`${symbol} ${interval} ${directionLabel} trend chart`}>
        <svg viewBox="0 0 900 320" preserveAspectRatio="none" className="size-full" role="img" aria-hidden="true">
          <defs>
            <linearGradient id={`${chartId}-line`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="55%" stopColor="#ec4899" />
              <stop offset="100%" stopColor={positive ? '#34d399' : '#fb7185'} />
            </linearGradient>
            <linearGradient id={`${chartId}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[52, 108, 164, 220, 276].map((y) => <line key={y} x1="24" x2="876" y1={y} y2={y} stroke="rgba(148,163,184,0.13)" strokeWidth="1" />)}
          {[24, 237, 450, 663, 876].map((x) => <line key={x} x1={x} x2={x} y1="24" y2="296" stroke="rgba(148,163,184,0.09)" strokeWidth="1" />)}
          <path d={areaPath} fill={`url(#${chartId}-area)`} />
          <path d={path} fill="none" stroke={`url(#${chartId}-line)`} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" vectorEffect="non-scaling-stroke" />
          <circle cx="876" cy={path.split(' ').slice(-1)[0]} r="7" fill={positive ? '#34d399' : '#fb7185'} stroke="#0f172a" strokeWidth="4" vectorEffect="non-scaling-stroke" />
        </svg>
        <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-white/5 bg-slate-950/55 px-4 py-3 text-[11px] text-foreground-muted backdrop-blur-sm sm:px-5">
          <span>{liveSeries ? "Provider-backed close-price candles" : "Reference market visualization"}</span>
          <span className="font-mono">{interval.toUpperCase()} · {variant === 'spot' ? 'Spot' : 'Perpetual'}</span>
        </figcaption>
      </figure>

      <dl className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
        {[
          ['24h high', stats.high24h],
          ['24h low', stats.low24h],
          ['24h volume', stats.volume24h],
          [stats.finalLabel ?? 'Display mode', stats.finalValue ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 px-4 py-3.5 sm:px-5">
            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{label}</dt>
            <dd className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
