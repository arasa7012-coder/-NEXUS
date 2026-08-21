# NEXUS — Build Report (Phases 1–7)

Every claim below is one of: **VERIFIED** (executed in this session), **IMPLEMENTED, UNVERIFIED** (written, structurally correct, not executable here), or **NOT BUILT**.

---

## Verification summary — VERIFIED

```
$ node --experimental-strip-types tools/verify-all.ts

  ok    core       22 assertions
  ok    contracts  26 assertions
  ok    design     28 assertions
  ok    api        65 assertions
  ok    mobile     26 assertions
  ----------------------------------
  167 assertions, 0 failures
```

Runs with **zero installed dependencies**, using Node 22's native TypeScript stripping. Reproduce with `node --experimental-strip-types tools/verify-all.ts` from the repository root.

---

## Structure

```
nexus/
├── packages/
│   ├── core/        @nexus/core       intelligence, risk, identity — 0 deps
│   ├── contracts/   @nexus/contracts  wire types + validation — 0 deps
│   └── design/      @nexus/design     design tokens — 0 deps
├── apps/
│   ├── api/         domain services, ports, event bus, adapters
│   └── mobile/      Expo application
└── tools/verify-all.ts
```

`packages/design` was added because the token set is consumed by every screen and is *testable* (contrast, ΔE separation, scale integrity). It earns a package; nothing else did.

The dependency direction is enforced by construction: `core` imports nothing, `contracts` imports nothing, `design` imports only contract *types*, `api` imports core and contracts, `mobile` imports contracts and design. The mobile app never imports `core` — it cannot re-implement risk, so it cannot drift from the backend.

---

## Phase 2 — packages/core — VERIFIED

Beyond the Phase 0 extraction:

- **`risk/safety.ts` ported.** The pure Emergency Stop transitions were separated from their database calls and now live in core; persistence moved behind `SafetyStateRepository` in the API. Risk is now 12/12 dependency-free.
- **`identity/id.ts` added** — the fix for the `Math.random()` defect (below).
- **`analysis/sentiment.ts` added** — the honest replacement for `aiAnalysis.ts` (below).

The intelligence layer itself was **not rewritten**. `ExplainableScore`, evidence, coverage, `limitingFactor`, `UNAVAILABLE` states and attributed reasons are carried forward exactly as audited, and the 22 assertions specifically pin that behaviour so a future refactor cannot quietly erode it.

---

## The three named defects

### 1. Alert identity — FIXED, VERIFIED

`Math.random()` is gone. Two deterministic strategies replace it:

**`dedupeKey(...)`** — content-addressed identity of a *condition*. `fingerprint64` over producer, rule, entity, and an optional time bucket. The same condition observed twice yields the same key on any node, in any process, forever.

The consequence is behavioural, not cosmetic. A monitor evaluating every 30 seconds no longer produces an alert per evaluation: repeats fold into one record with an `occurrences` counter. Verified — three raises produce one alert with `occurrences: 3` and a stable id.

**`IdSequence`** — monotonic, time-ordered record ids (`<timestamp><counter><node>`), lexicographically sortable so a database index on id is also an index on creation order. Uniqueness comes from the (time, counter, node) triple, not entropy. The clock is injected; a backwards clock throws `CLOCK_REGRESSION` rather than silently corrupting ordering.

Also verified: escalating repeats raise severity in place; a repeat never *downgrades* an existing warning; a resolved condition that returns opens a genuinely new alert.

### 2. aiAnalysis.ts — RECLASSIFIED, VERIFIED

Nothing here claims to be AI, because nothing here is. `analyzeSentimentHeuristic` carries `method: "DETERMINISTIC_KEYWORD"` in its result, so the UI labels it truthfully without guessing.

Three improvements over the legacy version:
- matched terms are returned as evidence, so the score is inspectable;
- coverage is reported, so "no headline contained a known term" is distinguishable from "terms balanced to neutral" — the legacy version collapsed both to `0`;
- an unmeasurable result is `score: null` with a reason, not a fabricated zero.

The `SentimentMethod` union already includes `"MODEL"`. Introducing a real provider means implementing the port in the API and returning `method: "MODEL"` — no contract, screen, or caller changes.

### 3. wouter — REMOVED, with evidence

**VERIFIED** by import analysis: 14 files import wouter, and every import is routing — `Link` (6), `useLocation` (5), `useRoute` (1), `Switch` (1), `Route` (1). No other API surface is touched.

React Navigation replaces all five in the native app. wouter is therefore genuinely obsolete rather than inconvenient, and it is absent from the new tree along with its patch entry — which resolves the `pnpm install --frozen-lockfile` failure by removing the cause instead of suppressing the symptom.

The same reasoning retires the rest of the web-only surface: Radix, sonner, vaul, cmdk, recharts, framer-motion, Tailwind, Vite. None is carried into `apps/mobile`.

---

## Phase 3 — packages/contracts — VERIFIED

Contracts for alerts, events, monitoring, intelligence, risk, entities, provider status, the Command Center payload, and errors.

**Zod is the right long-term choice at the API edge and is not installable here.** Rather than ship an unexecutable contract layer, `validate.ts` provides ~150 lines of dependency-free combinators shaped deliberately like Zod (`.parse` / `.safeParse`, path-bearing issues). Swapping in Zod later is a change confined to that one file.

What the 26 assertions actually pin:

- an alert with an empty `explanation` is **rejected** — an alert that cannot explain itself is noise;
- epoch **seconds** are rejected where milliseconds are required, catching the classic silent 1000× error;
- `parse()` reports *every* failing field at once, with paths;
- the §12 ordering — unread → severity → priority → newest — holds at each precedence level and under a full sort;
- unavailability is representable end to end: a score may be `null` with a stated reason; a risk view may decline to assign a level.

`compareAlerts` lives in contracts, not in the app, so the list, the badge count, and the notification tray cannot disagree about what "most important" means.

---

## Phase 4 — apps/api — domain layer VERIFIED, HTTP edge NOT BUILT

**Event bus** (§11) — in-process, typed to the twelve `EventType` values, with a ring buffer feeding the Command Center's activity feed. `EventPublisher` is the seam for a queue-backed implementation later. Verified: a subscriber that throws neither unwinds the publisher nor prevents later subscribers from running — an alert-fanout bug must never roll back the risk calculation that triggered it.

**Alert service** — de-duplication, lifecycle, event emission, as above.

**Provider registry** (§7) — adapter interface plus health tracking and a circuit breaker. The load-bearing property, verified five ways: **a provider failure never becomes invented data.** Unconfigured, unknown, failed, and cooling-down providers all return `data: null` with an `UNAVAILABLE` origin and an attributed reason. There is no code path that substitutes a cached value while claiming freshness. Verified: the breaker opens after three consecutive failures, emits `PROVIDER_ERROR` exactly once, refuses calls during cooldown, then admits one trial call and recovers.

**Monitor runner** (§10) — backend-authoritative scheduling with an injected clock. Verified: exponential backoff (30s → cap 30m); a throwing monitor is isolated and the cycle continues; a monitor claimed by another worker is skipped rather than run twice; overlapping cycles do not double-run; a monitor failing ten times is stopped rather than retried forever.

**In-memory adapters** implement every port, making the domain executable today and serving as the reference the Drizzle adapters must match.

**NOT BUILT:** Express/tRPC wiring, JWT verification, Drizzle adapters, rate limiting, the OpenAPI surface. These need installed dependencies and a database. The ports they plug into are defined and tested.

---

## Phases 6–7 — design system and mobile app

### Design tokens — VERIFIED

Dark-first, single cyan accent, 4pt grid, monospace for all numerics so digits align and a changing price does not make the row jitter.

The 28 assertions include a finding worth stating plainly: **the first version of the contrast test was wrong, and fixing it improved the system.** It compared severity colours by WCAG luminance ratio, which scored blue-vs-red at 1.09 and implied INFO and CRITICAL were indistinguishable — luminance cannot measure hue difference. The test now uses CIE76 ΔE (perceptual distance), and separately asserts the requirement that actually matters: **severity is never signalled by colour alone.** Every severity carries a unique glyph and a word, because deuteranopia makes amber and red converge precisely where being wrong is most expensive.

### Mobile app — IMPLEMENTED, UNVERIFIED (except the client)

**VERIFIED — `src/api/client.ts`.** Written free of React and of any HTTP library, with `fetch`, the token store, and `sleep` injected, so the paths that only execute when something has already gone wrong are testable. 26 assertions cover status→`ErrorCode` mapping, bounded backoff, retry policy, auth handling, and non-JSON gateway error bodies.

This is where a real defect in my own code surfaced: **a 503 was never retried**, because `PROVIDER_UNAVAILABLE` was missing from `isRetryable`. A gateway blip would have reached the user as a hard failure with no second attempt. Fixed in the contract, where the policy belongs.

Also verified: a server that breaks its own contract produces a typed `VALIDATION` error naming the offending field paths, rather than a render crash three components deep; and user-facing messages never leak transport detail.

**IMPLEMENTED, UNVERIFIED** — `App.tsx`, navigation (native stack + five bottom tabs), `primitives.tsx`, `CommandCenter.tsx`, `useCommandCenter.ts`, `session.ts`.

Design notes worth flagging:
- `Metric` takes `value: string | null`. The signature makes "unavailable" unavoidable at the call site rather than something a developer remembers to handle. Null renders as an em-dash with its reason — never as `0`.
- `useCommandCenter` returns data **and** error simultaneously on a failed refresh. Blanking the screen hides information the user still has; showing old data as current violates §19. It keeps the data and renders it behind an explicit stale notice.
- Five tabs, and no more. Entities, global search, and settings are reached contextually, which is what stops primary navigation growing with every future module.
- The unbuilt tabs say `NOT IMPLEMENTED` rather than showing a convincing dashboard of invented numbers.

**Secrets:** the app holds none. No provider key, no webhook secret. It talks only to NEXUS; the access token lives in the platform keychain via `expo-secure-store`, never AsyncStorage.

---

## What is explicitly NOT verified

1. **Nothing has been type-checked.** `tsc` is not installable. The 167 assertions prove runtime behaviour, not type soundness.
2. **No React Native code has been bundled or rendered.** Expo, React Native, and React Navigation cannot be installed here. Every UI file is marked at the top.
3. **Dependency versions in `apps/mobile/package.json` are UNVERIFIED.** They follow the documented Expo SDK 52 pairings and were not resolved against a registry. Run `npx expo install --check` before trusting them. They are marked in the file itself.
4. **No database work.** No migrations, no Drizzle adapters, no query verified.
5. **No build, and therefore no production-readiness verdict.**

---

## Next, in order

1. On a networked machine: `pnpm install`, `tsc --build`, `npx expo install --check`, then `expo run:ios`. Expect version corrections at step three.
2. Drizzle adapters for `AlertRepository`, `MonitorRepository`, `SafetyStateRepository` — behaviour asserted against the in-memory reference.
3. tRPC edge over the existing domain services, with JWT verification and rate limiting.
4. Port the market and on-chain provider adapters onto the `DataProvider` interface.
5. Remaining screens; realtime channel (Phase 12) and push notifications (Phase 13), both of which the event bus is already shaped for.

The intelligence and risk core carried forward from the legacy system is intact and, for the first time, executable in isolation.
