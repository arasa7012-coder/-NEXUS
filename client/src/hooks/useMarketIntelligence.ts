import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLiveRefreshPolicy } from "@/hooks/useLiveMarketData";

export type IntelligenceTimeframe = "5m" | "15m" | "1h" | "4h" | "1d";
export type IntelligenceTrend = "UPTREND" | "DOWNTREND" | "RANGE" | "MIXED" | "UNAVAILABLE";
const supportedAssetIds = ["bitcoin", "ethereum", "solana", "binancecoin", "ripple", "cardano", "dogecoin", "chainlink"] as const;

export function useMarketIntelligenceOverview() {
  const policy = useLiveRefreshPolicy(65_000);
  const query = trpc.intelligence.overview.useQuery(undefined, policy);
  return { ...query, ...policy };
}

export function useAssetIntelligence(assetId: string, preferredTimeframe: IntelligenceTimeframe = "4h") {
  const policy = useLiveRefreshPolicy(65_000);
  const isSupported = supportedAssetIds.includes(assetId as (typeof supportedAssetIds)[number]);
  const input = useMemo(() => ({
    assetId: assetId as (typeof supportedAssetIds)[number],
    timeframes: ["5m", "15m", "1h", "4h", "1d"] as IntelligenceTimeframe[],
    preferredTimeframe,
  }), [assetId, preferredTimeframe]);
  const query = trpc.intelligence.asset.useQuery(input, {
    ...policy,
    enabled: policy.enabled && Boolean(assetId) && isSupported,
    placeholderData: (previousData) => previousData,
  });
  return { ...query, ...policy, isSupported };
}

export interface ScannerFilters {
  assetId?: (typeof supportedAssetIds)[number];
  timeframe: IntelligenceTimeframe;
  minimumOpportunity: number;
  maximumRisk: number;
  minimumVolumeUsd: number;
  trend?: IntelligenceTrend;
}

export function useOpportunityScanner(filters: ScannerFilters) {
  const policy = useLiveRefreshPolicy(65_000);
  const input = useMemo(() => ({
    assetIds: filters.assetId ? [filters.assetId] : undefined,
    timeframe: filters.timeframe,
    minimumOpportunity: filters.minimumOpportunity,
    maximumRisk: filters.maximumRisk,
    minimumVolumeUsd: filters.minimumVolumeUsd,
    trend: filters.trend,
    limit: 8,
  }), [
    filters.assetId,
    filters.maximumRisk,
    filters.minimumOpportunity,
    filters.minimumVolumeUsd,
    filters.timeframe,
    filters.trend,
  ]);
  const query = trpc.intelligence.scanner.useQuery(input, policy);
  return { ...query, ...policy };
}
