/**
 * NEXUS design tokens (§21).
 *
 * Identity: intelligence, control, precision, security. The interface is an
 * instrument panel, not a marketing page — it is read at a glance, often under
 * pressure, and often when something is wrong.
 *
 * Decisions this encodes:
 *
 *   - Dark-first. The product is a monitoring surface; a dark ground makes
 *     severity colour carry meaning instead of competing with a white field.
 *   - Colour is semantic, never decorative. A red pixel in NEXUS means
 *     CRITICAL. Nothing else is allowed to be that red.
 *   - One accent (cyan). A single accent keeps "this is actionable" legible;
 *     a palette of accents means none of them signal anything.
 *   - A 4pt spatial grid, so spacing is a choice from a scale rather than an
 *     improvised number.
 *
 * Zero dependencies: these are plain values, consumable by React Native
 * StyleSheet, and testable — see verify.ts, which asserts contrast rather
 * than trusting that the palette looks fine.
 */

// --- palette ---------------------------------------------------------------

export const color = {
  /** Backgrounds, darkest to lightest. Depth via elevation, not shadow. */
  bg: {
    base: "#07090D",
    raised: "#0D1117",
    overlay: "#141A22",
    inset: "#04060A",
  },
  border: {
    subtle: "#1C2530",
    default: "#28333F",
    strong: "#3A4756",
  },
  text: {
    primary: "#E8EDF4",
    secondary: "#9BA9BC",
    tertiary: "#6B7A8D",
    inverse: "#07090D",
  },
  /** The single accent. Actionable, focused, selected. */
  accent: {
    default: "#22D3EE",
    muted: "#0E7490",
    surface: "#082F38",
  },
  /**
   * Severity. These map 1:1 onto the Severity contract — the UI never invents
   * a colour for a state the domain does not define.
   */
  severity: {
    INFO: "#60A5FA",
    WATCH: "#38BDF8",
    WARNING: "#FBBF24",
    CRITICAL: "#F87171",
  },
  /**
   * Data freshness. §19 requires stale data to be visibly distinct from live
   * data, so freshness gets its own colour channel rather than being implied.
   */
  freshness: {
    LIVE: "#34D399",
    CACHED: "#9BA9BC",
    STALE: "#FBBF24",
    UNAVAILABLE: "#6B7A8D",
  },
  market: {
    up: "#34D399",
    down: "#F87171",
    flat: "#9BA9BC",
  },
} as const;

// --- spatial ---------------------------------------------------------------

/** 4pt grid. Index by name, never by literal. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

// --- typography ------------------------------------------------------------

/**
 * Two families. The interface reads in a humanist sans; every *number* reads
 * in a monospace face so that digits align in columns and a changing price
 * does not make the row jitter. That second rule is why a design system is
 * worth having.
 */
export const font = {
  sans: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
  },
  mono: {
    regular: "JetBrainsMono_400Regular",
    medium: "JetBrainsMono_500Medium",
  },
} as const;

export const type = {
  display: { size: 32, lineHeight: 38, weight: "600" },
  title: { size: 22, lineHeight: 28, weight: "600" },
  heading: { size: 17, lineHeight: 22, weight: "600" },
  body: { size: 15, lineHeight: 21, weight: "400" },
  caption: { size: 13, lineHeight: 17, weight: "400" },
  micro: { size: 11, lineHeight: 14, weight: "500" },
  /** Numeric readouts. Tabular figures, monospace family. */
  metric: { size: 28, lineHeight: 32, weight: "500" },
  metricSmall: { size: 15, lineHeight: 19, weight: "500" },
} as const;

// --- motion ----------------------------------------------------------------

/**
 * Restrained. Motion communicates that something changed; it does not
 * entertain. Anything above `deliberate` reads as sluggish on a device.
 */
export const motion = {
  instant: 0,
  quick: 120,
  standard: 200,
  deliberate: 320,
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
  },
} as const;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

/** iOS minimum tappable target. Nothing interactive may be smaller. */
export const MIN_TOUCH_TARGET = 44;

// --- semantic helpers ------------------------------------------------------

import type { Freshness, Severity } from "@nexus/contracts";

export function severityColor(severity: Severity): string {
  return color.severity[severity];
}

export function freshnessColor(freshness: Freshness): string {
  return color.freshness[freshness];
}

/**
 * Label shown beside any data readout. §19 forbids presenting stale data as
 * live, so the label is derived from the contract rather than written by hand
 * at each call site.
 */
export function freshnessLabel(freshness: Freshness): string {
  switch (freshness) {
    case "LIVE": return "Live";
    case "CACHED": return "Cached";
    case "STALE": return "Stale";
    case "UNAVAILABLE": return "Unavailable";
  }
}

// --- contrast --------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1–21. Used by verify.ts to police the palette. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Perceptual colour difference (CIE76 ΔE over CIELAB).
 *
 * Luminance contrast is the wrong tool for asking "can these two states be
 * told apart?" — a blue and a red of equal lightness score ~1.0 on a contrast
 * ratio while being obviously different to the eye. ΔE measures the distance
 * a person actually perceives, so it is what the palette is policed against.
 */
function toLab(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const srgb = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const [r, g, b] = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];

  // sRGB -> XYZ (D65), then normalised against the reference white.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;

  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Redundant, non-colour encoding for severity.
 *
 * Roughly 8% of men have a colour vision deficiency, and deuteranopia makes
 * amber and red converge — exactly the two states where being wrong matters
 * most. Severity is therefore always rendered with a glyph and a word beside
 * the colour. No NEXUS surface may signal severity by hue alone.
 */
export const severityGlyph: Record<Severity, string> = {
  INFO: "info",
  WATCH: "eye",
  WARNING: "alert-triangle",
  CRITICAL: "octagon-alert",
};

export const severityLabel: Record<Severity, string> = {
  INFO: "Info",
  WATCH: "Watch",
  WARNING: "Warning",
  CRITICAL: "Critical",
};
