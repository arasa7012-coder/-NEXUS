import { describe, expect, it } from "vitest";
import { createLiveRefreshPolicy, getLiveRateLimitMetadata, getLiveRefreshControlState } from "./useLiveMarketData";

describe("live refresh policy", () => {
  it("refreshes live market data only while the browser is online and visible", () => {
    const policy = createLiveRefreshPolicy(12_000, { isOnline: true, isVisible: true });

    expect(policy).toMatchObject({ enabled: true, canRefresh: true, refetchInterval: 12_000, refetchIntervalInBackground: false, staleTime: 9_600 });
  });

  it("pauses polling in a hidden tab while preserving an online query boundary", () => {
    const policy = createLiveRefreshPolicy(12_000, { isOnline: true, isVisible: false });

    expect(policy).toMatchObject({ enabled: true, canRefresh: false, refetchInterval: false, refetchIntervalInBackground: false });
    expect(policy.retry(0)).toBe(true);
  });

  it("disables live queries and retries while offline", () => {
    const policy = createLiveRefreshPolicy(12_000, { isOnline: false, isVisible: true });

    expect(policy).toMatchObject({ enabled: false, canRefresh: false, refetchInterval: false });
    expect(policy.retry(0)).toBe(false);
  });

  it("bounds cache age and retry backoff to protect providers", () => {
    const policy = createLiveRefreshPolicy(1_000, { isOnline: true, isVisible: true });

    expect(policy.staleTime).toBe(5_000);
    expect(policy.refetchInterval).toBe(5_000);
    expect(policy.retry(0)).toBe(true);
    expect(policy.retry(1)).toBe(true);
    expect(policy.retry(2)).toBe(false);
    expect(policy.retryDelay(0)).toBe(1_000);
    expect(policy.retryDelay(3)).toBe(8_000);
    expect(policy.retryDelay(10)).toBe(8_000);
  });

  it("uses the bounded visible-tab cadence required for active candles and live analytical evidence", () => {
    const activePolicy = createLiveRefreshPolicy(5_000, { isOnline: true, isVisible: true });
    const hiddenPolicy = createLiveRefreshPolicy(5_000, { isOnline: true, isVisible: false });

    expect(activePolicy).toMatchObject({ refetchInterval: 5_000, staleTime: 5_000, refetchIntervalInBackground: false });
    expect(hiddenPolicy.refetchInterval).toBe(false);
  });

  it("normalizes server rate-limit metadata into a bounded client retry window", () => {
    expect(getLiveRateLimitMetadata({ success: false, error: { code: "RATE_LIMITED", retryAfterSeconds: 18 } })).toEqual({ isRateLimited: true, retryAfterSeconds: 18 });
    expect(getLiveRateLimitMetadata({ success: false, error: { code: "RATE_LIMITED", retryAfterSeconds: 999 } })).toEqual({ isRateLimited: true, retryAfterSeconds: 120 });
    expect(getLiveRateLimitMetadata({ success: false, error: { code: "UPSTREAM_UNAVAILABLE" } })).toEqual({ isRateLimited: false, retryAfterSeconds: 0 });
  });

  it("gates manual refresh while the provider-directed retry window is active", () => {
    expect(getLiveRefreshControlState({ isOnline: true, isFetching: false, isRateLimited: true })).toEqual({ disabled: true, reason: "provider_rate_limited" });
    expect(getLiveRefreshControlState({ isOnline: false, isFetching: false, isRateLimited: false })).toEqual({ disabled: true, reason: "offline" });
    expect(getLiveRefreshControlState({ isOnline: true, isFetching: false, isRateLimited: false })).toEqual({ disabled: false, reason: null });
  });
});
