/**
 * Risk (§7).
 *
 * The score is never shown alone. Every NEXUS risk number arrives with its
 * contributing factors, its coverage, and — when it cannot be computed — the
 * reason. A bare number would be an assertion the user has no way to check,
 * which is precisely what the ExplainableScore model exists to prevent.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React, { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, font, radius, space, type as typeScale } from "@nexus/design";
import type { EntityRef, RiskLevel, ScoreFactor } from "@nexus/contracts";
import { api } from "../api/queries.ts";
import { riskStore } from "../state/stores.ts";
import { useRemote } from "../state/useStore.ts";
import { Card, EmptyState, ErrorState, FreshnessTag, LoadingState, SectionHeader, StaleBar } from "../components/primitives.tsx";

const LEVEL_TINT: Record<RiskLevel, string> = {
  LOW: color.freshness.LIVE,
  MODERATE: color.severity.INFO,
  HIGH: color.severity.WARNING,
  EXTREME: color.severity.CRITICAL,
};

export function RiskScreen({ entity }: { entity: EntityRef }) {
  const { data, error, loading, receivedAt, refresh } = useRemote(
    riskStore, () => api.risk(entity), [entity.kind, entity.id],
  );
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  if (loading && !data) return <Shell><LoadingState label="Evaluating risk" /></Shell>;
  if (error && !data) return <Shell><ErrorState error={error} onRetry={onRefresh} /></Shell>;
  if (!data) return <Shell><EmptyState title="No risk evaluation" /></Shell>;

  const tint = data.level ? LEVEL_TINT[data.level] : color.text.tertiary;

  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={color.accent.default} />}>

        {error ? <StaleBar message={error.message} receivedAt={receivedAt} /> : null}

        {data.emergencyStopActive ? (
          <View style={styles.stopBanner}>
            <Text style={styles.stopText}>EMERGENCY STOP ACTIVE</Text>
            <Text style={styles.stopDetail}>New positions are blocked until the stop is reset.</Text>
          </View>
        ) : null}

        <Card accent={tint}>
          <Text style={styles.entityLabel}>{data.entity?.label ?? "Portfolio"}</Text>

          {/* The null case is first-class, not an afterthought. */}
          {data.score.value === null ? (
            <>
              <Text style={styles.scoreEmpty}>—</Text>
              <Text style={styles.levelUnavailable}>RISK UNAVAILABLE</Text>
              <Text style={styles.unavailableReason}>
                {data.score.unavailableReason ?? "Risk could not be evaluated from available data."}
              </Text>
            </>
          ) : (
            <>
              <View style={styles.scoreRow}>
                <Text style={[styles.score, { color: tint }]}>{data.score.value}</Text>
                <Text style={styles.scoreMax}>/100</Text>
              </View>
              <Text style={[styles.level, { color: tint }]}>{data.level}</Text>
            </>
          )}

          <FreshnessTag origin={data.origin} />
          <View style={styles.coverageRow}>
            <Text style={styles.coverageLabel}>EVIDENCE COVERAGE</Text>
            <Text style={styles.coverageValue}>{Math.round(data.score.coveragePercent)}%</Text>
          </View>
          <View style={styles.coverageTrack}>
            <View style={[styles.coverageFill, { width: `${Math.min(100, data.score.coveragePercent)}%` }]} />
          </View>
        </Card>

        <SectionHeader title="Contributing factors" />
        {data.score.factors.length === 0 ? (
          <Card><EmptyState title="No factors recorded" detail="No measurable factor contributed to this evaluation." /></Card>
        ) : (
          <Card>
            {data.score.factors.map((factor) => <FactorRow key={factor.id} factor={factor} />)}
          </Card>
        )}
      </ScrollView>
    </Shell>
  );
}

/**
 * One factor with its weight bar.
 *
 * The bar is proportional to points/maxPoints, so a factor contributing 2 of a
 * possible 28 reads as small. Showing raw points without the ceiling would
 * make every factor look equally important.
 */
function FactorRow({ factor }: { factor: ScoreFactor }) {
  const share = factor.maxPoints === 0 ? 0 : (factor.points / factor.maxPoints) * 100;
  const tint = share >= 70 ? color.severity.CRITICAL : share >= 40 ? color.severity.WARNING : color.text.secondary;

  return (
    <View style={styles.factor}>
      <View style={styles.factorHead}>
        <Text style={styles.factorLabel}>{factor.label}</Text>
        <Text style={styles.factorPoints}>{factor.points}<Text style={styles.factorMax}>/{factor.maxPoints}</Text></Text>
      </View>
      <View style={styles.factorTrack}>
        <View style={[styles.factorFill, { width: `${Math.min(100, share)}%`, backgroundColor: tint }]} />
      </View>
      {/* The evidence line: why this factor scored what it scored. */}
      <Text style={styles.factorDescription}>{factor.description}</Text>
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.shell} edges={["top"]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg.base },
  scroll: { padding: space.lg, paddingBottom: space.xxxl },
  entityLabel: { color: color.text.secondary, fontFamily: font.sans.medium, fontSize: typeScale.caption.size },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  score: { fontFamily: font.mono.medium, fontSize: 56, lineHeight: 60, fontVariant: ["tabular-nums"] },
  scoreMax: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.body.size },
  scoreEmpty: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: 56, lineHeight: 60 },
  level: { fontFamily: font.sans.semibold, fontSize: typeScale.heading.size, letterSpacing: 1.2 },
  levelUnavailable: { color: color.text.tertiary, fontFamily: font.sans.semibold, fontSize: typeScale.caption.size, letterSpacing: 1.2 },
  unavailableReason: { color: color.text.secondary, fontSize: typeScale.caption.size, lineHeight: 18 },
  coverageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.sm },
  coverageLabel: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 0.8 },
  coverageValue: { color: color.text.secondary, fontFamily: font.mono.medium, fontSize: typeScale.caption.size },
  coverageTrack: { height: 3, backgroundColor: color.bg.inset, borderRadius: radius.pill, overflow: "hidden" },
  coverageFill: { height: 3, backgroundColor: color.accent.default },
  stopBanner: { backgroundColor: color.severity.CRITICAL, borderRadius: radius.md, padding: space.md, marginBottom: space.md, gap: space.xxs },
  stopText: { color: color.text.inverse, fontFamily: font.sans.semibold, fontSize: typeScale.caption.size, letterSpacing: 1 },
  stopDetail: { color: color.text.inverse, fontSize: typeScale.micro.size, opacity: 0.9 },
  factor: { gap: space.xs, paddingVertical: space.sm },
  factorHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  factorLabel: { color: color.text.primary, fontSize: typeScale.body.size, flexShrink: 1 },
  factorPoints: { color: color.text.primary, fontFamily: font.mono.medium, fontSize: typeScale.caption.size },
  factorMax: { color: color.text.tertiary },
  factorTrack: { height: 3, backgroundColor: color.bg.inset, borderRadius: radius.pill, overflow: "hidden" },
  factorFill: { height: 3 },
  factorDescription: { color: color.text.tertiary, fontSize: typeScale.micro.size, lineHeight: 16 },
});
