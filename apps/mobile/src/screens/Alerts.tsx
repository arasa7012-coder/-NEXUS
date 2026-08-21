/**
 * Alerts (§9).
 *
 * The occurrence badge is the screen's most important detail. When the backend
 * collapses a repeating condition, the user sees "×7" on one row rather than
 * seven rows — the visible proof that de-duplication works. Without surfacing
 * it, the collapse would look like lost alerts.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, font, radius, severityColor, space, type as typeScale } from "@nexus/design";
import { compareAlerts, SEVERITIES } from "@nexus/contracts";
import type { Alert, AlertStatus, Severity } from "@nexus/contracts";
import { api } from "../api/queries.ts";
import { alertsStore } from "../state/stores.ts";
import { useRemote } from "../state/useStore.ts";
import { Card, EmptyState, ErrorState, LoadingState, SeverityBadge, StaleBar } from "../components/primitives.tsx";

type Filter = "ALL" | "UNREAD" | Severity;

export function AlertsScreen({ onOpen }: { onOpen: (alert: Alert) => void }) {
  const [status, setStatus] = useState<AlertStatus | undefined>("OPEN");
  const [filter, setFilter] = useState<Filter>("ALL");
  const { data, error, loading, receivedAt, refresh } = useRemote(
    alertsStore, () => api.alerts(status), [status],
  );

  const visible = (data ?? [])
    .filter((a) => (filter === "ALL" ? true : filter === "UNREAD" ? !a.read : a.severity === filter))
    .sort(compareAlerts);

  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  if (loading && !data) return <Shell><LoadingState label="Loading alerts" /></Shell>;
  if (error && !data) return <Shell><ErrorState error={error} onRetry={onRefresh} /></Shell>;

  return (
    <Shell>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.count}>
          {visible.length === 0 ? "None" : `${visible.filter((a) => !a.read).length} unread`}
        </Text>
      </View>

      {/* Stale data is labelled rather than silently presented as current. */}
      {error && data ? <StaleBar message={error.message} receivedAt={receivedAt} /> : null}

      <View style={styles.filters}>
        {(["ALL", "UNREAD", ...SEVERITIES] as Filter[]).map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)}
            tint={SEVERITIES.includes(f as Severity) ? severityColor(f as Severity) : color.accent.default} />
        ))}
      </View>

      <View style={styles.filters}>
        {(["OPEN", "ACKNOWLEDGED", "RESOLVED"] as AlertStatus[]).map((s) => (
          <Chip key={s} label={s} active={status === s} onPress={() => setStatus(s)} tint={color.text.secondary} />
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={color.accent.default} />}
        ListEmptyComponent={
          <EmptyState
            title="Nothing here"
            detail={status === "OPEN" ? "No open alerts. NEXUS is watching." : `No ${status?.toLowerCase()} alerts.`}
          />
        }
        renderItem={({ item }) => <AlertRow alert={item} onPress={() => onOpen(item)} />}
      />
    </Shell>
  );
}

function AlertRow({ alert, onPress }: { alert: Alert; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.rowWrap}>
      <Card accent={severityColor(alert.severity)}>
        <View style={styles.rowHead}>
          <SeverityBadge severity={alert.severity} />
          <View style={styles.rowMeta}>
            {/* Proof of de-duplication, not decoration. */}
            {alert.occurrences > 1 ? (
              <View style={styles.repeatPill}>
                <Text style={styles.repeatText}>×{alert.occurrences}</Text>
              </View>
            ) : null}
            {!alert.read ? <View style={styles.unreadDot} /> : null}
          </View>
        </View>

        <Text style={styles.rowTitle}>{alert.title}</Text>
        <Text style={styles.rowExplanation} numberOfLines={2}>{alert.explanation}</Text>

        <View style={styles.rowFooter}>
          {alert.entity ? <Text style={styles.entity}>{alert.entity.label}</Text> : <View />}
          <Text style={styles.timestamp}>{relativeTime(alert.updatedAt)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

function Chip({ label, active, onPress, tint }: { label: string; active: boolean; onPress: () => void; tint: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}
      style={[styles.chip, active && { borderColor: tint, backgroundColor: color.bg.overlay }]}>
      <Text style={[styles.chipText, active && { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.shell} edges={["top"]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg.base },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", padding: space.lg, paddingBottom: space.sm },
  title: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.title.size },
  count: { color: color.text.secondary, fontSize: typeScale.caption.size },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingHorizontal: space.lg, paddingBottom: space.sm },
  chip: { borderWidth: 1, borderColor: color.border.default, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  chipText: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 0.4 },
  list: { padding: space.lg, paddingTop: space.sm, gap: space.md },
  rowWrap: { marginBottom: space.md },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  repeatPill: { backgroundColor: color.bg.overlay, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  repeatText: { color: color.text.secondary, fontFamily: font.mono.medium, fontSize: typeScale.micro.size },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent.default },
  rowTitle: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.heading.size },
  rowExplanation: { color: color.text.secondary, fontSize: typeScale.caption.size, lineHeight: 18 },
  rowFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.xs },
  entity: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.micro.size },
  timestamp: { color: color.text.tertiary, fontSize: typeScale.micro.size },
});
