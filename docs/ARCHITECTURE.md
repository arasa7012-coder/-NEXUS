# NEXUS Architecture

## Dependency direction

```
apps/mobile          Expo / React Native
      │  contracts + design tokens only
      ▼
apps/api             HTTP edge (node:http) — thin: auth, validation, errors
      ▼
  domain services    alerts · risk · intelligence · monitoring · entities
      ▼
packages/core        deterministic intelligence + risk — ZERO dependencies
      ▼
  repository ports   interfaces only
      ▼
  adapters           in-memory (reference) · Drizzle/MySQL (production)
```

Enforced by construction, not convention:

- `packages/core` and `packages/contracts` import **nothing**. Verified by a static sweep.
- `packages/design` imports contract *types* only.
- `apps/mobile` never imports `@nexus/core`. It cannot re-implement risk, so it cannot drift from the backend.
- `apps/api` depends on repository **interfaces**; concrete adapters are chosen in exactly one file, `src/app.ts`.
- `tsconfig` enforces the split: the API has `"types": ["node"]`, mobile has `"types": ["react", "react-native"]`, packages have `"types": []`. Importing a Node builtin into the app bundle is a build error, not a crash on device.

## Why the core is separate

The deterministic intelligence and risk logic was extracted from the legacy codebase and has zero runtime dependencies, so the identical module runs on Node and on Hermes. Intelligence and risk therefore cannot disagree between server and device — the drift that makes a trading tool untrustworthy is structurally impossible rather than merely discouraged.

## Realtime

Server-Sent Events, not WebSocket. NEXUS realtime is one-directional: the backend pushes, the client sends commands over ordinary HTTP. For that shape SSE runs over plain HTTP/1.1 with no upgrade handshake, survives proxies that mangle upgrades, reconnects natively with `Last-Event-ID`, and needs no dependency.

`RealtimeHub` is a **subscriber** to the domain event bus. Nothing publishes to it directly, which is what guarantees every frame corresponds to a real domain event rather than something synthesised for the UI.

Reconnection: the client sends the last id it saw; the server replays from a bounded buffer (200 events). An unknown id replays *nothing* — a partial history from a truncated buffer would mislead. Replay windows overlap by design, so the client suppresses ids it has already applied.

Memory: connections are indexed per user and capped (5/user, 10k total); a per-user overflow evicts that user's oldest stream rather than refusing the newest. Sockets that throw on write are dropped on both broadcast and heartbeat, and the per-user index is pruned with them.

WebSocket remains correct if NEXUS later needs client→server streaming; `RealtimeHub` is transport-agnostic, so that swap does not reach the event bus or the domain.

## Intelligence

Deterministic. Given the same candles it produces the same verdict, every time. Every result carries:

- **evidence** — the observations behind the verdict
- **coverage** — how much of the factor weight was actually backed by data
- **origin** — which provider, its own timestamp, and freshness
- **UNAVAILABLE with an attributed reason** when data is missing

There is no fallback path anywhere: a provider failure yields `data: null` with an `UNAVAILABLE` origin, never a substituted or interpolated value. `analyzeSentimentHeuristic` reports `method: "DETERMINISTIC_KEYWORD"` — nothing in NEXUS claims to be AI, because nothing in NEXUS is. The `"MODEL"` branch exists for a real provider later; introducing one changes no contract, screen, or caller.

## Risk

`ExplainableScore` is the whole design: a score, its contributing factors with point weights, its coverage, and — when it cannot be computed — `value: null` with a reason. A bare number is an assertion the user cannot check.

Data quality gates the engine. `RiskDataQuality` of `UNAVAILABLE` or `ERROR` returns `level: null` and still attributes a factor explaining why. Incomplete evidence (missing ATR, signal strength, or drawdown) does the same. The engine declines to score rather than guessing.

Factors are persisted verbatim in `risk_evaluations`, so a historical score stays explainable with the evidence available *at the time* — never re-derived from today's data.

## Monitors

A monitor is a user-owned definition the backend executes on a schedule:

```
definition → scheduler → distributed claim → Emergency Stop check
          → provider → intelligence/risk → alert → event → SSE → mobile
```

Only two types exist — `ASSET_INTELLIGENCE` and `PROVIDER_HEALTH` — because
those are the two a runner can actually execute. Wallet and address monitoring
are meaningful ideas the entity model already supports, but exposing them
before a runner exists would be a promise the backend cannot keep.

Configuration is a **closed shape per type**, never free-form. A monitor is a
user-supplied instruction executed server-side on a timer, which is the classic
remote-execution surface. Targets resolve against the entity registry and
providers against the live registry; nothing user-supplied is used to build a
URL, a path, or an expression.

**Ownership is enforced in the domain, not the HTTP layer.** Every service
method takes a `userId` and scopes the query itself, so a route that forgot to
check could not leak another user's monitors. Cross-user access returns
`NOT_FOUND`, never `FORBIDDEN` — distinguishing the two confirms an id exists
and is an enumeration oracle.

`enabled` (user intent) is deliberately separate from `state` (engine status).
A disabled monitor is `PAUSED`; a monitor the engine gave up on is `STOPPED`
while still enabled. Collapsing them would make "why did this stop?"
unanswerable.

### Two independent schedules

**Execution interval** governs normal operation. **Retry backoff** governs
recovery after failure, growing 30s → 30m. `nextRunAt` takes the maximum, so
`backoff < interval` is normal and correct: a 5-minute monitor that fails once
waits its usual 5 minutes. Backoff exists to slow a persistently failing
monitor, not to accelerate a healthy one.

Neither is coupled to alert de-duplication — see below.

## Emergency Stop

Persistent and authoritative, consulted fresh before **every** monitor run.
Never cached, because a cache is exactly what a restart clears.

An unreadable store **fails closed**: `isEmergencyStopActive` returns `true`.
Treating an infrastructure outage as "no stop configured" would silently
re-enable a system an operator had deliberately halted.

Current state and audit trail live in separate tables. The audit is append-only
with an actor taken from the authenticated principal, never from a client
field — an audit trail an attacker can forge is worse than none.

## Alerts

Identity is content-addressed, never random. `dedupeKey` fingerprints producer + rule + entity + optional time bucket, so the same condition observed twice yields the same key on any node, in any process.

**Identity is the condition, never the clock.** An earlier version of the
monitor executor set the collapse window to the monitor's execution interval,
which coupled two unrelated concepts and destroyed de-duplication entirely:
every run landed in a fresh time bucket, minting a new key and a new alert.
Identity is `(producer, rule, entity)` with **no time component**. Time
bucketing remains available in `@nexus/core` for aggregation, but never as the
identity of an active condition.

Each trigger dimension raises under its own rule, so a risk breach and a signal
breach are separate findings rather than one row whose meaning depends on which
half fired. Severity is *not* part of identity, so escalation updates in place.

Consequences:
- a monitor firing every 60s while a condition persists for four hours produces
  **one** alert with 241 occurrences and exactly one `ALERT_CREATED` event
- an escalating repeat raises severity **in place**; a repeat never downgrades an existing warning
- a **resolved** condition that returns opens a genuinely new alert — that is new information
- exactly one `ALERT_CREATED` event per real alert, so notifications cannot spam

Record ids come from `IdSequence`: `<timestamp><counter><node>`, lexicographically sortable, so a primary key index is also a chronological index. A backwards clock throws rather than corrupting ordering.

## Verification

```bash
node --experimental-strip-types tools/verify-all.ts
```

447 assertions, zero installed dependencies, using Node 22's native type stripping. `--conditions=nexus-source` resolves `@nexus/*` to TypeScript source; the same `package.json` serves a real `tsc --build` via the `import`/`types` conditions.

The end-to-end suite runs a real server on a real socket: login → Command Center → intelligence → risk → search → alerts → live SSE event → mobile state update → logout.
