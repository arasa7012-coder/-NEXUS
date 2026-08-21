/**
 * Monitor create / edit (§8).
 *
 * Progressive disclosure, deliberately. The default path is four decisions —
 * what to watch, what to look for, how sensitive, how often — and everything
 * else stays folded away. A monitoring product dies when configuring it feels
 * like filling in a form, so the advanced section is opt-in and the primary
 * action is reachable without ever opening it.
 *
 * Only monitor types the backend can actually execute are offered. Types
 * without a runner are absent rather than shown disabled — a control that
 * cannot work is worse than no control.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, font, MIN_TOUCH_TARGET, radius, space, type as typeScale } from "@nexus/design";
import { RISK_LEVELS } from "@nexus/contracts";
import type { EntityRef, Monitor, MonitorDraft, MonitorType, NexusError, RiskLevel } from "@nexus/contracts";
import { api } from "../api/queries.ts";
import { Card, ErrorState, SectionHeader } from "../components/primitives.tsx";

/** Only what a runner exists for. */
const TYPES: Array<{ value: MonitorType; label: string; blurb: string }> = [
  { value: "ASSET_INTELLIGENCE", label: "Asset", blurb: "Watch risk and signal strength on a market." },
  { value: "PROVIDER_HEALTH", label: "Data feed", blurb: "Watch a data provider for repeated failures." },
];

const INTERVALS = [
  { label: "1 min", seconds: 60 },
  { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "1 hour", seconds: 3600 },
];

export function MonitorEditorScreen({
  existing,
  target,
  onSaved,
  onCancel,
}: {
  existing?: Monitor;
  target: EntityRef;
  onSaved: (monitor: Monitor) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? `${target.label} watch`);
  const [type, setType] = useState<MonitorType>(existing?.type ?? "ASSET_INTELLIGENCE");
  const [intervalSeconds, setIntervalSeconds] = useState(existing?.intervalSeconds ?? 300);
  const [riskAtOrAbove, setRiskAtOrAbove] = useState<RiskLevel | null>(
    existing?.config.type === "ASSET_INTELLIGENCE" ? existing.config.riskAtOrAbove : "HIGH",
  );
  const [signalAtOrAbove, setSignalAtOrAbove] = useState<number | null>(
    existing?.config.type === "ASSET_INTELLIGENCE" ? existing.config.signalAtOrAbove : null,
  );
  const [onDataUnavailable, setOnDataUnavailable] = useState(
    existing?.config.type === "ASSET_INTELLIGENCE" ? existing.config.onDataUnavailable : false,
  );
  const [failuresAtOrAbove, setFailuresAtOrAbove] = useState(
    existing?.config.type === "PROVIDER_HEALTH" ? existing.config.failuresAtOrAbove : 3,
  );
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<NexusError | null>(null);
  const [busy, setBusy] = useState(false);

  const draft: MonitorDraft = {
    name: name.trim(),
    type,
    target,
    config:
      type === "ASSET_INTELLIGENCE"
        ? { type: "ASSET_INTELLIGENCE", riskAtOrAbove, signalAtOrAbove, onDataUnavailable }
        : { type: "PROVIDER_HEALTH", providerId: target.id, failuresAtOrAbove },
    intervalSeconds,
    enabled: existing?.enabled ?? true,
  };

  // Mirrors the server rule, so the user is told before the round trip rather
  // than after. The server remains authoritative — this is not a substitute.
  const hasTrigger =
    type === "PROVIDER_HEALTH"
    || riskAtOrAbove !== null || signalAtOrAbove !== null || onDataUnavailable;
  const canSave = name.trim().length > 0 && hasTrigger && !busy;

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = existing
      ? await api.updateMonitor(existing.id, draft)
      : await api.createMonitor(draft);
    setBusy(false);
    if (result.ok) onSaved(result.data);
    else setError(result.error);
  };

  return (
    <SafeAreaView style={styles.shell} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{existing ? "Edit monitor" : "New monitor"}</Text>
        <Text style={styles.subtitle}>{target.label}</Text>

        {error ? <ErrorState error={error} /> : null}

        <SectionHeader title="What to watch" />
        <Card>
          {TYPES.map((option) => (
            <Pressable key={option.value} onPress={() => setType(option.value)} style={styles.option}>
              <View style={[styles.radio, type === option.value && styles.radioOn]} />
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionBlurb}>{option.blurb}</Text>
              </View>
            </Pressable>
          ))}
        </Card>

        <SectionHeader title="Tell me when" />
        <Card>
          {type === "ASSET_INTELLIGENCE" ? (
            <>
              <Text style={styles.fieldLabel}>RISK REACHES</Text>
              <View style={styles.chips}>
                <Chip label="Off" active={riskAtOrAbove === null} onPress={() => setRiskAtOrAbove(null)} />
                {RISK_LEVELS.map((level) => (
                  <Chip key={level} label={level} active={riskAtOrAbove === level}
                    onPress={() => setRiskAtOrAbove(level)} />
                ))}
              </View>
              {!hasTrigger ? (
                <Text style={styles.warning}>
                  Choose at least one condition — a monitor with no trigger would never tell you anything.
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>AFTER CONSECUTIVE FAILURES</Text>
              <View style={styles.chips}>
                {[2, 3, 5, 10].map((n) => (
                  <Chip key={n} label={String(n)} active={failuresAtOrAbove === n}
                    onPress={() => setFailuresAtOrAbove(n)} />
                ))}
              </View>
            </>
          )}
        </Card>

        <SectionHeader title="How often" />
        <Card>
          <View style={styles.chips}>
            {INTERVALS.map((option) => (
              <Chip key={option.seconds} label={option.label}
                active={intervalSeconds === option.seconds}
                onPress={() => setIntervalSeconds(option.seconds)} />
            ))}
          </View>
        </Card>

        {/* Everything below is opt-in. The common path never opens it. */}
        <SectionHeader
          title="Advanced"
          action={{ label: advanced ? "Hide" : "Show", onPress: () => setAdvanced((v) => !v) }}
        />
        {advanced ? (
          <Card>
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} autoCorrect={false} />

            {type === "ASSET_INTELLIGENCE" ? (
              <>
                <Text style={styles.fieldLabel}>SIGNAL STRENGTH REACHES</Text>
                <View style={styles.chips}>
                  <Chip label="Off" active={signalAtOrAbove === null} onPress={() => setSignalAtOrAbove(null)} />
                  {[50, 70, 85].map((n) => (
                    <Chip key={n} label={String(n)} active={signalAtOrAbove === n}
                      onPress={() => setSignalAtOrAbove(n)} />
                  ))}
                </View>

                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text style={styles.optionLabel}>Tell me when data goes dark</Text>
                    <Text style={styles.optionBlurb}>
                      Alert when NEXUS cannot evaluate this asset at all.
                    </Text>
                  </View>
                  <Switch value={onDataUnavailable} onValueChange={setOnDataUnavailable}
                    trackColor={{ true: color.accent.muted, false: color.border.default }}
                    thumbColor={onDataUnavailable ? color.accent.default : color.text.tertiary} />
                </View>
              </>
            ) : null}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={[styles.button, styles.buttonGhost]}>
            <Text style={styles.buttonGhostText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={() => { void save(); }} disabled={!canSave}
            style={[styles.button, styles.buttonPrimary, !canSave && styles.buttonDisabled]}>
            <Text style={styles.buttonPrimaryText}>{busy ? "Saving…" : existing ? "Save" : "Create"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg.base },
  scroll: { padding: space.lg, paddingBottom: space.xxxl },
  title: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: typeScale.title.size },
  subtitle: { color: color.text.tertiary, fontFamily: font.mono.regular, fontSize: typeScale.caption.size },
  option: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.sm, minHeight: MIN_TOUCH_TARGET },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color.border.strong, marginTop: 2 },
  radioOn: { borderColor: color.accent.default, backgroundColor: color.accent.default },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { color: color.text.primary, fontFamily: font.sans.medium, fontSize: typeScale.body.size },
  optionBlurb: { color: color.text.tertiary, fontSize: typeScale.micro.size, lineHeight: 16 },
  fieldLabel: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 1, marginTop: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: { borderWidth: 1, borderColor: color.border.default, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, minHeight: 32, justifyContent: "center" },
  chipOn: { borderColor: color.accent.default, backgroundColor: color.accent.surface },
  chipText: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size },
  chipTextOn: { color: color.accent.default },
  warning: { color: color.severity.WARNING, fontSize: typeScale.micro.size, lineHeight: 16 },
  input: {
    minHeight: MIN_TOUCH_TARGET, backgroundColor: color.bg.inset, borderRadius: radius.md,
    borderWidth: 1, borderColor: color.border.default, paddingHorizontal: space.md,
    color: color.text.primary, fontSize: typeScale.body.size,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.sm },
  switchText: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.xl },
  button: { flex: 1, minHeight: MIN_TOUCH_TARGET, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  buttonGhost: { borderWidth: 1, borderColor: color.border.default },
  buttonGhostText: { color: color.text.secondary, fontFamily: font.sans.medium, fontSize: typeScale.body.size },
  buttonPrimary: { backgroundColor: color.accent.default },
  buttonPrimaryText: { color: color.text.inverse, fontFamily: font.sans.semibold, fontSize: typeScale.body.size },
  buttonDisabled: { opacity: 0.4 },
});
