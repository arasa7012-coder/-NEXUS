/**
 * Structured logging (§27).
 *
 * One JSON object per line, so logs are queryable rather than greppable. Two
 * rules that matter more than the format:
 *
 *   1. Every log line carries the request id, so a user reporting "it failed
 *      at 14:02" becomes one query instead of an investigation.
 *   2. Known-sensitive keys are redacted at the logger, not at each call site.
 *      Relying on discipline to keep tokens out of logs fails eventually; doing
 *      it centrally fails never.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT = [
  "password", "passwordhash", "token", "accesstoken", "refreshtoken",
  "authorization", "cookie", "secret", "apikey", "api_key", "jwt",
  "encryptionkey", "signingkey", "privatekey",
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT.includes(key.toLowerCase()) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

export interface LogFields {
  // `| undefined` is explicit: call sites legitimately log an optional user id
  // (an unauthenticated request has none), and under
  // exactOptionalPropertyTypes a bare `?` would reject that.
  requestId?: string | undefined;
  userId?: string | undefined;
  [key: string]: unknown;
}

export interface Logger {
  child(fields: LogFields): Logger;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export function createLogger(opts: {
  level?: LogLevel;
  service?: string;
  sink?: (line: string) => void;
  now?: () => number;
  base?: LogFields;
}): Logger {
  const level = opts.level ?? "info";
  const sink = opts.sink ?? ((line) => process.stdout.write(line + "\n"));
  const now = opts.now ?? Date.now;
  const base = opts.base ?? {};
  const service = opts.service ?? "nexus-api";

  const emit = (lvl: LogLevel, msg: string, fields?: LogFields): void => {
    if (LEVEL_RANK[lvl] < LEVEL_RANK[level]) return;
    const record = {
      ts: new Date(now()).toISOString(),
      level: lvl,
      service,
      msg,
      ...(redact({ ...base, ...fields }) as Record<string, unknown>),
    };
    sink(JSON.stringify(record));
  };

  return {
    child: (fields) => createLogger({ ...opts, base: { ...base, ...fields } }),
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
  };
}
