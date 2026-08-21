# NEXUS — Phase 0 Audit & Architecture Decision

Evidence tags: **VERIFIED** = executed or measured in this session · **DOCUMENTED** = read directly from source · **INFERRED** = reasoned, not proven.

---

## 0. Blocking constraint — read first

**VERIFIED.** Network egress is blocked at the proxy. `npm view expo` returns `403 Forbidden` from `registry.npmjs.org`. `pnpm` is not installed.

Consequences, stated plainly:

- Expo / React Native **cannot be installed** in this environment.
- The existing 89 direct dependencies **cannot be installed**.
- `pnpm install`, `pnpm check` (tsc), `pnpm test` (vitest), `pnpm build` (vite/esbuild) **cannot run**.

So "implementation" here cannot honestly mean "a compiling iOS/Android app." Writing several hundred React Native files that can never be built would reproduce exactly the failure mode you have guarded against before: volume without verification.

**What is verifiable without network:** Node 22 executes TypeScript natively via `--experimental-strip-types`. Any code with **zero runtime dependencies** can therefore be run and proven here. That defines the honest scope of this phase, and it happens to cover the most valuable part of the codebase.

---

## 1. Inventory

**VERIFIED** by measurement.

| Metric | Value |
|---|---|
| Files (excl. node_modules) | 427 |
| TypeScript / TSX lines | 35,802 |
| Test files | 93 |
| Database tables | 67 |
| Drizzle migrations | 22 |
| Server LOC | 17,723 |
| Client LOC | 16,902 |

Stack: React 19 + Vite + wouter + Tailwind + Radix (web client); Express + tRPC v11 + Drizzle + MySQL/TiDB (server); Zod v4; TanStack Query.

---

## 2. Snapshot identity — this is the pre-repair tree

**VERIFIED.** This archive is **not** the repaired build. Absent: `vitest.config.ts`, `.env.example`, `.gitignore`, `patches/`.

Present: `package.json` still declares `pnpm.patchedDependencies["wouter@3.7.1"] → patches/wouter@3.7.1.patch`, and that patch file does not exist in the archive.

Two consequences:

1. `pnpm install --frozen-lockfile` fails deterministically on the missing patch — before any other problem can even be reached. This is the first thing to fix on any machine with network.
2. Without `vitest.config.ts`, test discovery does not reach the majority of the 93 test files.

**Please confirm whether this is intentional.** If the earlier repairs should carry forward, they need to be re-applied to this tree; I have not assumed either way.

---

## 3. The decisive finding — the core is already portable

**VERIFIED** by static import analysis and by execution.

`server/intelligence/` (19 files, 2,658 LOC) imports **no external package whatsoever** — its only non-relative import is `shared/candleAnalysis`, which itself has **zero imports**.

`server/risk/` (2,198 LOC) is **11 of 12 files pure**. Only `safety.ts` (244 LOC) touches Drizzle and the database.

This is unusual and it is valuable. The deterministic heart of NEXUS is not entangled with Express, React, or the ORM. It can be lifted wholesale and shared by the backend and the mobile app, which means intelligence and risk can never disagree between server and device.

### Quality of that core (DOCUMENTED)

The intelligence layer already implements what sections 8, 19, 26 and 31 of the brief demand — it was not retrofitted:

- `MetricResult<T>` carries `status`, `value`, `sampleCount`, `reason` — degraded input yields `UNAVAILABLE` with an attributed reason, never a guess.
- `ExplainableScore` carries `factors`, `coveragePercent`, `unavailableReason` — every score can be traced to its contributions.
- `AnalysisMetadata` carries `source`, `providerUpdatedAt`, `TimestampOrigin`, `isStale`, `quality` — LIVE / CACHED / STALE / UNAVAILABLE is already modelled at the data layer.
- `calculateRiskLevel` returns `level: null, score: null` when data quality is `UNAVAILABLE` or `ERROR`, and still attributes a factor explaining why.
- `calculatePositionSize` returns `limitingFactor` naming the binding constraint (`RISK` / `CASH` / `TOTAL_EXPOSURE` / `ASSET_EXPOSURE` / `REQUESTED_QUANTITY`).

Per section 36, this must be preserved, not rewritten.

---

## 4. Data integrity

**VERIFIED** by grep across the tree.

Genuinely clean. One `Math.random` in the entire server — `_core/llm.ts:296`, jitter on retry backoff, which is correct usage.

Two real findings:

- `server/services/aiAnalysis.ts` — sentiment analysis is keyword counting over a six-word positive/negative list, explicitly self-labelled as a mock. Honestly labelled, but it must not reach production as "AI sentiment."
- `client/src/hooks/useAlerts.ts:39` — `id: Math.random()` used as an alert identifier. A genuine defect: collision-prone and non-stable across renders. Alert IDs must be server-issued.

---

## 5. Classification

### KEEP — lift unchanged
- `server/intelligence/**` — deterministic, explainable, dependency-free
- `server/risk/**` except `safety.ts` — pure calculation with typed error codes
- `shared/candleAnalysis.ts`
- Drizzle migration history (22 migrations, real constraint/index work)
- `server/market/providers/**` and `server/onchain/providers/**` — the adapter shape the brief asks for already exists

### REBUILD
- **Entire client** (16,902 LOC). wouter (12 sites), sonner (12), Radix, recharts, vaul, cmdk, framer-motion are DOM-bound. None survives into React Native. This is the rebuild surface, and it is the bulk of the work.
- **Monitoring** — `server/monitoring/` is 105 LOC of contracts only; `server/scheduled/` contains no TypeScript. Section 10 is effectively greenfield.
- **Event system** — no central event bus exists. Section 11 is greenfield.
- `server/services/marketData.ts` (866 LOC) and `simulationPortfolio.ts` (799 LOC) — beyond the size at which domain boundaries survive.

### MIGRATE — needs a port extracted first
- `risk/safety.ts` — pure logic wrapped around direct DB calls. Extract a repository interface, and it joins the core.
- tRPC routers — contracts are sound; they need regrouping by domain rather than rewriting.

### REMOVE
- `client/src/pages/ComponentShowcase.tsx` (1,437 LOC) — development artifact
- `vite-plugin-manus-runtime`, `client/public/__manus__/` — vendor tooling that must not ship
- Gen-1 tables superseded by the Nexus generation: `cryptocurrencies`, `candles`, `aiPredictions`, `portfolios`, `portfolioAssets`, `binanceApiKeys` (**INFERRED** — needs a usage sweep before any drop; no data will be dropped without your explicit authorization)

---

## 6. Architecture decision

Section 4 delegates the stack choice to the audit, so here it is.

**Expo (React Native) + a pnpm workspace monorepo.**

```
nexus/
├── packages/
│   ├── core/         @nexus/core      zero deps — intelligence + risk
│   └── contracts/    @nexus/contracts zod schemas + tRPC router types
├── apps/
│   ├── api/          Express + tRPC, restructured into domains
│   └── mobile/       Expo — iOS primary, Android secondary
```

Why Expo rather than the alternatives:

- **tRPC + Zod + TypeScript are already the stack.** React Native keeps end-to-end type safety across the wire; a Swift/Kotlin rewrite discards it and doubles every future feature.
- **The core is already portable** — proven below, not assumed. It runs identically on Node and Hermes.
- **A Capacitor/WebView wrapper is explicitly excluded** by section 2, and would not deliver native navigation, gestures, or background behaviour.
- Expo supplies push notifications, secure storage, and EAS builds without hand-rolled native plumbing.

Rejected: Flutter (abandons the TypeScript contract and the portable core), native twice over (two codebases, no shared risk engine — the exact drift section 9 warns about).

---

## 7. Delivered and verified in this phase

`packages/core/` — the deterministic core, extracted.

- 25 files lifted from `intelligence/`, `risk/`, and `candleAnalysis`
- **Zero external imports remain** (verified by static sweep)
- Three TypeScript *parameter properties* desugared to explicit field assignment in `calculations.ts`, `stops.ts`, `settings.ts`. Behaviour-identical; removes reliance on TypeScript-specific emit so the package runs on any plain-JS runtime.
- Relative imports given explicit `.ts` extensions for correct ESM resolution
- `safety.ts` deliberately **excluded** — it is DB-coupled and needs a repository port first

**`verify.ts` — 22 assertions, 22 passing**, executed with `node --experimental-strip-types`, no dependencies installed. It asserts the properties that matter most:

- degraded input does not report full quality
- provider error yields `ERROR` + `UNAVAILABLE` + `value: null` + an attributed reason
- position sizing is deterministic, capped by exposure, and respects the risk budget
- invalid equity and zero-distance stops are rejected with typed error codes, never silently sized
- risk level refuses to score on unavailable data and still explains why

Run it: `cd packages/core && node --experimental-strip-types verify.ts`

---

## 8. What is NOT claimed

- No React Native application exists yet. None can be built here.
- No `tsc` type-check has been run against the core. The 22 assertions prove runtime behaviour, not type soundness.
- The original 93 vitest test files have not been executed; vitest is not installable here.
- No production-readiness verdict. Nothing has compiled.

---

## 9. Next authorization checkpoint

Phase 1 needs your decision on three points before I write app code:

1. **Confirm Expo/React Native**, or name a different target.
2. **Repair state** — should the earlier repairs (vitest config, env assertions, AES-GCM, RouteGuard, wouter patch removal) be re-applied to this tree, or is this snapshot deliberate?
3. **Build environment** — either restore egress so the pipeline can be proven end-to-end, or accept that Phase 2 onward produces unverified source until it reaches a networked machine.

On (3) I would rather say this now than hand you 300 files and a verdict I cannot stand behind.
