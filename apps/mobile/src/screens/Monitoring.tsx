/**
 * Monitoring (§8).
 *
 * The screen's job is to make it obvious when monitoring is NOT running. A
 * monitoring product that silently stops watching is worse than one that never
 * started, so a stopped or failing monitor is given more prominence than a
 * healthy one, and provider health sits alongside — a monitor cannot be
 * healthier than the data feeding it.
 *
 * The mobile app only displays this state. It never runs a monitor, and never
 * keeps one alive.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, font, radius, space, type as typeScale } from "@nexus/design";
import type { Monitor, MonitorState } from "@nexus/contracts";
import { api } from "../api/queries.ts";
import { monitorsStore } from "../state/stores.ts";
import { useRemote } from "../state/useStore.ts";
import { Card, EmptyState, ErrorState, LoadingState, SectionHeader, StaleBar } from "../components/primitives.tsx";
import { relativeTime } from "./Alerts.tsx";
import { api } from "../api/queries.ts";

const STATE_TINT: Record<MonitorState, string> = {
  ACTIVE: color.freshness.LIVE,
  PAUSED: color.text.tertiary,
  FAILING: color.severity.WARNING,
  STOPPED: color.severity.CRITICAL,
};

/** Attention first: broken monitors sort above healthy ones. */
const STATE_ORDER: Record<MonitorState, number> = { STOPPED: 0, FAILING: 1, ACTIVE: 2, PAUSED: 3 };

export function MonitoringScreen({ onCreate, onEdit }: {
  onCreate?: () => void;
  onEdit?: (monitor: Monitor) => void;
} = {}) {
  const { data, error, loading, receivedAt, refresh } = useRemote(monitorsStore, () => api.monitors(), []);
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  // Optimistic toggle: the row flips immediately and reverts if the server
  // disagrees. A switch that waits on a round trip feels broken on mobile.
  const toggle = useCallback(async (monitor: Monitor) => {
    const next = !monitor.enabled;
    monitorsStore.update((slice) => slice.data ? {
      ...slice,
      data: slice.data.map((m) => m.id === monitor.id
        ? { ...m, enabled: next, state: next ? "ACTIVE" : "PAUSED" }
        : m),
    } : slice);

    const result = await api.setMonitorEnabled(monitor.id, next);
    if (!result.ok) {
      monitorsStore.update((slice) => slice.data ? {
        ...slice, data: slice.data.map((m) => (m.id === monitor.id ? monitor : m)),
      } : slice);
      return;
    }
    monitorsStore.update((slice) => slice.data ? {
      ...slice, data: slice.data.map((m) => (m.id === monitor.id ? result.data : m)),
    } : slice);
  }, []);

  const remove = useCallback(async (monitor: Monitor) => {
    const result = await api.deleteMonitor(monitor.id);
    if (result.ok) {
      monitorsStore.update((slice) => slice.data ? {
        ...slice, data: slice.data.filter((m) => m.id !== monitor.id),
      } : slice);
    }
  }, []);

  if (loading && !data) return <Shell><LoadingState label="Loading monitors" /></Shell>;
  if (error && !data) return <Shell><ErrorState error={error} onRetry={onRefresh} /></Shell>;

  const monitors = [...(data ?? [])].sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name),
  );
  const broken = monitors.filter((m) => m.state === "STOPPED" || m.state === "FAILING").length;
  const active = monitors.filter((m) => m.state === "ACTIVE").length;

  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={color.accent.default} />}>

        {error ? <StaleBar message={error.message} receivedAt={receivedAt} /> : null}

        <View style={styles.titleRow}>
          <Text style={styles.title}>Monitoring</Text>
          {onCreate ? (
            <Pressable onPress={onCreate} hitSlop={10} style={styles.addButton}>
              <Text style={styles.addButtonText}>+ New</Text>
            </Pressable>
          ) : null}
        </View>

        {/* The headline states plainly whether NEXUS is actually watching. */}
        <View style={[styles.banner, broken > 0 && { borderLeftColor: color.severity.CRITICAL }]}>
          <Text style={[styles.bannerText, broken > 0 && { color: color.severity.CRITICAL }]}>
            {monitors.length === 0
              ? "No monitors configured — NEXUS is not watching anything"
              : broken > 0
                ? `${broken} monitor${broken > 1 ? "s are" : " is"} not running`
                : `${active} monitor${active === 1 ? "" : "s"} active`}
          </Text>
        </View>

        <SectionHeader title="Monitors" />
        {monitors.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing is being monitored"
              detail="Create a monitor to have NEXUS watch a market or a data feed. Monitoring runs on the backend and continues when this app is closed."
            />
          </Card>
        ) : (
          monitors.map((monitor) => (
            <MonitorRow key={monitor.id} monitor={monitor}
              onToggle={() => { void toggle(monitor); }}
              onEdit={onEdit ? () => onEdit(monitor) : undefined}
              onDelete={() => { void remove(monitor); }} />
          ))
        )}
      </ScrollView>
    </Shell>
  );
}

function MonitorRow({ monitor, onToggle, onEdit, onDelete }: {
  monitor: Monitor;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const tint = STATE_TINT[monitor.state];
  const stopped = monitor.state === "STOPPED";
  const [confirming, setConfirming] = useState(false);

  return (
    <View style={styles.rowWrap}>
      <Card accent={tint}>
        <View style={styles.rowHead}>
          <Text style={styles.name}>{monitor.name}</Text>
          <View style={styles.rowHeadRight}>
            <Text style={[styles.state, { color: tint }]}>{monitor.state}</Text>
            <Switch value={monitor.enabled} onValueChange={onToggle}
              trackColor={{ true: color.accent.muted, false: color.border.default }}
              thumbColor={monitor.enabled ? color.accent.default : color.text.tertiary} />
          </View>
        </View>

        <Text style={styles.target}>{monitor.target.kind.toLowerCase()}:{monitor.target.id}</Text>

        <View style={styles.metaRow}>
          <Meta label="Interval" value={`${monitor.intervalSeconds}s`} />
          <Meta label="Last run" value={monitor.lastRunAt === null ? "Never" : relativeTime(monitor.lastRunAt)} />
          <Meta label="Next" value={monitor.nextRunAt === null ? "Not scheduled" : relativeTime(monitor.nextRunAt)} />
        </View>

        {monitor.consecutiveFailures > 0 ? (
          <Text style={styles.failures}>
            {monitor.consecutiveFailures} consecutive failure{monitor.consecutiveFailures > 1 ? "s" : ""}
            {stopped ? " — stopped retrying" : " — backing off"}
          </Text>
        ) : null}

        {monitor.detail ? <Text style={styles.detail} numberOfLines={2}>{monitor.detail}</Text> : null}

        {/* The failure kind, stated plainly. "Rate limited" and "auth failed"
            call for different responses from the user. */}
        {monitor.lastFailureKind ? (
          <Text style={styles.failureKind}>{monitor.lastFailureKind.replace(/_/g, " ")}</Text>
        ) : null}

        <View style={styles.rowActions}>
          {onEdit ? (
            <Pressable onPress={onEdit} hitSlop={8} style={styles.action}>
              <Text style={styles.actionText}>Edit</Text>
            </Pressable>
          ) : null}
          {confirming ? (
            <>
              <Pressable onPress={() => setConfirming(false)} hitSlop={8} style={styles.action}>
                <Text style={styles.actionText}>Keep</Text>
              </Pressable>
              <Pressable onPress={onDelete} hitSlop={8} style={styles.action}>
                <Text style={[styles.actionText, { color: color.severity.CRITICAL }]}>Confirm delete</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setConfirming(true)} hitSlop={8} style={styles.action}>
              <Text style={[styles.actionText, { color: color.text.tertiary }]}>Delete</Text>
            </Pressable>
          )}
        </View>
      </Card>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.shell} edges={["top"]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg.base },
  scroll: { padding: space.lg, paddingBottom: space.xxxl },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  title: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.title.size },
  addButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: color.accent.default },
  addButtonText: { color: color.accent.default, fontFamily: font.sans.medium, fontSize: typeScale.caption.size },
  rowHeadRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
  failureKind: { color: color.severity.WARNING, fontFamily: font.mono.regular, fontSize: typeScale.micro.size, letterSpacing: 0.5 },
  rowActions: { flexDirection: "row", gap: space.lg, marginTop: space.xs },
  action: { minHeight: 32, justifyContent: "center" },
  actionText: { color: color.accent.default, fontFamily: font.sans.medium, fontSize: typeScale.caption.size },
  banner: { backgroundColor: color.bg.raised, borderRadius: radius.md, padding: space.md, borderLeftWidth: 3, borderLeftColor: color.freshness.LIVE },
  bannerText: { color: color.text.primary, fontFamily: font.sans.medium, fontSize: typeScale.body.size },
  rowWrap: { marginBottom: space.md },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.heading.size, flexShrink: 1 },
  state: { fontFamily: font.sans.semibold, fontSize: typeScale.micro.size, letterSpacing: 1 },
  target: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.micro.size },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  meta: { gap: 2 },
  metaLabel: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 0.6 },
  metaValue: { color: color.text.secondary, fontFamily: font.mono.regular, fontSize: typeScale.caption.size },
  failures: { color: color.severity.WARNING, fontSize: typeScale.micro.size },
  detail: { color: color.text.tertiary, fontSize: typeScale.micro.size, lineHeight: 16 },
});
