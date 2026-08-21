# Development

## Verification

```bash
node --experimental-strip-types tools/verify-all.ts
```

Runs 8 suites with **zero installed dependencies**, using Node 22's native
TypeScript stripping. `--conditions=nexus-source` resolves `@nexus/*` to source
rather than `dist/`, so the same `package.json` serves both an uncompiled run
today and a real `tsc --build` later.

| Suite | Covers |
|---|---|
| `core` | intelligence engine, risk calculations, identity, sentiment |
| `contracts` | structural validation, alert ordering, unavailability |
| `design` | WCAG contrast, perceptual ΔE, token coverage |
| `api-domain` | alerts, dedupe, providers, breaker, monitor scheduling |
| `api-edge` | JWT, passwords, sessions, HTTP, rate limits, real socket |
| `hardening` | SSE leaks, log redaction, error leakage, lifecycle, migration |
| `mobile` | API client: status mapping, retries, validation, auth |
| `end-to-end` | full stack over TCP: login → data → SSE → state → logout |

## Adding a test

Harnesses are plain TypeScript with a local `ok()` helper — no framework, so
they run anywhere Node does. Add assertions to the suite that owns the
behaviour; add a new suite only for a new package, and register it in
`tools/verify-all.ts`.

## Rules that keep the architecture intact

- **`packages/core` and `packages/contracts` may not gain dependencies.** They
  run on Hermes as well as Node; a Node builtin import breaks the app.
- **`apps/mobile` may not import `@nexus/core`.** Enforced by the absence of a
  project reference. The app must not be able to compute risk locally.
- **The domain may not import an adapter.** Depend on the repository interface;
  concrete adapters are selected only in `apps/api/src/app.ts`.
- **A new repository adapter must pass the contract suite** in
  `apps/api/src/testing/repositoryContract.ts` before it is trusted.
- **Never widen a domain contract to accommodate an adapter.** If Drizzle
  behaves differently from the in-memory reference, the adapter is wrong.

## Entrypoints

These are intentionally not imported by anything: `apps/api/src/server.ts`,
`apps/api/scripts/migrate.ts`, `apps/mobile/App.tsx`, and
`apps/mobile/src/api/push.ts` (called from a settings action once push is
enabled on a device).
