/**
 * Command Center data hook.
 *
 * Deliberately thin: fetch, validate, cache the last good payload, expose the
 * states the UI must distinguish (loading / data / error / stale-with-data).
 *
 * The important behaviour is the last one. When a refresh fails but a previous
 * payload exists, the hook keeps the old data AND surfaces the error, so the
 * screen shows the last known state behind an explicit stale notice. Dropping
 * to a blank error screen hides information the user still has; showing the
 * old data as current violates §19. Both are wrong, so it returns both.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react is not installable here. The client
 * it calls (src/api/client.ts) is covered by verify.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { commandCenterView } from "@nexus/contracts";
import type { CommandCenterView, NexusError } from "@nexus/contracts";
import { getClient } from "../api/session.ts";

export interface CommandCenterState {
  data: CommandCenterView | null;
  error: NexusError | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

export function useCommandCenter(pollMs = 30_000): CommandCenterState {
  const [data, setData] = useState<CommandCenterView | null>(null);
  const [error, setError] = useState<NexusError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    const result = await getClient().request("/v1/command-center", commandCenterView);
    if (!mounted.current) return;

    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      // Keep whatever we already had; the screen renders it behind a stale notice.
      setError(result.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load(false);

    // Polling is the fallback for when the realtime channel is down. The socket
    // is the primary path; this exists so the screen cannot silently freeze.
    const timer = setInterval(() => { void load(false); }, pollMs);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load, pollMs]);

  return { data, error, loading, refreshing, refresh: () => load(true) };
}
