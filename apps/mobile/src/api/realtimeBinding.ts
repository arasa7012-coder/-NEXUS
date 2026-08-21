/**
 * Binds the realtime client to mobile state.
 *
 * Kept separate from RealtimeClient so the client stays a pure, testable
 * transport concern and this file owns the wiring. A single module-level
 * instance prevents the duplicate-stream bug where a remount opens a second
 * connection and every event is applied twice.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT for the React lifecycle; the client and the
 * reducers it drives are covered by verify.e2e.ts.
 */

import Constants from "expo-constants";
import { RealtimeClient } from "./realtime.ts";
import type { RealtimeTransport } from "./realtime.ts";
import { tokenStore } from "./session.ts";
import { applyRealtimeEvent, connectionStore, alertsStore, riskStore, intelligenceStore } from "../state/stores.ts";
import { api } from "./queries.ts";
import { upsertAlert } from "../state/stores.ts";

/**
 * React Native's fetch does expose a readable body on modern versions, but not
 * on every engine configuration, so the transport is injected rather than
 * assumed. This is the one place that assumption lives.
 */
const fetchTransport: RealtimeTransport = {
  async open({ url, headers, signal, onChunk }) {
    const response = await fetch(url, { headers, signal });
    if (!response.ok || !response.body) throw new Error(`Realtime stream failed: ${response.status}`);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  },
};

let client: RealtimeClient | null = null;

export async function startRealtime(): Promise<void> {
  if (client) return;

  const baseUrl = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (!baseUrl) return;

  client = new RealtimeClient({
    baseUrl,
    transport: fetchTransport,
    getAccessToken: () => tokenStore.getAccessToken(),
    onStateChange: (state) => connectionStore.set(state),
    onEvent: (event) => {
      applyRealtimeEvent(event, {
        // Targeted refetches only. Reloading the whole app on every event
        // would be slow and, on a metered connection, expensive.
        fetchAlert: (alertId) => {
          void api.alert(alertId).then((result) => {
            if (!result.ok) return;
            alertsStore.update((slice) => ({
              ...slice,
              data: upsertAlert(slice.data ?? [], result.data),
            }));
          });
        },
        refreshRisk: () => { riskStore.update((s) => ({ ...s, loading: s.data === null })); },
        refreshIntelligence: () => { intelligenceStore.update((s) => ({ ...s, loading: s.data === null })); },
      });
    },
  });

  await client.start();
}

export function stopRealtime(): void {
  client?.stop();
  client = null;
}
