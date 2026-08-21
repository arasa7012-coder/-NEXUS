# Running NEXUS on your iPhone

**Nothing below has been executed.** No Expo bundle has ever been built in the
development environment, so this is the procedure to follow, not a report of a
successful run. Expect the dependency step to make corrections.

---

## Before anything else

```bash
cd nexus-v1
pnpm install

cd apps/mobile
npx expo install --check     # reports version mismatches
npx expo install --fix       # applies Expo's answers — its answers win
npx expo-doctor
```

If `expo-doctor` reports issues, fix them before continuing. A bundling failure
after a dependency mismatch is much harder to read than the mismatch itself.

---

## The one thing that will bite you: `apiBaseUrl`

`apps/mobile/app.json` currently contains:

```json
"extra": { "apiBaseUrl": "https://api.nexus.local" }
```

**Your iPhone cannot reach `localhost`** — on a phone, `localhost` is the phone.
The app will show *"No connection to NEXUS"* until this points at an address
your phone can actually route to.

Find your computer's LAN address yourself — I cannot know it:

```bash
# macOS
ipconfig getifaddr en0            # Wi-Fi
ipconfig getifaddr en1            # Ethernet, if en0 is empty

# Linux
hostname -I | awk '{print $1}'
```

It will look like `192.168.x.x` or `10.x.x.x`. Then set:

```json
"extra": { "apiBaseUrl": "http://192.168.1.42:3000" }
```

using **your** address, not that one. Restart Metro after changing `app.json` —
`extra` is read at bundle time, not at runtime.

---

## Start the backend

The API must bind to all interfaces, not just loopback, or your phone cannot
reach it even on the same Wi-Fi:

```bash
cp .env.example .env      # set DATABASE_URL, JWT_SECRET (≥32 bytes), NEXUS_NODE_ID
pnpm api:migrate
pnpm api:dev
```

Confirm from your **computer** first:

```bash
curl http://localhost:3000/health
```

Then confirm from your **phone's** perspective — open Safari on the iPhone and
visit `http://<your-ip>:3000/health`. If that does not return JSON, the app
will not connect either, and the problem is your network, not NEXUS.

Common causes: the macOS firewall blocking incoming connections (System
Settings → Network → Firewall → Options → allow `node`), or the Wi-Fi network
having client isolation enabled (common on guest and corporate networks) — in
which case use the tunnel below.

---

## Option A — LAN (preferred)

Both devices on the same Wi-Fi.

```bash
cd apps/mobile
npx expo start
```

On your iPhone:

1. Install **Expo Go** from the App Store.
2. Open the **Camera** app and point it at the QR code in your terminal.
3. Tap the notification banner that appears.

Expo Go opens and bundles the app. First bundle takes a while; subsequent
reloads are fast.

---

## Option B — Tunnel (when LAN fails)

Use this if the QR code opens but never finishes bundling, or if your phone and
computer cannot see each other (guest Wi-Fi, client isolation, VPN).

```bash
cd apps/mobile
npx expo start --tunnel
```

The first run installs `@expo/ngrok`. This routes Metro through a public
tunnel, so bundling works from anywhere.

**Important caveat:** the tunnel carries *Metro*, not your API. `apiBaseUrl`
still has to be reachable from the phone. Over a tunnel that usually means
exposing the API too:

```bash
npx ngrok http 3000
```

then set `apiBaseUrl` to the `https://….ngrok-free.app` URL it prints, and
restart Metro.

---

## What you should see

1. **NEXUS wordmark and a Login screen.** Not a template, not a blank screen.
2. Sign in with a user you have seeded in the database.
3. **Command Center** — system state, alerts, risk, monitoring, providers, and
   a small connection dot that turns green when the SSE stream connects.
4. Bottom tabs: **Command · Intelligence · Risk · Monitoring · Alerts**.
5. **Monitoring → + New** opens the monitor editor; create one, watch it appear,
   toggle it off and on, delete it.

If the API is unreachable you will see **"No connection to NEXUS"** with a
retry button — never fabricated numbers. That is the intended behaviour, and
seeing it means the honesty rules are working, not that the app is broken.

---

## If the app launches but shows no data

Check in this order:

1. `curl http://<your-ip>:3000/health` **from the phone's Safari** — network.
2. The connection dot on Command Center — grey/red means SSE is not connected.
3. Metro's terminal output — a red screen usually names the failing module.
4. `apiBaseUrl` in `app.json` — the most common cause, and it needs a Metro
   restart after any change.
