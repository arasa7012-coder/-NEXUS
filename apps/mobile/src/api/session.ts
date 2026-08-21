/**
 * Session and client wiring.
 *
 * §20: the access token lives in the platform keychain via expo-secure-store,
 * never in AsyncStorage, and the app holds no provider credentials of any kind
 * — every external API key stays on the backend. The mobile app talks only to
 * NEXUS.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — expo-secure-store is not installable here.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { NexusClient } from "./client.ts";
import type { TokenStore } from "./client.ts";

const ACCESS_TOKEN_KEY = "nexus.accessToken";
const REFRESH_TOKEN_KEY = "nexus.refreshToken";
const SESSION_ID_KEY = "nexus.sessionId";

type SessionListener = () => void;
const listeners = new Set<SessionListener>();

export const tokenStore: TokenStore = {
  async getAccessToken() {
    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch {
      // A keychain read failure must not be treated as "no session" silently
      // enough to loop; returning null lets the 401 path handle it once.
      return null;
    }
  },
  async onUnauthorized() {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
    listeners.forEach((l) => l());
  },
};

export async function storeAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function onSessionExpired(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface LoginOutcome {
  ok: boolean;
  userId: string;
  roles: string[];
  error: { message: string };
}

/**
 * Exchange credentials for tokens.
 *
 * Uses a bare fetch rather than NexusClient because the client attaches the
 * (absent) access token and handles 401 by clearing a session that does not
 * exist yet. Login is the one call that precedes a session.
 */
export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string; roles: string[] } | { ok: false; error: { message: string } }> {
  try {
    const response = await fetch(`${baseUrl()}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: { message: body.message ?? "Sign in failed." } };
    }

    const body = (await response.json()) as {
      accessToken: string; refreshToken: string; user: { id: string; roles: string[] };
    };
    await storeAccessToken(body.accessToken);
    await storeRefreshToken(body.refreshToken, decodeSid(body.accessToken));
    return { ok: true, userId: body.user.id, roles: body.user.roles };
  } catch {
    return { ok: false, error: { message: "No connection to NEXUS." } };
  }
}

export async function logout(): Promise<void> {
  const token = await tokenStore.getAccessToken();
  if (token) {
    // Best effort: the server revokes the session, but local credentials are
    // cleared regardless so a network failure cannot leave the user signed in.
    await fetch(`${baseUrl()}/v1/auth/logout`, {
      method: "POST", headers: { authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(SESSION_ID_KEY).catch(() => {});
  listeners.forEach((l) => l());
}

/** Reads the session id from the access token payload; no secret is exposed. */
function decodeSid(accessToken: string): string {
  try {
    const payload = accessToken.split(".")[1] ?? "";
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { sid?: string };
    return payload && typeof json.sid === "string" ? json.sid : "";
  } catch {
    return "";
  }
}

async function storeRefreshToken(token: string, sid: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(SESSION_ID_KEY, sid, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

function baseUrl(): string {
  const url = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (!url) throw new Error("apiBaseUrl is not configured for this build.");
  return url.replace(/\/+$/, "");
}

let client: NexusClient | null = null;

export function getClient(): NexusClient {
  if (!client) {
    client = new NexusClient({ baseUrl: baseUrl(), fetchImpl: fetch, tokens: tokenStore });
  }
  return client;
}
