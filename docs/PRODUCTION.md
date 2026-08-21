# NEXUS — production configuration

## Required environment (API)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | **≥ 32 bytes.** Startup fails otherwise — a short HMAC secret is brute-forceable offline |
| `NEXUS_NODE_ID` | **Unique per running process**, 1–4 Crockford base32 chars. `IdSequence` uniqueness depends on it; two instances sharing a node id can mint colliding ids |
| `PORT` | Defaults to 3000 |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Default `nexus` / `nexus-mobile` |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |

Provider keys (`TWELVE_DATA_API_KEY`, `ALCHEMY_API_KEY`, …) are **server-side only**. The mobile app holds no provider credential of any kind; it talks only to NEXUS.

## Before first deployment

1. **Apply migrations** — `pnpm --filter @nexus/api migrate`. Never `drizzle-kit push` against production: the migration is hand-written with justified indexes, and generating from schema loses the reasoning.
2. **Run the repository contract suite against the Drizzle adapters.** This is the step that proves the production persistence path. Until it has run, the adapters are unproven.
3. **Set `NEXUS_NODE_ID` per instance.** Sharing one across replicas is an id-collision bug that will not surface until it corrupts ordering.
4. **Terminate TLS in front of the API.** `Strict-Transport-Security` is set, but the API itself speaks HTTP.
5. ~~Provide a durable `SafetyStateRepository`.~~ **Done** — `DrizzleSafetyStateRepository` is wired in `server.ts` (unverified: no database here). Requires migration 0002. Emergency Stop is now persistent and fails closed, with `emergency_stops` and `emergency_stop_audit` in migration 0002. `server.ts` still wires the in-memory repository — replace it with a Drizzle adapter before deployment, or a restart will clear an active stop.
6. **Apply migration 0002** alongside 0001. It makes `monitors.user_id` NOT NULL, so any pre-existing rows without an owner must be assigned or removed first.

## Scaling notes

- **Rate limiting is replica-safe, but needs a backend.** `RateLimiter` is now an interface with two implementations. `InMemoryRateLimiter` (token bucket) is for a single process; `SharedStoreRateLimiter` (fixed window) is for production and needs a `CounterStore` — one atomic increment-with-expiry, which Redis, Valkey, DynamoDB, Cloudflare KV or a SQL table all provide. `server.ts` now wires `SharedStoreRateLimiter` over `SqlCounterStore`, using the SQL database already present rather than introducing Redis — the limiter needs one atomic increment-with-expiry, which `INSERT … ON DUPLICATE KEY UPDATE` provides. `CounterStore` remains the seam if counter volume ever outgrows SQL. **Verified against an in-process store shared by three logical instances; NOT verified against a real external store.**
- **The event bus is in-process.** `RealtimeHub` only sees events published on its own instance, so a client connected to instance A will miss events raised on instance B. `EventPublisher` is the seam for a queue-backed implementation.
- **Monitor claims are already distributed-safe** — `claim()` is a conditional UPDATE, so two instances cannot run the same check.

## Observability

Logs are one JSON object per line. Every line carries `requestId`; authenticated lines carry `userId`. Sensitive keys (`password`, `token`, `authorization`, `apiKey`, `secret`, …) are redacted **at the logger**, not at call sites — discipline fails eventually, central redaction does not.

Endpoints: `/health` is liveness only (never touches dependencies, so a provider outage cannot cause an orchestrator restart loop). `/health/ready` checks the database and reports provider health; failing providers do **not** make the API unready, because NEXUS is designed to report UNAVAILABLE rather than stop serving.
