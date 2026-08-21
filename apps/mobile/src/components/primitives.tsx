/**
 * NEXUS UI primitives.
 *
 * Every component here binds to a *contract type*, not to a screen's local
 * shape. A SeverityBadge takes a Severity; a FreshnessTag takes a DataOrigin.
 * That is what makes §16's "reusable entity presentation" real rather than
 * aspirational — a new screen composes these and inherits correct behaviour.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT: react-native cannot be installed here, so
 * none of this has been rendered or type-checked. The logic these components
 * depend on (severity ordering, freshness labelling, colour tokens) is covered
 * by the design and contracts harnesses.
 */

import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  color,
  freshnessColor,
  freshnessLabel,
  font,
  MIN_TOUCH_TARGET,
  radius,
  severityColor,
  severityLabel,
  space,
  type as typeScale,
} from "@nexus/design";
import type { DataOrigin, NexusError, Severity } from "@nexus/contracts";

// --- severity --------------------------------------------------------------

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tint = severityColor(severity);
  return (
    <View style={[styles.badge, { borderColor: tint }]}>
      {/* A dot plus the word: severity is never colour alone. */}
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[styles.badgeText, { color: tint }]}>{severityLabel[severity].toUpperCase()}</Text>
    </View>
  );
}

// --- freshness -------------------------------------------------------------

/**
 * §19's central rule made physical. Any numeric readout sourced from a
 * provider must sit beside one of these. If the origin is not LIVE, the user
 * can see that at a glance instead of trusting a stale number.
 */
export function FreshnessTag({ origin }: { origin: DataOrigin }) {
  const tint = freshnessColor(origin.freshness);
  return (
    <View style={styles.freshnessRow}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[styles.freshnessText, { color: tint }]}>{freshnessLabel(origin.freshness)}</Text>
      {origin.reason ? <Text style={styles.freshnessReason} numberOfLines={1}>· {origin.reason}</Text> : null}
    </View>
  );
}

// --- metrics ---------------------------------------------------------------

/**
 * A number that may not exist.
 *
 * The `value: string | null` signature is deliberate: it makes "unavailable"
 * unavoidable at the call site rather than something a developer remembers to
 * handle. A null renders as an em-dash with its reason — never as 0.
 */
export function Metric({
  label,
  value,
  unit,
  origin,
  unavailableReason,
}: {
  label: string;
  value: string | null;
  unit?: string;
  origin?: DataOrigin;
  unavailableReason?: string | null;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
      {value === null ? (
        <>
          <Text style={styles.metricEmpty}>—</Text>
          {unavailableReason ? (
            <Text style={styles.metricReason} numberOfLines={2}>{unavailableReason}</Text>
          ) : null}
        </>
      ) : (
        <View style={styles.metricValueRow}>
          <Text style={styles.metricValue}>{value}</Text>
          {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
        </View>
      )}
      {origin ? <FreshnessTag origin={origin} /> : null}
    </View>
  );
}

// --- surfaces --------------------------------------------------------------

export function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return <View style={[styles.card, accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : null]}>{children}</View>;
}

export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={12} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- states ----------------------------------------------------------------

/**
 * §26: loading, empty, and error are distinct states with distinct treatment.
 * Collapsing an error into an empty list is how users end up trusting a screen
 * that is actually broken.
 */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={color.accent.default} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateText}>{detail}</Text> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: NexusError; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <Text style={[styles.stateTitle, { color: color.severity.CRITICAL }]}>{error.message}</Text>
      {error.traceId ? <Text style={styles.trace}>Reference {error.traceId}</Text> : null}
      {/* Retry is offered only when retrying could actually help. */}
      {error.retryable && onRetry ? (
        <Pressable onPress={onRetry} style={styles.retry} hitSlop={8}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The stale marker.
 *
 * Rendered whenever a screen is showing data it could not refresh. §19 forbids
 * presenting stale data as current, and dropping to an error screen would
 * discard information the user still has — so the data stays, behind this.
 */
export function StaleBar({ message, receivedAt }: { message: string; receivedAt: number | null }) {
  const age = receivedAt === null ? null : Math.round((Date.now() - receivedAt) / 1000);
  return (
    <View style={styles.staleBar}>
      <View style={[styles.dot, { backgroundColor: color.freshness.STALE }]} />
      <Text style={styles.staleText} numberOfLines={2}>
        Showing last known state{age === null ? "" : ` from ${age}s ago`} — {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  staleBar: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    backgroundColor: color.bg.overlay, borderRadius: radius.md,
    padding: space.md, marginBottom: space.md,
    borderLeftWidth: 3, borderLeftColor: color.freshness.STALE,
  },
  staleText: { color: color.freshness.STALE, fontSize: typeScale.micro.size, flexShrink: 1, lineHeight: 16 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    alignSelf: "flex-start",
  },
  badgeText: { fontFamily: font.sans.semibold, fontSize: typeScale.micro.size, letterSpacing: 0.6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  freshnessRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  freshnessText: { fontFamily: font.sans.medium, fontSize: typeScale.micro.size },
  freshnessReason: { color: color.text.tertiary, fontSize: typeScale.micro.size, flexShrink: 1 },
  metric: { gap: space.xxs },
  metricLabel: {
    color: color.text.tertiary,
    fontFamily: font.sans.medium,
    fontSize: typeScale.micro.size,
    letterSpacing: 0.8,
  },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  metricValue: {
    color: color.text.primary,
    fontFamily: font.mono.medium,
    fontSize: typeScale.metric.size,
    lineHeight: typeScale.metric.lineHeight,
    fontVariant: ["tabular-nums"],
  },
  metricUnit: { color: color.text.secondary, fontFamily: font.mono.regular, fontSize: typeScale.caption.size },
  metricEmpty: {
    color: color.text.tertiary,
    fontFamily: font.mono.regular,
    fontSize: typeScale.metric.size,
    lineHeight: typeScale.metric.lineHeight,
  },
  metricReason: { color: color.text.tertiary, fontSize: typeScale.micro.size, lineHeight: 15 },
  card: {
    backgroundColor: color.bg.raised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.subtle,
    padding: space.lg,
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
    marginTop: space.xl,
  },
  sectionTitle: {
    color: color.text.tertiary,
    fontFamily: font.sans.semibold,
    fontSize: typeScale.micro.size,
    letterSpacing: 1.2,
  },
  sectionAction: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center" },
  sectionActionText: { color: color.accent.default, fontFamily: font.sans.medium, fontSize: typeScale.caption.size },
  state: { alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.sm },
  stateTitle: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.heading.size, textAlign: "center" },
  stateText: { color: color.text.secondary, fontSize: typeScale.caption.size, textAlign: "center" },
  trace: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.micro.size },
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.accent.default,
    marginTop: space.sm,
  },
  retryText: { color: color.accent.default, fontFamily: font.sans.medium, fontSize: typeScale.body.size },
});
