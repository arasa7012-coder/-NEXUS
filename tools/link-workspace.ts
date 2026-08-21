/**
 * Creates the workspace package links.
 *
 * `pnpm install` normally does this, but it needs a registry. The verification
 * harnesses have no dependencies at all, so requiring a network round trip
 * just to resolve `@nexus/core` would be absurd — and would mean a fresh
 * clone could not be verified without one.
 *
 * This links each workspace package into the node_modules of every package
 * that depends on it, using only Node's standard library. It installs nothing
 * and contacts nothing. Running `pnpm install` afterwards is harmless: pnpm
 * recreates these same links.
 */

import { mkdir, symlink, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Which packages each consumer needs linked. */
const LINKS: Record<string, string[]> = {
  "packages/design": ["contracts"],
  "apps/api": ["core", "contracts"],
  "apps/mobile": ["contracts", "design"],
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

let created = 0;

for (const [consumer, deps] of Object.entries(LINKS)) {
  const scopeDir = join(root, consumer, "node_modules", "@nexus");
  await mkdir(scopeDir, { recursive: true });

  for (const dep of deps) {
    const target = join(root, "packages", dep);
    const linkPath = join(scopeDir, dep);

    if (!(await exists(target))) {
      throw new Error(`Cannot link @nexus/${dep}: ${target} does not exist.`);
    }

    // Replace rather than skip, so a stale link from a moved checkout is
    // repaired instead of silently pointing somewhere wrong.
    await rm(linkPath, { force: true, recursive: true }).catch(() => {});
    // Relative target keeps the tree portable across checkout locations.
    await symlink(relative(dirname(linkPath), target), linkPath, "dir");
    created += 1;
  }
}

console.log(`Linked ${created} workspace package(s). No packages were downloaded.`);
