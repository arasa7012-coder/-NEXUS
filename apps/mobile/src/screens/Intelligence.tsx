/**
 * Intelligence (§6).
 *
 * Evidence is available but not overwhelming: each timeframe is one compact
 * row showing regime, freshness and sample count; the narrative and its
 * evidence lines expand on demand. Everything shown comes from the
 * deterministic engine — nothing on this screen is generated, inferred, or
 * smoothed by the client.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, font, freshnessColor, radius, space, type as typeScale } from "@nexus/design";
import type { EntityRef, ExplainedScore, TimeframeSummary } from "@nexus/contracts";
import { api } from "../api/queries.ts";
import { intelligenceStore } from "../state/stores.ts";
import { useRemote } from "../state/useStore.ts";
import { Card, EmptyState, ErrorState, LoadingState, SectionHeader, StaleBar } from "../components/primitives.tsx";

export function IntelligenceScreen({ entity }: { entity: EntityRef }) {
  const [expanded, setExpanded] = useState(false);
  const { data, error, loading, receivedAt, refresh } = useRemote(
    intelligenceStore, () => api.intelligence(entity), [entity.kind, entity.id],
  );
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  if (loading && !data) return <Shell><LoadingState label="Analysing" /></Shell>;
  if (error && !data) return <Shell><ErrorState error={error} onRetry={onRefresh} /></Shell>;
  if (!data) return <Shell><EmptyState title="No intelligence" /></Shell>;

  const noEvidence = data.primaryTimeframe === null;

  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={color.accent.default} />}>

        {error ? <StaleBar message={error.message} receivedAt={receivedAt} /> : null}

        <Text style={styles.entity}>{data.entity.label}</Text>
        <Text style={styles.method}>
          {/* Truthful labelling: this engine is deterministic, and says so. */}
          DETERMINISTIC ANALYSIS
          {data.primaryTimeframe ? ` · PRIMARY ${data.primaryTimeframe.toUpperCase()}` : ""}
        </Text>

        {noEvidence ? (
          <Card accent={color.freshness.UNAVAILABLE}>
            <Text style={styles.unavailableTitle}>INTELLIGENCE UNAVAILABLE</Text>
            <Text style={styles.unavailableBody}>
              {data.risk.unavailableReason
                ?? "No timeframe carried enough validated evidence to support a verdict."}
            </Text>
          </Card>
        ) : (
          <View style={styles.scoreGrid}>
            <ScoreTile label="Opportunity" score={data.opportunity} tint={color.freshness.LIVE} />
            <ScoreTile label="Risk" score={data.risk} tint={color.severity.WARNING} />
            <ScoreTile label="Signal" score={data.signalStrength} tint={color.accent.default} />
          </View>
        )}

        <SectionHeader title="Timeframes" />
        <Card>
          {data.timeframes.map((tf) => <TimeframeRow key={tf.timeframe} summary={tf} />)}
        </Card>

        {data.explanation ? (
          <>
            <SectionHeader
              title="Explanation"
              action={{ label: expanded ? "Hide evidence" : "Show evidence", onPress: () => setExpanded((v) => !v) }}
            />
            <Card>
              <Text style={styles.explanation}>{data.explanation}</Text>
              {expanded ? (
                <View style={styles.evidence}>
                  {data.evidence.length === 0 ? (
                    <Text style={styles.evidenceEmpty}>No evidence lines were produced.</Text>
                  ) : (
                    data.evidence.map((line, i) => (
                      <View key={i} style={styles.evidenceRow}>
                        <View style={styles.evidenceDot} />
                        <Text style={styles.evidenceText}>{line}</Text>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Shell>
  );
}

function ScoreTile({ label, score, tint }: { label: string; score: ExplainedScore; tint: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label.toUpperCase()}</Text>
      {score.value === null ? (
        <>
          <Text style={styles.tileEmpty}>—</Text>
          <Text style={styles.tileReason} numberOfLines={2}>{score.unavailableReason ?? "Not measurable."}</Text>
        </>
      ) : (
        <>
          <Text style={[styles.tileValue, { color: tint }]}>{Math.round(score.value)}</Text>
          <Text style={styles.tileCoverage}>{Math.round(score.coveragePercent)}% coverage</Text>
        </>
      )}
    </View>
  );
}

function TimeframeRow({ summary }: { summary: TimeframeSummary }) {
  const tint = freshnessColor(summary.origin.freshness);
  return (
    <View style={styles.tfRow}>
      <Text style={styles.tfName}>{summary.timeframe.toUpperCase()}</Text>
      <View style={styles.tfMiddle}>
        <Text style={[styles.tfRegime, !summary.usable && { color: color.text.tertiary }]} numberOfLines={1}>
          {summary.regime ?? "No regime classified"}
        </Text>
        {/* Sample count is the reader's own coverage check. */}
        <Text style={styles.tfSamples}>{summary.sampleCount} candles</Text>
      </View>
      <View style={[styles.tfDot, { backgroundColor: tint }]} />
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.shell} edges={["top"]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg.base },
  scroll: { padding: space.lg, paddingBottom: space.xxxl },
  entity: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.title.size },
  method: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 1, marginBottom: space.lg },
  scoreGrid: { flexDirection: "row", gap: space.sm },
  tile: { flex: 1, backgroundColor: color.bg.raised, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border.subtle, padding: space.md, gap: space.xxs },
  tileLabel: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 0.8 },
  tileValue: { fontFamily: font.mono.medium, fontSize: typeScale.metric.size, fontVariant: ["tabular-nums"] },
  tileEmpty: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.metric.size },
  tileCoverage: { color: color.text.tertiary, fontSize: typeScale.micro.size },
  tileReason: { color: color.text.tertiary, fontSize: typeScale.micro.size, lineHeight: 14 },
  unavailableTitle: { color: color.text.tertiary, fontFamily: font.sans.semibold, fontSize: typeScale.caption.size, letterSpacing: 1.2 },
  unavailableBody: { color: color.text.secondary, fontSize: typeScale.caption.size, lineHeight: 18 },
  tfRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  tfName: { color: color.text.primary, fontFamily: font.mono.medium, fontSize: typeScale.caption.size, width: 36 },
  tfMiddle: { flex: 1 },
  tfRegime: { color: color.text.secondary, fontSize: typeScale.caption.size },
  tfSamples: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.micro.size },
  tfDot: { width: 8, height: 8, borderRadius: 4 },
  explanation: { color: color.text.secondary, fontSize: typeScale.body.size, lineHeight: 22 },
  evidence: { gap: space.sm, marginTop: space.sm, borderTopWidth: 1, borderTopColor: color.border.subtle, paddingTop: space.md },
  evidenceRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  evidenceDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.accent.default, marginTop: 7 },
  evidenceText: { color: color.text.tertiary, fontSize: typeScale.caption.size, lineHeight: 18, flexShrink: 1 },
  evidenceEmpty: { color: color.text.tertiary, fontSize: typeScale.micro.size },
});
