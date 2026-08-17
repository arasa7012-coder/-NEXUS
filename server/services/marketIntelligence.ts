import { composeAssetIntelligence, type TimeframeAnalysisInput } from "../intelligence/engine";
import type {
  AssetIntelligence,
  DataQualityState,
  IntelligenceTimeframe,
  MarketRegime,
  StructureTrend,
} from "../intelligence/types";
import {
  getLiveCandles,
  getLiveCandlesFromSource,
  getMarketDirectory,
  MarketDataError,
  type ExchangeSource,
  type LiveMarketAsset,
} from "./marketData";

const ASSET_CACHE_TTL_MS = 30_000;
const LIVE_FRAME_CACHE_TTL_MS = 5_000;
const SCANNER_CACHE_TTL_MS = 45_000;
const MAX_INTELLIGENCE_CACHE_ENTRIES = 40;
const SCANNER_CONCURRENCY = 3;

export const supportedIntelligenceAssetIds = [
  "bitcoin",
  "ethereum",
  "solana",
  "binancecoin",
  "ripple",
  "cardano",
  "dogecoin",
  "chainlink",
] as const;

export const supportedIntelligenceAssets = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC" },
  { id: "ethereum", name: "Ethereum", symbol: "ETH" },
  { id: "solana", name: "Solana", symbol: "SOL" },
  { id: "binancecoin", name: "BNB", symbol: "BNB" },
  { id: "ripple", name: "XRP", symbol: "XRP" },
  { id: "cardano", name: "Cardano", symbol: "ADA" },
  { id: "dogecoin", name: "Dogecoin", symbol: "DOGE" },
  { id: "chainlink", name: "Chainlink", symbol: "LINK" },
] as const;

export type SupportedIntelligenceAssetId = (typeof supportedIntelligenceAssets)[number]["id"];

const timeframeSampleLimit: Record<IntelligenceTimeframe, number> = {
  "5m": 120,
  "15m": 120,
  "1h": 160,
  "4h": 160,
  "1d": 120,
};

interface CachedIntelligence<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}

const intelligenceCache = new Map<string, CachedIntelligence<unknown>>();
const intelligenceInFlight = new Map<string, Promise<unknown>>();

function trimCache() {
  if (intelligenceCache.size <= MAX_INTELLIGENCE_CACHE_ENTRIES) return;
  const keys = Array.from(intelligenceCache.entries())
    .sort(([, left], [, right]) => left.cachedAt - right.cachedAt)
    .slice(0, intelligenceCache.size - MAX_INTELLIGENCE_CACHE_ENTRIES)
    .map(([key]) => key);
  keys.forEach((key) => intelligenceCache.delete(key));
}

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const current = intelligenceCache.get(key) as CachedIntelligence<T> | undefined;
  if (current && current.expiresAt > now) return current.value;
  const pending = intelligenceInFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const request = loader()
    .then((value) => {
      const cachedAt = Date.now();
      intelligenceCache.set(key, { value, cachedAt, expiresAt: cachedAt + ttlMs });
      trimCache();
      return value;
    })
    .finally(() => intelligenceInFlight.delete(key));
  intelligenceInFlight.set(key, request);
  return request;
}

function findAsset(id: string) {
  const asset = supportedIntelligenceAssets.find((item) => item.id === id);
  if (!asset) throw new MarketDataError("UNAVAILABLE", "This asset is not in the bounded intelligence universe.");
  return asset;
}

function candleInputFromError(input: {
  timeframe: IntelligenceTimeframe;
  reason: string;
  hasError: boolean;
}): TimeframeAnalysisInput {
  return {
    timeframe: input.timeframe,
    candles: [],
    source: "mixed",
    cachedAt: Date.now(),
    providerUpdatedAt: null,
    providerTimestampOrigin: null,
    isStale: false,
    unavailableReasons: [input.reason],
    hasError: input.hasError,
  };
}

async function fetchTimeframe(symbol: string, timeframe: IntelligenceTimeframe): Promise<TimeframeAnalysisInput> {
  try {
    const result = await getLiveCandles({ symbol, interval: timeframe, limit: timeframeSampleLimit[timeframe] });
    const latest = result.candles.at(-1);
    return {
      timeframe,
      candles: result.candles.map((candle) => ({
        openTime: candle.openTime,
        closeTime: candle.closeTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        quoteVolumeUsd: candle.quoteVolumeUsd,
        tradeCount: candle.tradeCount,
      })),
      source: result.source,
      cachedAt: result.cachedAt,
      providerUpdatedAt: latest?.closeTime ?? null,
      providerTimestampOrigin: latest ? "provider" : null,
      isStale: result.isStale,
      unavailableReasons: latest ? [] : [`No ${timeframe} candles were returned by the public exchange feed.`],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : `The ${timeframe} timeframe is unavailable.`;
    const hasError = !(error instanceof MarketDataError) || error.code !== "UNAVAILABLE";
    return candleInputFromError({ timeframe, reason, hasError });
  }
}

function getCachedTimeframe(symbol: string, timeframe: IntelligenceTimeframe) {
  return cached(`timeframe:${symbol}:${timeframe}`, ASSET_CACHE_TTL_MS, () => fetchTimeframe(symbol, timeframe));
}

export interface LiveFrameIntelligence {
  intelligence: AssetIntelligence;
  source: ExchangeSource;
  cachedAt: number;
  isStale: boolean;
}

export async function getLiveFrameIntelligence(input: { assetId: string; timeframe: IntelligenceTimeframe; source: ExchangeSource }): Promise<LiveFrameIntelligence> {
  const asset = findAsset(input.assetId);
  return cached(`live-frame:${asset.id}:${input.timeframe}:${input.source}`, LIVE_FRAME_CACHE_TTL_MS, async () => {
    const build = (frame: TimeframeAnalysisInput, cachedAt: number, isStale: boolean): LiveFrameIntelligence => ({
      intelligence: composeAssetIntelligence({ assetId: asset.id, name: asset.name, symbol: asset.symbol, timeframes: [frame], preferredTimeframe: input.timeframe }),
      source: input.source,
      cachedAt,
      isStale,
    });
    try {
      const candles = await getLiveCandlesFromSource({ symbol: asset.symbol, interval: input.timeframe, limit: timeframeSampleLimit[input.timeframe], source: input.source, cacheTtlMs: LIVE_FRAME_CACHE_TTL_MS });
      const latest = candles.candles.at(-1);
      const frame: TimeframeAnalysisInput = {
        timeframe: input.timeframe,
        candles: candles.candles.map((candle) => ({ openTime: candle.openTime, closeTime: candle.closeTime, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, quoteVolumeUsd: candle.quoteVolumeUsd, tradeCount: candle.tradeCount })),
        source: candles.source,
        cachedAt: candles.cachedAt,
        providerUpdatedAt: latest?.closeTime ?? null,
        providerTimestampOrigin: latest ? "provider" : null,
        isStale: candles.isStale,
        unavailableReasons: latest ? [] : [`No ${input.timeframe} candles were returned by the selected provider.`],
      };
      return build(frame, candles.cachedAt, candles.isStale);
    } catch (error) {
      const reason = error instanceof Error ? error.message : `The ${input.timeframe} live Intelligence frame is unavailable.`;
      return build(candleInputFromError({ timeframe: input.timeframe, reason, hasError: true }), Date.now(), false);
    }
  });
}

async function buildAssetIntelligence(input: {
  assetId: string;
  timeframes: IntelligenceTimeframe[];
  preferredTimeframe?: IntelligenceTimeframe;
}): Promise<AssetIntelligence> {
  const asset = findAsset(input.assetId);
  const uniqueTimeframes = Array.from(new Set(input.timeframes));
  const frames = await Promise.all(uniqueTimeframes.map((timeframe) => getCachedTimeframe(asset.symbol, timeframe)));
  return composeAssetIntelligence({
    assetId: asset.id,
    name: asset.name,
    symbol: asset.symbol,
    timeframes: frames,
    preferredTimeframe: input.preferredTimeframe,
  });
}

export async function getAssetIntelligence(input: {
  assetId: string;
  timeframes?: IntelligenceTimeframe[];
  preferredTimeframe?: IntelligenceTimeframe;
}): Promise<AssetIntelligence> {
  const timeframes: IntelligenceTimeframe[] = input.timeframes?.length
    ? Array.from(new Set(input.timeframes))
    : ["5m", "15m", "1h", "4h", "1d"];
  const key = `asset:${input.assetId}:${timeframes.join(",")}:${input.preferredTimeframe ?? "auto"}`;
  return cached(key, ASSET_CACHE_TTL_MS, () => buildAssetIntelligence({ ...input, timeframes }));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export interface OpportunityScannerRow {
  assetId: string;
  name: string;
  symbol: string;
  quality: DataQualityState;
  priceUsd: number;
  priceChange24hPercent: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  regime: MarketRegime;
  trend: StructureTrend;
  momentum: string;
  volatility: string;
  opportunityScore: number;
  riskScore: number;
  signalStrength: number;
  primaryTimeframe: IntelligenceTimeframe;
  source: string;
  providerUpdatedAt: number;
  isStale: boolean;
  positiveFactors: string[];
  riskFactors: string[];
}

export interface OpportunityScannerResult {
  rows: OpportunityScannerRow[];
  omitted: Array<{ assetId: string; reason: string }>;
  scannedAt: number;
  source: "coingecko+public-exchange";
  isStale: boolean;
}

export interface ScannerInput {
  assetIds?: string[];
  timeframe?: IntelligenceTimeframe;
  minimumOpportunity?: number;
  maximumRisk?: number;
  minimumVolumeUsd?: number;
  trend?: StructureTrend;
  limit?: number;
}

function rowFromAnalysis(analysis: AssetIntelligence, market: LiveMarketAsset): OpportunityScannerRow | null {
  if (
    analysis.primaryTimeframe === null
    || analysis.opportunityScore.value === null
    || analysis.riskScore.value === null
    || analysis.signalStrength.value === null
    || market.priceUsd === null
  ) return null;
  const primary = analysis.timeframes.find((frame) => frame.timeframe === analysis.primaryTimeframe);
  if (!primary || primary.metadata.quality === "UNAVAILABLE" || primary.metadata.quality === "ERROR") return null;
  return {
    assetId: analysis.assetId,
    name: analysis.name,
    symbol: analysis.symbol,
    quality: primary.metadata.quality,
    priceUsd: market.priceUsd,
    priceChange24hPercent: market.priceChange24hPercent,
    volume24hUsd: market.volume24hUsd,
    marketCapUsd: market.marketCapUsd,
    regime: primary.regime.status === "AVAILABLE" ? primary.regime.value.regime : "UNCLEAR",
    trend: primary.structure.status === "AVAILABLE" ? primary.structure.value.trend : "UNAVAILABLE",
    momentum: primary.momentum.status === "AVAILABLE" ? primary.momentum.value.direction : "UNAVAILABLE",
    volatility: primary.volatility.status === "AVAILABLE" ? primary.volatility.value.level : "UNAVAILABLE",
    opportunityScore: analysis.opportunityScore.value,
    riskScore: analysis.riskScore.value,
    signalStrength: analysis.signalStrength.value,
    primaryTimeframe: analysis.primaryTimeframe,
    source: primary.metadata.source,
    providerUpdatedAt: market.providerUpdatedAt,
    isStale: primary.metadata.isStale,
    positiveFactors: analysis.opportunityScore.factors.filter((factor) => factor.impact === "POSITIVE").map((factor) => factor.description).slice(0, 3),
    riskFactors: analysis.riskScore.factors.filter((factor) => factor.impact === "RISK").map((factor) => factor.description).slice(0, 3),
  };
}

export async function getOpportunityScanner(input: ScannerInput = {}): Promise<OpportunityScannerResult> {
  const assets = (input.assetIds?.length
    ? input.assetIds.map(findAsset)
    : [...supportedIntelligenceAssets]
  ).slice(0, supportedIntelligenceAssets.length);
  const timeframe = input.timeframe ?? "4h";
  const analysisFrames = Array.from(new Set<IntelligenceTimeframe>([timeframe, "1h", "4h", "1d"]));
  const key = `scanner:${assets.map((asset) => asset.id).join(",")}:${timeframe}:${input.minimumOpportunity ?? 0}:${input.maximumRisk ?? 100}:${input.minimumVolumeUsd ?? 0}:${input.trend ?? "any"}:${input.limit ?? 8}`;

  return cached(key, SCANNER_CACHE_TTL_MS, async () => {
    const directory = await getMarketDirectory({
      page: 1,
      perPage: Math.max(10, assets.length),
      order: "market_cap_desc",
      ids: assets.map((asset) => asset.id),
    });
    const marketById = new Map(directory.assets.map((asset) => [asset.id, asset]));
    const analyses = await mapWithConcurrency(assets, SCANNER_CONCURRENCY, async (asset) => {
      try {
        const analysis = await getAssetIntelligence({ assetId: asset.id, timeframes: analysisFrames, preferredTimeframe: timeframe });
        return { asset, analysis, reason: null };
      } catch (error) {
        return { asset, analysis: null, reason: error instanceof Error ? error.message : "Intelligence analysis failed." };
      }
    });

    const omitted: Array<{ assetId: string; reason: string }> = [];
    const rows = analyses.flatMap(({ asset, analysis, reason }) => {
      const market = marketById.get(asset.id);
      if (!analysis || !market) {
        omitted.push({ assetId: asset.id, reason: reason ?? "Required market data is unavailable." });
        return [];
      }
      const row = rowFromAnalysis(analysis, market);
      if (!row) {
        omitted.push({ assetId: asset.id, reason: "Required scoring evidence is unavailable." });
        return [];
      }
      return [row];
    })
      .filter((row) => row.opportunityScore >= (input.minimumOpportunity ?? 0))
      .filter((row) => row.riskScore <= (input.maximumRisk ?? 100))
      .filter((row) => (row.volume24hUsd ?? 0) >= (input.minimumVolumeUsd ?? 0))
      .filter((row) => !input.trend || row.trend === input.trend)
      .sort((left, right) => right.opportunityScore - left.opportunityScore || left.riskScore - right.riskScore)
      .slice(0, Math.min(Math.max(input.limit ?? 8, 1), supportedIntelligenceAssets.length));

    return {
      rows,
      omitted,
      scannedAt: Date.now(),
      source: "coingecko+public-exchange" as const,
      isStale: directory.isStale || rows.some((row) => row.isStale),
    };
  });
}

export async function getMarketIntelligenceOverview() {
  const scanner = await getOpportunityScanner({ limit: supportedIntelligenceAssets.length, timeframe: "4h" });
  const rows = scanner.rows;
  const regimeCounts = rows.reduce<Record<MarketRegime, number>>((counts, row) => {
    counts[row.regime] += 1;
    return counts;
  }, {
    TRENDING_BULLISH: 0,
    TRENDING_BEARISH: 0,
    RANGE_CONSOLIDATION: 0,
    HIGH_VOLATILITY: 0,
    LOW_VOLATILITY: 0,
    UNCLEAR: 0,
  });
  const overallRegime: MarketRegime = rows.length === 0 ? "UNCLEAR"
    : regimeCounts.HIGH_VOLATILITY >= Math.ceil(rows.length * 0.4) ? "HIGH_VOLATILITY"
      : regimeCounts.TRENDING_BULLISH > regimeCounts.TRENDING_BEARISH ? "TRENDING_BULLISH"
        : regimeCounts.TRENDING_BEARISH > regimeCounts.TRENDING_BULLISH ? "TRENDING_BEARISH"
          : regimeCounts.RANGE_CONSOLIDATION >= Math.ceil(rows.length * 0.4) ? "RANGE_CONSOLIDATION"
            : "UNCLEAR";
  const bitcoin = rows.find((row) => row.assetId === "bitcoin") ?? null;
  const bullishMomentum = rows.filter((row) => row.momentum === "BULLISH").length;
  const bearishMomentum = rows.filter((row) => row.momentum === "BEARISH").length;

  return {
    overallRegime,
    bitcoin,
    marketMomentum: bullishMomentum > bearishMomentum ? "BULLISH" : bearishMomentum > bullishMomentum ? "BEARISH" : "MIXED",
    volatility: rows.filter((row) => row.volatility === "HIGH").length >= Math.ceil(Math.max(rows.length, 1) * 0.4) ? "HIGH" : "NORMAL",
    topOpportunities: rows.slice(0, 5),
    highestRisk: [...rows].sort((left, right) => right.riskScore - left.riskScore).slice(0, 5),
    majorMovements: [...rows]
      .filter((row) => row.priceChange24hPercent !== null)
      .sort((left, right) => Math.abs(right.priceChange24hPercent ?? 0) - Math.abs(left.priceChange24hPercent ?? 0))
      .slice(0, 5),
    regimeCounts,
    availableAssets: rows.length,
    omittedAssets: scanner.omitted,
    generatedAt: Date.now(),
    source: scanner.source,
    isStale: scanner.isStale,
  };
}
