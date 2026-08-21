// Run: node --experimental-strip-types verify.ts
// The design system is testable, so it gets tested. Contrast is not a matter
// of taste — a WARNING amber that cannot be read on the card it sits on is a
// safety defect, not a styling preference.
import {
  color, contrastRatio, deltaE, freshnessLabel, MIN_TOUCH_TARGET,
  severityColor, severityGlyph, severityLabel, space, type as typeScale,
} from "./src/tokens.ts";
import { SEVERITIES, FRESHNESS } from "@nexus/contracts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  :: " + extra : "")); }
};

console.log("\n[1] Text contrast meets WCAG AA on every surface");
for (const [surfaceName, surface] of Object.entries(color.bg)) {
  const ratio = contrastRatio(color.text.primary, surface);
  ok(`primary text on bg.${surfaceName} ≥ 4.5:1`, ratio >= 4.5, ratio.toFixed(2));
}
const secondary = contrastRatio(color.text.secondary, color.bg.raised);
ok("secondary text on a card ≥ 4.5:1", secondary >= 4.5, secondary.toFixed(2));
const tertiary = contrastRatio(color.text.tertiary, color.bg.base);
ok("tertiary text ≥ 3:1 (large/decorative floor)", tertiary >= 3, tertiary.toFixed(2));

console.log("\n[2] Severity colours are legible where they are actually used");
for (const severity of SEVERITIES) {
  const ratio = contrastRatio(severityColor(severity), color.bg.raised);
  ok(`${severity} on a card ≥ 3:1`, ratio >= 3, ratio.toFixed(2));
}

console.log("\n[3] Severity states are perceptually distinguishable (ΔE, not luminance)");
const pairs: Array<[string, string]> = [];
for (let i = 0; i < SEVERITIES.length; i++) {
  for (let j = i + 1; j < SEVERITIES.length; j++) {
    pairs.push([SEVERITIES[i]!, SEVERITIES[j]!]);
  }
}
for (const [a, b] of pairs) {
  const d = deltaE(severityColor(a as never), severityColor(b as never));
  // ΔE ≥ 10 is comfortably beyond the ~2.3 just-noticeable-difference
  // threshold, which is the margin an at-a-glance readout needs.
  ok(`${a} vs ${b} are perceptually distinct`, d >= 10, d.toFixed(1));
}

console.log("\n[4] Severity is never signalled by colour alone");
ok("every severity has a glyph", SEVERITIES.every((s) => severityGlyph[s].length > 0));
ok("every severity has a word", SEVERITIES.every((s) => severityLabel[s].length > 0));
ok("glyphs are unique per severity", new Set(SEVERITIES.map((s) => severityGlyph[s])).size === SEVERITIES.length);

console.log("\n[5] The token set covers every contract value — no missing states");
ok("every Severity has a colour", SEVERITIES.every((s) => typeof color.severity[s] === "string"));
ok("every Freshness has a colour", FRESHNESS.every((f) => typeof color.freshness[f] === "string"));
ok("every Freshness has a user-facing label", FRESHNESS.every((f) => freshnessLabel(f).length > 0));
ok("LIVE and STALE are not the same colour", color.freshness.LIVE !== color.freshness.STALE);

console.log("\n[6] Spatial system is a disciplined scale");
const steps = Object.values(space).filter((v) => v > 0);
ok("every spacing step sits on the 4pt grid (or is a 2pt half-step)",
  steps.every((v) => v % 4 === 0 || v === 2), steps.join(","));
ok("the scale increases monotonically",
  steps.every((v, i) => i === 0 || v > steps[i - 1]!));
ok("touch targets meet the platform minimum", MIN_TOUCH_TARGET >= 44);

console.log("\n[7] Type scale is coherent");
const sizes = Object.values(typeScale).map((t) => t.size);
ok("no type size is below the legibility floor", Math.min(...sizes) >= 11, String(Math.min(...sizes)));
ok("line height always exceeds font size",
  Object.values(typeScale).every((t) => t.lineHeight > t.size));

console.log(`\n${"=".repeat(52)}\n  design: ${pass} passed, ${fail} failed\n${"=".repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
