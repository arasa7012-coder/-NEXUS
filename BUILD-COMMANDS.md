# NEXUS — build and operations

**Nothing in sections 2–9 has been executed.** No dependency has been installed, no TypeScript compiled, no database reached, no bundle built. Section 1 is the only part verified in the development environment.

---

## 1. Verification — VERIFIED, runs today with no install

```bash
node --experimental-strip-types tools/verify-all.ts
```

Expected: **447 assertions, 0 failures** across 8 suites (core, contracts, design, api-domain, api-edge, hardening, mobile, end-to-end).

Individual suites:
```bash
pnpm --filter @nexus/core     verify
pnpm --filter @nexus/contracts verify
pnpm --filter @nexus/design    verify
pnpm --filter @nexus/api       verify        # domain
pnpm --filter @nexus/api       verify:edge   # HTTP, auth, real socket
pnpm --filter @nexus/api       verify:e2e    # full stack + SSE
```

Requires Node ≥ 22.6 (`--experimental-strip-types`). `--conditions=nexus-source` resolves `@nexus/*` to TypeScript source and is already set in each package script.

---

## 2. Install

```bash
pnpm install
```

---

## 3. Expo dependency reconciliation — DO THIS BEFORE ANYTHING ELSE

The versions below were chosen to match the documented Expo SDK 52 pairings but were **never resolved against a registry**. This step is authoritative; expect corrections.

```bash
cd apps/mobile
npx expo install --check     # reports mismatches, changes nothing
npx expo install --fix       # applies Expo's pinned versions
npx expo-doctor              # config + native consistency
```

### Expected compatibility set (UNVERIFIED)

| Package | Pinned | Rationale |
|---|---|---|
| `expo` | `~52.0.0` | SDK baseline |
| `react-native` | `0.76.5` | RN paired with SDK 52 |
| `react` | `18.3.1` | Required by RN 0.76 |
| `@react-navigation/*` | `^7.0.0` | v7 requires RN ≥ 0.72 |
| `react-native-screens` | `~4.4.0` | Required by navigation v7 |
| `react-native-safe-area-context` | `4.12.0` | SDK 52 pairing |
| `expo-secure-store` | `~14.0.0` | Keychain-backed token storage |
| `expo-notifications` | `~0.29.0` | Push |
| `expo-status-bar` | `~2.0.0` | SDK 52 pairing |
| `expo-constants` | `~17.0.0` | Reads `expo.extra.apiBaseUrl` |
| `expo-device` | `~7.0.0` | Push requires a physical-device check |
| `typescript` | `5.9.3` | `rewriteRelativeImportExtensions` needs ≥ 5.7 |

If `expo install --fix` changes any of these, **its answer wins** — do not restore the table.

---

## 4. Type checking

Partially verified. With TypeScript 6.0.3, the three zero-dependency packages
**compile clean today** and the API type-checks clean against a local
`@types/node`:

```bash
pnpm run check:packages   # PASSES — core, contracts, design
pnpm run check:api        # PASSES — API sources, excluding Drizzle adapters
```

Still unverified, because their type definitions cannot be installed here:

- `apps/mobile` — needs `@types/react` and `react-native`
- `apps/api/src/adapters/drizzle/**` and `src/server.ts` — need `drizzle-orm`, `mysql2`

The full graph has never run. **Expect errors on first execution**, concentrated
in the mobile app and the Drizzle adapters:

```bash
pnpm exec tsc --build --verbose      # from repo root
pnpm exec tsc --build --clean        # if references get stale
```

Build order follows the references: contracts → core → design → api → mobile.
Verification harnesses are deliberately outside the build graph
(`tsconfig.harness.json` per package): they use Node globals, while the
shippable libraries must stay free of any host environment so they load on
Hermes.

---

## 5. Database

```bash
mysql -u root -p -e "CREATE DATABASE nexus CHARACTER SET utf8mb4;"
export DATABASE_URL='mysql://user:pass@localhost:3306/nexus'
pnpm --filter @nexus/api migrate
```

The runner applies numbered files from `apps/api/migrations/` in order and records each in `schema_migrations`, so re-running is safe. Note MySQL DDL is not transactional: a mid-file failure needs manual inspection, and the recorded state makes that visible.

**Then prove the production persistence path** — point the repository contract suite at the Drizzle adapters. Until `runAlertRepositoryContract` and `runSessionRepositoryContract` pass against a real database, the adapters are unproven.

---

## 6. Run the API

```bash
cp .env.example .env       # set DATABASE_URL, JWT_SECRET (≥32 bytes), NEXUS_NODE_ID
pnpm api:dev               # node --watch, strip-types
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

Production: `pnpm --filter @nexus/api build && pnpm --filter @nexus/api start`.

---

## 7. Run the app

**For an iPhone, follow [docs/IPHONE.md](./docs/IPHONE.md)** — it covers LAN vs
tunnel, the firewall and client-isolation traps, and the `apiBaseUrl` change
that is the single most common cause of an app that launches but shows nothing.

Set `expo.extra.apiBaseUrl` in `apps/mobile/app.json` to a host the device can reach — `localhost` will not resolve from a physical device.

```bash
cd apps/mobile
npx expo start                 # Metro, Expo Go / dev client
npx expo run:ios               # native iOS build + run
npx expo run:android           # native Android build + run
```

---

## 8. Preview and production builds

```bash
npm install -g eas-cli && eas login
eas build:configure

eas build --platform ios     --profile preview
eas build --platform android --profile preview

eas build --platform ios     --profile production
eas build --platform android --profile production
eas submit --platform ios
```

Bundle identifiers: `com.nexus.app` (both platforms) — change before any real submission.

---

## 9. Runtime smoke test

1. Sign in — invalid credentials show one message for both unknown account and wrong password.
2. Command Center renders; the connection dot goes green.
3. Raise an alert on the backend → it arrives over SSE with **no refresh**.
4. Raise the *same* condition three more times → occurrences shows ×4, still one row.
5. Acknowledge it → status updates.
6. Stop the API → the pill shows Reconnecting, then Offline; screens keep last-known data behind a stale bar.
7. Restart the API → reconnect, and events raised while offline replay.
8. Sign out → the session is rejected and the SSE stream closes.
