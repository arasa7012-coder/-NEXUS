/**
 * React binding for the domain stores.
 *
 * `useSyncExternalStore` is the correct primitive here: it is tear-free under
 * concurrent rendering, which a naive useEffect+setState subscription is not.
 * Keeping the binding this thin is what allows the stores themselves to stay
 * React-free and directly testable.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react is not installable here. The stores
 * and reducers it binds to are covered by verify.e2e.ts.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Store, RemoteSlice } from "./stores.ts";
import { applyResult } from "./stores.ts";
import type { NexusError } from "@nexus/contracts";

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(
    useCallback((listener) => store.subscribe(listener), [store]),
    useCallback(() => store.get(), [store]),
  );
}

export type Fetcher<T> = () => Promise<{ ok: true; data: T } | { ok: false; error: NexusError }>;

/**
 * Loads a remote slice on mount and exposes a refresh.
 *
 * On failure the previous data is retained and the error surfaced alongside
 * it, so a screen can render last-known state behind a stale marker instead of
 * blanking — the rule from §19 applied consistently at every call site.
 */
export function useRemote<T>(
  store: Store<RemoteSlice<T>>,
  fetcher: Fetcher<T>,
  deps: unknown[] = [],
): RemoteSlice<T> & { refresh: () => Promise<void> } {
  const slice = useStore(store);

  const load = useCallback(async () => {
    store.update((s) => ({ ...s, loading: s.data === null }));
    const result = await fetcher();
    store.update((s) => applyResult(s, result, Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void load(); }, [load]);

  return { ...slice, refresh: load };
}
