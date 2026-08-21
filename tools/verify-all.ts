/**
 * Runs every locally-verifiable harness in the monorepo.
 *
 * These harnesses use Node's native type stripping and require no installed
 * dependencies, which is what makes them runnable in a network-isolated
 * environment.
 *
 * `--conditions=nexus-source` selects the "nexus-source" export condition in
 * each workspace package, resolving @nexus/* to TypeScript source rather than
 * to dist/. That is what lets the same package.json serve both an uncompiled
 * run today and a real `tsc --build` output later, without a second manifest. On a networked machine they are complementary to — not a
 * replacement for — `tsc --build` and the Expo build.
 */
import { spawnSync } from "node:child_process";

const SUITES = [
  ["core", "packages/core", "verify.ts"],
  ["contracts", "packages/contracts", "verify.ts"],
  ["design", "packages/design", "verify.ts"],
  ["api-domain", "apps/api", "verify.ts"],
  ["api-edge", "apps/api", "verify.edge.ts"],
  ["hardening", "apps/api", "verify.hardening.ts"],
  ["monitors", "apps/api", "verify.monitors.ts"],
  ["mobile", "apps/mobile", "verify.ts"],
  ["navigation", "apps/mobile", "verify.navigation.ts"],
  // Full stack over a real socket: login -> data -> SSE -> state -> logout.
  ["end-to-end", "apps/api", "verify.e2e.ts"],
] as const;

let failed = 0;
let total = 0;
const summary: string[] = [];

for (const [name, dir, file] of SUITES) {
  const run = spawnSync("node", ["--experimental-strip-types", "--conditions=nexus-source", file], {
    cwd: dir, encoding: "utf8", timeout: 180_000,
  });
  const out = (run.stdout ?? "") + (run.stderr ?? "");
  const match = out.match(/(\d+) passed, (\d+) failed/);
  const passed = match ? Number(match[1]) : 0;
  const fails = match ? Number(match[2]) : -1;

  if (run.status !== 0 || fails !== 0) {
    failed++;
    summary.push(`  FAIL  ${name.padEnd(12)} ${fails < 0 ? "harness did not complete" : `${fails} failing`}`);
    console.log(out);
  } else {
    summary.push(`  ok    ${name.padEnd(12)} ${passed} assertions`);
    total += passed;
  }
}

console.log("\nNEXUS verification\n" + "-".repeat(40));
console.log(summary.join("\n"));
console.log("-".repeat(40));
console.log(`  ${total} assertions total`);
console.log(failed === 0 ? "All suites passed.\n" : `${failed} suite(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
