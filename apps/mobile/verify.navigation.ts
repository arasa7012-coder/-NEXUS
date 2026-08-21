// Run: node --experimental-strip-types --conditions=nexus-source verify.navigation.ts
//
// Static reachability checks on the mobile app.
//
// This does NOT render anything — react-native cannot be installed here, so no
// screen has ever been mounted. What it does verify is the wiring that a
// render would depend on: that the entry point chain is intact, that every
// screen is reachable from navigation, that no placeholder remains on a
// primary route, and that no screen fabricates data.
//
// A green run here does NOT mean the app renders. It means the reachability
// defects that a render would expose are absent.
import { readFile, readdir } from "node:fs/promises";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
};

const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");

console.log("\n[1] Entry point chain");
const pkg = JSON.parse(await read("./package.json")) as { main: string; dependencies: Record<string, string> };
const indexJs = await read("./index.js");
const appTsx = await read("./App.tsx");

ok("package.json main points at the entry file", pkg.main === "index.js");
ok("the entry registers the root component", indexJs.includes("registerRootComponent"));
ok("the entry imports App", indexJs.includes('from "./App"'));
ok("App mounts a NavigationContainer", appTsx.includes("NavigationContainer"));
ok("App mounts the root navigator", appTsx.includes("RootNavigator"));
ok("App applies the NEXUS theme", appTsx.includes("nexusNavigationTheme"));
ok("App wraps in SafeAreaProvider — iPhone notch and home indicator",
  appTsx.includes("SafeAreaProvider"));

console.log("\n[2] Navigation reachability");
const nav = await read("./src/app/navigation.tsx");

for (const screen of ["CommandCenterScreen", "IntelligenceScreen", "RiskScreen", "MonitoringScreen", "AlertsScreen", "LoginScreen", "MonitorEditorScreen"]) {
  ok(`${screen} is imported by navigation`, nav.includes(screen));
}
for (const tab of ["Command", "Intelligence", "Risk", "Monitoring", "Alerts"]) {
  ok(`the ${tab} tab is registered`, nav.includes(`name="${tab}"`));
}
ok("an unauthenticated user is routed to Login", nav.includes("session.status !== \"AUTHENTICATED\""));
ok("the monitor editor is a registered route", nav.includes('name="MonitorEditor"'));
ok("the editor is presented modally", nav.includes('presentation: "modal"'));
ok("Monitoring can open the editor for creation", nav.includes("onCreate={"));
ok("Monitoring can open the editor for an existing monitor", nav.includes("onEdit={"));
ok("Command Center can navigate to Monitoring", nav.includes('navigate("Monitoring")'));
ok("realtime is bound to the session lifetime", nav.includes("startRealtime") && nav.includes("stopRealtime"));

console.log("\n[3] No placeholder or demo surface remains");
const screenFiles = await readdir(new URL("./src/screens/", import.meta.url));
ok("the Placeholder screen has been removed", !screenFiles.includes("Placeholder.tsx"), screenFiles.join(","));
ok("every expected screen file exists",
  ["CommandCenter.tsx", "Intelligence.tsx", "Risk.tsx", "Monitoring.tsx", "Alerts.tsx", "Login.tsx", "MonitorEditor.tsx"]
    .every((f) => screenFiles.includes(f)), screenFiles.join(","));

for (const file of screenFiles) {
  const body = await read(`./src/screens/${file}`);
  ok(`${file} contains no placeholder marker`, !body.includes("NOT IMPLEMENTED"));
  // The rule that matters most: no screen may invent data.
  ok(`${file} does not fabricate values`, !/Math\.random/.test(body));
}

console.log("\n[4] Every screen consumes the real API");
for (const [file, expected] of [
  ["CommandCenter.tsx", "useCommandCenter"],
  ["Alerts.tsx", "api.alerts"],
  ["Intelligence.tsx", "api.intelligence"],
  ["Risk.tsx", "api.risk"],
  ["Monitoring.tsx", "api.monitors"],
  ["MonitorEditor.tsx", "api.createMonitor"],
] as const) {
  const body = await read(`./src/screens/${file}`);
  ok(`${file} calls the API (${expected})`, body.includes(expected));
}

console.log("\n[5] Every data screen distinguishes the required states");
for (const file of ["CommandCenter.tsx", "Alerts.tsx", "Intelligence.tsx", "Risk.tsx", "Monitoring.tsx"]) {
  const body = await read(`./src/screens/${file}`);
  ok(`${file} has a loading state`, body.includes("LoadingState"));
  ok(`${file} has an error state`, body.includes("ErrorState"));
  ok(`${file} has an empty state`, body.includes("EmptyState"));
  // Stale must be visibly distinct from live — the §19 rule made physical.
  ok(`${file} marks stale data`, body.includes("StaleBar") || body.includes("StaleNotice"));
}

console.log("\n[6] API unavailability surfaces honestly");
const primitives = await read("./src/components/primitives.tsx");
const client = await read("./src/api/client.ts");
ok("the error state renders the server-supplied message", primitives.includes("error.message"));
ok("retry is offered only when retrying can help", primitives.includes("error.retryable"));
ok("a transport failure maps to a NETWORK error", client.includes('"NETWORK"'));
ok("the user-facing copy names the unreachable service",
  client.includes("No connection to NEXUS."));
ok("provider unavailability has its own copy",
  client.includes("A data provider is unavailable."));
ok("unavailable data is never rendered as zero",
  primitives.includes("metricEmpty") && primitives.includes("unavailableReason"));

console.log("\n[7] iPhone-specific concerns");
const login = await read("./src/screens/Login.tsx");
ok("Login avoids the keyboard covering its fields", login.includes("KeyboardAvoidingView"));
ok("Login uses the iOS padding behaviour", login.includes('Platform.OS === "ios" ? "padding"'));
const design = await read("../../packages/design/src/tokens.ts");
ok("the minimum touch target meets the iOS guideline", design.includes("MIN_TOUCH_TARGET = 44"));
let safeAreaUsers = 0;
for (const file of screenFiles) {
  if ((await read(`./src/screens/${file}`)).includes("SafeAreaView")) safeAreaUsers++;
}
ok("every screen respects the safe area", safeAreaUsers === screenFiles.length, `${safeAreaUsers}/${screenFiles.length}`);

console.log("\n[8] Declared dependencies match real imports");
const sources: string[] = [appTsx];
for (const dir of ["screens", "components", "api", "state", "app"]) {
  for (const file of await readdir(new URL(`./src/${dir}/`, import.meta.url))) {
    sources.push(await read(`./src/${dir}/${file}`));
  }
}
const imported = new Set<string>();
for (const body of sources) {
  for (const match of body.matchAll(/from "([^".][^"]*)"/g)) {
    const spec = match[1]!;
    if (spec.startsWith(".")) continue;
    imported.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);
  }
}
const declared = new Set(Object.keys(pkg.dependencies));
const missing = [...imported].filter((d) => !declared.has(d));
ok("no phantom dependency — everything imported is declared", missing.length === 0, missing.join(","));
ok("the app does NOT depend on @nexus/core — it cannot compute risk locally",
  !declared.has("@nexus/core") && !imported.has("@nexus/core"));

console.log(`\n${"=".repeat(52)}\n  navigation: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
