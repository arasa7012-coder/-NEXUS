# NEXUS

Trading intelligence platform: an Expo iOS/Android application, an independent
API, and a deterministic intelligence and risk core with zero dependencies.

```
apps/mobile      Expo / React Native
apps/api         HTTP API, domain services, SSE realtime
packages/core    deterministic intelligence + risk  (0 deps)
packages/contracts  wire contracts + validation      (0 deps)
packages/design  design tokens                       (0 deps)
```

## Verify — works today, no install required

```bash
node --experimental-strip-types tools/verify-all.ts
```

447 assertions, 0 failures. Needs Node ≥ 22.6.

## Build

See [BUILD-COMMANDS.md](./BUILD-COMMANDS.md). Nothing in it has been executed —
no dependency has ever been installed in the development environment, so
TypeScript compilation, Expo bundling, and the database migration are all
unverified. Start with `npx expo install --check`.

## Docs

- [Architecture](./docs/ARCHITECTURE.md) — layering, realtime, intelligence, risk, alerts
- [Production](./docs/PRODUCTION.md) — required configuration and scaling limits

## Principles

1. **Never fabricate.** Missing data surfaces as `UNAVAILABLE` with an attributed
   reason. There is no fallback path that substitutes a value.
2. **Every score is explainable.** Factors, weights, coverage, and provider
   attribution travel with the number.
3. **Identity is deterministic.** Content-addressed dedupe keys and monotonic
   ids — randomness is never used as identity.
4. **The backend is authoritative.** The app displays state; it never runs
   monitoring, holds a provider credential, or computes risk.
