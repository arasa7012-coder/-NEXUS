/**
 * NEXUS Command Center (§13).
 *
 * The screen answers one question: *what is happening right now, and what
 * requires my attention?* Everything on it earns its place against that
 * question, in this order:
 *
 *   1. System state — one line, because if NEXUS itself is degraded, nothing
 *      below it can be trusted and the user must know first.
 *   2. Critical alerts — the things demanding action.
 *   3. Risk — the standing exposure picture.
 *   4. Monitors and providers — is the machinery actually running?
 *   5. Recent events — context, last, because it is history rather than a call
 *      to act.
 *
 * One request populates all of it (`commandCenterView`), so a cold start is a
 * single round trip rather than eight racing ones.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React, { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, font, radius, severityColor, space, type as typeScale } from "@nexus/design";
import { compareAlerts } from "@nexus/contracts";
import type { Alert, CommandCenterView } from "@nexus/contracts";
import { Card, EmptyState, ErrorState, LoadingState, Metric, SectionHeader, SeverityBadge } from "../components/primitives.tsx";
import { ConnectionPill } from "../components/ConnectionPill.tsx";
import { useCommandCenter } from "../state/useCommandCenter.ts";

const SYSTEM_TINT = {
  NOMINAL: color.freshness.LIVE,
  DEGRADED: color.severity.WARNING,
  CRITICAL: color.severity.CRITICAL,
} as const;

const SYSTEM_COPY = {
  NOMINAL: "All systems nominal",
  DEGRADED: "Operating degraded",
  CRITICAL: "Critical condition",
} as const;

export function CommandCenterScreen({ onOpenAlert, onOpenMonitors }: {
  onOpenAlert: (id: string) => void;
  onOpenMonitors?: () => void;
}) {
  const { data, error, loading, refreshing, refresh } = useCommandCenter();
  const monitorsBroken = (data?.monitors ?? []).filter(
    (m) => m.state === "FAILING" || m.state === "STOPPED",
  ).length;

  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  if (loading && !data) return <Shell><LoadingState label="Contacting NEXUS" /></Shell>;
  if (error && !data) return <Shell><ErrorState error={error} onRetry={onRefresh} /></Shell>;
  if (!data) return <Shell><EmptyState title="No data" /></Shell>;

  return (
    <Shell>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.accent.default} />}
      >
        <StatusBanner view={data} />

        {/* A stale banner sits above everything: if the payload is old, every
            number below it is old, and that must be stated once, loudly. */}
        {error ? <StaleNotice message={error.message} /> : null}

        <SectionHeader title="Requires attention" />
        {data.criticalAlerts.length === 0 ? (
          <Card><EmptyState title="Nothing requires action" detail="No open critical or warning alerts." /></Card>
        ) : (
          [...data.criticalAlerts].sort(compareAlerts).map((alert) => (
            <AlertRow key={alert.id} alert={alert} onPress={() => onOpenAlert(alert.id)} />
          ))
        )}

        <SectionHeader title="Risk" />
        <Card accent={data.risk?.level ? color.accent.default : undefined}>
          <Metric
            label="Risk score"
            value={data.risk?.score.value === null || data.risk === null ? null : String(data.risk.score.value)}
            origin={data.risk?.origin}
            unavailableReason={data.risk?.score.unavailableReason ?? "Risk has not been evaluated."}
          />
          {data.risk?.emergencyStopActive ? (
            <View style={styles.stopBanner}>
              <Text style={styles.stopText}>EMERGENCY STOP ACTIVE</Text>
            </View>
          ) : null}
          {/* Contributing factors are shown, not just the number — a score
              without its factors is an assertion the user cannot check. */}
          {data.risk?.score.factors.slice(0, 3).map((factor) => (
            <View key={factor.id} style={styles.factorRow}>
              <Text style={styles.factorLabel} numberOfLines={1}>{factor.label}</Text>
              <Text style={styles.factorPoints}>{factor.points}/{factor.maxPoints}</Text>
            </View>
          ))}
        </Card>

<SectionHeader
          title="Monitoring"
          {...(onOpenMonitors ? { action: { label: "Manage", onPress: onOpenMonitors } } : {})}
        />
        <Card accent={monitorsBroken > 0 ? color.severity.CRITICAL : undefined}>
          <View style={styles.row}>
            <Metric label="Active" value={String(data.monitors.filter((m) => m.state === "ACTIVE").length)} />
            <Metric label="Failing" value={String(data.monitors.filter((m) => m.state === "FAILING").length)} />
            <Metric label="Stopped" value={String(data.monitors.filter((m) => m.state === "STOPPED").length)} />
          </View>

          {/* Nothing configured is a real state with a real consequence: NEXUS
              is not watching anything. It must not read as "all clear". */}
          {data.monitors.length === 0 ? (
            <Text style={styles.monitorHint}>
              No monitors configured — NEXUS is not watching anything yet.
            </Text>
          ) : null}

          {/* Recently changed monitors, so a stop or failure is visible here
              without opening the management screen. */}
          {data.monitors
            .filter((m) => m.state === "FAILING" || m.state === "STOPPED")
            .slice(0, 3)
            .map((m) => (
              <View key={m.id} style={styles.monitorRow}>
                <View style={[styles.eventDot, { backgroundColor: color.severity.CRITICAL }]} />
                <Text style={styles.monitorName} numberOfLines={1}>
                  {m.name} — {m.lastFailureKind ? m.lastFailureKind.replace(/_/g, " ").toLowerCase() : m.state.toLowerCase()}
                </Text>
              </View>
            ))}
        </Card>

        <SectionHeader title="Data providers" />
        <Card>
          {data.providers.length === 0 ? (
            <EmptyState title="No providers configured" />
          ) : (
            data.providers.map((provider) => (
              <View key={provider.providerId} style={styles.providerRow}>
                <Text style={styles.providerName}>{provider.displayName}</Text>
                <Text style={[styles.providerState, { color: providerTint(provider.state) }]}>
                  {provider.state.replace("_", " ")}
                </Text>
              </View>
            ))
          )}
        </Card>

        <SectionHeader title="Recent activity" />
        {data.recentEvents.slice(0, 8).map((event) => (
          <View key={event.id} style={styles.eventRow}>
            <View style={[styles.eventDot, { backgroundColor: severityColor(event.severity) }]} />
            <Text style={styles.eventText} numberOfLines={2}>{event.summary}</Text>
          </View>
        ))}
      </ScrollView>
    </Shell>
  );
}

function StatusBanner({ view }: { view: CommandCenterView }) {
  const tint = SYSTEM_TINT[view.systemState];
  return (
    <View style={styles.banner}>
      <View style={styles.bannerTop}>
        <View style={[styles.bannerDot, { backgroundColor: tint }]} />
        <Text style={[styles.bannerText, { color: tint }]}>{SYSTEM_COPY[view.systemState]}</Text>
      </View>
      <View style={styles.bannerBottom}>
        <Text style={styles.bannerCount}>
          {view.unreadAlertCount === 0 ? "No unread alerts" : `${view.unreadAlertCount} unread`}
        </Text>
        {/* Realtime state sits beside the alert count: present, not dominant. */}
        <ConnectionPill />
      </View>
    </View>
  );
}

function StaleNotice({ message }: { message: string }) {
  return (
    <View style={styles.stale}>
      <Text style={styles.staleText}>Showing last known state — {message}</Text>
    </View>
  );
}

function AlertRow({ alert, onPress }: { alert: Alert; onPress: () => void }) {
  return (
    <View style={styles.alertWrap}>
      <Card accent={severityColor(alert.severity)}>
        <View style={styles.alertHead}>
          <SeverityBadge severity={alert.severity} />
          {alert.occurrences > 1 ? <Text style={styles.repeat}>×{alert.occurrences}</Text> : null}
        </View>
        <Text style={styles.alertTitle} onPress={onPress}>{alert.title}</Text>
        <Text style={styles.alertExplanation} numberOfLines={3}>{alert.explanation}</Text>
      </Card>
    </View>
  );
}

function providerTint(state: string): string {
  if (state === "OPERATIONAL") return color.freshness.LIVE;
  if (state === "DEGRADED" || state === "RATE_LIMITED") return color.severity.WARNING;
  if (state === "FAILING") return color.severity.CRITICAL;
  return color.text.tertiary;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.shell} edges={["top"]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg.base },
  scroll: { padding: space.lg, paddingBottom: space.xxxl },
  banner: { gap: space.xxs },
  bannerTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { fontFamily: font.sans.semibold, fontSize: typeScale.title.size },
  bannerBottom: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginLeft: space.lg, marginRight: space.xs,
  },
  bannerCount: { color: color.text.secondary, fontSize: typeScale.caption.size },
  stale: {
    backgroundColor: color.bg.overlay,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
    borderLeftWidth: 3,
    borderLeftColor: color.freshness.STALE,
  },
  staleText: { color: color.freshness.STALE, fontSize: typeScale.caption.size },
  alertWrap: { marginBottom: space.md },
  alertHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  repeat: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.caption.size },
  alertTitle: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.heading.size },
  alertExplanation: { color: color.text.secondary, fontSize: typeScale.caption.size, lineHeight: 18 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  stopBanner: { backgroundColor: color.severity.CRITICAL, borderRadius: radius.sm, padding: space.sm },
  stopText: { color: color.text.inverse, fontFamily: font.sans.semibold, fontSize: typeScale.micro.size, letterSpacing: 1 },
  factorRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  factorLabel: { color: color.text.secondary, fontSize: typeScale.caption.size, flexShrink: 1 },
  factorPoints: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.caption.size },
  providerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  providerName: { color: color.text.primary, fontSize: typeScale.body.size },
  providerState: { fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 0.6 },
  eventRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: space.sm },
  eventDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  eventText: { color: color.text.secondary, fontSize: typeScale.caption.size, flexShrink: 1, lineHeight: 18 },
  monitorHint: { color: color.text.tertiary, fontSize: typeScale.micro.size, lineHeight: 16 },
  monitorRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  monitorName: { color: color.text.secondary, fontSize: typeScale.micro.size, flexShrink: 1 },
});
