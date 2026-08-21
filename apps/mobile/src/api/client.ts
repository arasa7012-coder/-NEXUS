/**
 * NEXUS API client.
 *
 * Deliberately free of React and of any HTTP library: `fetch` and the token
 * store are injected. That keeps the parts most likely to be wrong — error
 * mapping, retry policy, response validation — testable without a simulator,
 * which matters because these paths only execute when something has already
 * gone wrong in production.
 *
 * Two rules it enforces:
 *
 *   1. Every response is validated against @nexus/contracts before it reaches
 *      a screen. A malformed payload becomes a typed error, never a crash
 *      three components deep during render.
 *   2. A failure is never silently rendered as an empty state. Callers receive
 *      a discriminated result and must handle the error branch.
 */

import { isRetryable, ValidationError } from "@nexus/contracts";
import type { ErrorCode, NexusError, Validator } from "@nexus/contracts";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: NexusError };

export interface TokenStore {
  /** Reads from secure storage. Never from AsyncStorage — §20. */
  getAccessToken(): Promise<string | null>;
  onUnauthorized(): Promise<void>;
}

export interface ClientConfig {
  baseUrl: string;
  fetchImpl: typeof fetch;
  tokens: TokenStore;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected so backoff is assertable without waiting. */
  sleep?: (ms: number) => Promise<void>;
}

/** Maps transport and HTTP status onto the closed ErrorCode set. */
export function classifyStatus(status: number): ErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION";
  if (status === 429) return "RATE_LIMIT";
  if (status === 503 || status === 502 || status === 504) return "PROVIDER_UNAVAILABLE";
  if (status >= 500) return "INTERNAL";
  return "INTERNAL";
}

const USER_MESSAGE: Record<ErrorCode, string> = {
  NETWORK: "No connection to NEXUS.",
  TIMEOUT: "NEXUS did not respond in time.",
  UNAUTHENTICATED: "Your session has expired.",
  FORBIDDEN: "You do not have access to this.",
  NOT_FOUND: "That is no longer available.",
  VALIDATION: "The request was rejected as invalid.",
  RATE_LIMIT: "Too many requests. Try again shortly.",
  PROVIDER_FAILURE: "A data provider failed.",
  PROVIDER_UNAVAILABLE: "A data provider is unavailable.",
  DATA_UNAVAILABLE: "This data is not currently available.",
  CONFLICT: "This changed elsewhere. Reload and retry.",
  INTERNAL: "Something went wrong inside NEXUS.",
};

export function toNexusError(code: ErrorCode, detail?: string, traceId?: string | null): NexusError {
  return {
    code,
    message: detail ?? USER_MESSAGE[code],
    retryable: isRetryable(code),
    traceId: traceId ?? null,
  };
}

/** Exponential backoff. Deterministic, so tests can assert the schedule. */
export function retryDelayMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 8_000);
}

export class NexusClient {
  private readonly cfg: Required<Omit<ClientConfig, "tokens">> & { tokens: TokenStore };

  constructor(config: ClientConfig) {
    this.cfg = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      fetchImpl: config.fetchImpl,
      tokens: config.tokens,
      timeoutMs: config.timeoutMs ?? 10_000,
      maxRetries: config.maxRetries ?? 2,
      sleep: config.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    };
  }

  async request<T>(
    path: string,
    validator: Validator<T>,
    init: { method?: string; body?: unknown } = {},
  ): Promise<ApiResult<T>> {
    let lastError: NexusError = toNexusError("INTERNAL");

    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      if (attempt > 0) await this.cfg.sleep(retryDelayMs(attempt - 1));

      const result = await this.attempt(path, validator, init);
      if (result.ok) return result;

      lastError = result.error;
      // Retrying a 403 or a validation failure only wastes battery.
      if (!result.error.retryable) return result;
    }

    return { ok: false, error: lastError };
  }

  private async attempt<T>(
    path: string,
    validator: Validator<T>,
    init: { method?: string; body?: unknown },
  ): Promise<ApiResult<T>> {
    const token = await this.cfg.tokens.getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const response = await this.cfg.fetchImpl(`${this.cfg.baseUrl}${path}`, {
        method: init.method ?? "GET",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });

      const traceId = response.headers?.get?.("x-trace-id") ?? null;

      if (response.status === 401) {
        await this.cfg.tokens.onUnauthorized();
        return { ok: false, error: toNexusError("UNAUTHENTICATED", undefined, traceId) };
      }

      if (!response.ok) {
        const code = classifyStatus(response.status);
        let detail: string | undefined;
        try {
          const payload = (await response.json()) as { message?: unknown };
          if (typeof payload?.message === "string") detail = payload.message;
        } catch {
          // A non-JSON error body is expected from proxies and gateways.
        }
        return { ok: false, error: toNexusError(code, detail, traceId) };
      }

      const payload: unknown = await response.json();
      try {
        return { ok: true, data: validator.parse(payload) };
      } catch (error) {
        // The server broke its own contract. Surfacing this as VALIDATION with
        // the offending paths is far more debuggable than a render crash.
        const issues = error instanceof ValidationError ? error.issues : [];
        return {
          ok: false,
          error: {
            ...toNexusError("VALIDATION", "NEXUS returned an unexpected response.", traceId),
            fields: issues.map((i) => ({ path: i.path, message: i.message })),
          },
        };
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return { ok: false, error: toNexusError(aborted ? "TIMEOUT" : "NETWORK", undefined, null) };
    } finally {
      clearTimeout(timer);
    }
  }
}
