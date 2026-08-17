import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

function readConnectionState() {
  return {
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    isVisible: typeof document === "undefined" ? true : document.visibilityState === "visible",
  };
}

export type LiveConnectionState = ReturnType<typeof readConnectionState>;

type RateLimitResponse = {
  success?: unknown;
  error?: {
    code?: unknown;
    retryAfterSeconds?: unknown;
  } | null;
};

export function getLiveRateLimitMetadata(response: unknown) {
  const candidate = response as RateLimitResponse | null | undefined;
  if (candidate?.success !== false || candidate.error?.code !== "RATE_LIMITED") {
    return { isRateLimited: false, retryAfterSeconds: 0 } as const;
  }

  const requestedDelay = Number(candidate.error.retryAfterSeconds);
  const retryAfterSeconds = Number.isFinite(requestedDelay)
    ? Math.max(1, Math.min(120, Math.ceil(requestedDelay)))
    : 15;
  return { isRateLimited: true, retryAfterSeconds } as const;
}

export function getLiveRefreshControlState({ isOnline, isFetching, isRateLimited }: { isOnline: boolean; isFetching: boolean; isRateLimited: boolean }) {
  if (isRateLimited) return { disabled: true, reason: "provider_rate_limited" } as const;
  if (!isOnline) return { disabled: true, reason: "offline" } as const;
  if (isFetching) return { disabled: true, reason: "fetching" } as const;
  return { disabled: false, reason: null } as const;
}

export function useLiveRateLimitStatus(response: unknown) {
  const metadata = getLiveRateLimitMetadata(response);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!metadata.isRateLimited) {
      setRetryAt(0);
      return;
    }

    const nextRetryAt = Date.now() + metadata.retryAfterSeconds * 1_000;
    setRetryAt(nextRetryAt);
    const timeout = window.setTimeout(() => setNow(Date.now()), metadata.retryAfterSeconds * 1_000);
    return () => window.clearTimeout(timeout);
  }, [metadata.isRateLimited, metadata.retryAfterSeconds, response]);

  const remainingSeconds = retryAt > now ? Math.max(1, Math.ceil((retryAt - now) / 1_000)) : 0;
  return {
    isRateLimited: metadata.isRateLimited && remainingSeconds > 0,
    retryAfterSeconds: remainingSeconds,
  } as const;
}

export function createLiveRefreshPolicy(refreshIntervalMs: number, connection: LiveConnectionState) {
  const boundedInterval = Math.max(5_000, refreshIntervalMs);
  const canRefresh = connection.isOnline && connection.isVisible;
  return {
    isOnline: connection.isOnline,
    isVisible: connection.isVisible,
    canRefresh,
    enabled: connection.isOnline,
    staleTime: Math.max(5_000, Math.floor(boundedInterval * 0.8)),
    refetchInterval: canRefresh ? boundedInterval : false,
    refetchIntervalInBackground: false,
    retry: (failureCount: number) => connection.isOnline && failureCount < 2,
    retryDelay: (attempt: number) => Math.min(1_000 * 2 ** attempt, 8_000),
  } as const;
}

export function useLiveRefreshPolicy(refreshIntervalMs: number) {
  const [connection, setConnection] = useState(readConnectionState);

  useEffect(() => {
    const updateConnection = () => setConnection(readConnectionState());
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    document.addEventListener("visibilitychange", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      document.removeEventListener("visibilitychange", updateConnection);
    };
  }, []);

  return useMemo(() => createLiveRefreshPolicy(refreshIntervalMs, connection), [connection, refreshIntervalMs]);
}

export function useLiveMarketDirectory(input: {
  page: number;
  perPage: number;
  order: "market_cap_desc" | "market_cap_asc" | "volume_desc" | "volume_asc" | "id_asc" | "id_desc";
}) {
  const policy = useLiveRefreshPolicy(65_000);
  const stableInput = useMemo(() => input, [input.page, input.perPage, input.order]);
  const query = trpc.marketData.markets.useQuery(stableInput, policy);
  return { ...query, ...policy };
}

export function useLiveMarketSearch(queryText: string) {
  const policy = useLiveRefreshPolicy(10 * 60_000);
  const normalizedQuery = queryText.trim();
  const stableInput = useMemo(() => ({ query: normalizedQuery }), [normalizedQuery]);
  const query = trpc.marketData.search.useQuery(
    stableInput,
    {
      ...policy,
      enabled: policy.enabled && normalizedQuery.length >= 2,
      refetchInterval: false,
    },
  );
  return { ...query, ...policy, normalizedQuery };
}

export function useLiveAssetMarket(id: string) {
  const policy = useLiveRefreshPolicy(65_000);
  const stableInput = useMemo(() => ({ id }), [id]);
  const query = trpc.marketData.asset.useQuery(
    stableInput,
    { ...policy, enabled: policy.enabled && Boolean(id) },
  );
  return { ...query, ...policy };
}

export function useLiveTradingContext(input: {
  symbol: string;
  interval: "15m" | "1h" | "4h" | "1d";
}) {
  const policy = useLiveRefreshPolicy(12_000);
  const stableInput = useMemo(() => ({
    symbol: input.symbol,
    interval: input.interval,
    candleLimit: 80,
    depthLimit: 20 as const,
    tradeLimit: 20,
  }), [input.interval, input.symbol]);
  const query = trpc.marketData.tradingContext.useQuery(
    stableInput,
    { ...policy, enabled: policy.enabled && Boolean(input.symbol) },
  );
  return { ...query, ...policy };
}

export function useLiveActiveCandle(input: {
  symbol: string;
  interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  source: "binance" | "coinbase" | null;
  enabled?: boolean;
}) {
  const policy = useLiveRefreshPolicy(5_000);
  const stableInput = useMemo(() => ({ symbol: input.symbol, interval: input.interval, source: input.source ?? "binance" }), [input.interval, input.source, input.symbol]);
  const query = trpc.marketData.activeCandle.useQuery(stableInput, {
    ...policy,
    enabled: policy.enabled && Boolean(input.enabled ?? true) && Boolean(input.symbol) && input.source !== null,
  });
  return { ...query, ...policy };
}

export function useLiveFrameIntelligence(input: {
  assetId: "bitcoin" | "ethereum" | "solana" | "binancecoin" | "ripple" | "cardano" | "dogecoin" | "chainlink";
  timeframe: "5m" | "15m" | "1h" | "4h" | "1d";
  source: "binance" | "coinbase" | null;
  enabled?: boolean;
}) {
  const policy = useLiveRefreshPolicy(5_000);
  const stableInput = useMemo(() => ({ assetId: input.assetId, timeframe: input.timeframe, source: input.source ?? "binance" }), [input.assetId, input.source, input.timeframe]);
  const query = trpc.intelligence.liveFrame.useQuery(stableInput, {
    ...policy,
    enabled: policy.enabled && Boolean(input.enabled ?? true) && input.source !== null,
  });
  return { ...query, ...policy };
}

export function useLiveSimulationPortfolio() {
  const policy = useLiveRefreshPolicy(25_000);
  const query = trpc.simulationPortfolio.getState.useQuery(undefined, policy);
  return { ...query, ...policy };
}
