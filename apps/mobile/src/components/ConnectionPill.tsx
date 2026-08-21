/**
 * Realtime connection indicator (§11 of the hardening brief).
 *
 * Deliberately understated. When the stream is healthy it is a single small
 * dot — confidence without clutter. It only earns words when something is
 * wrong, because that is the only time the user needs to act on it.
 *
 * The distinction that matters: OFFLINE means the screen is no longer updating
 * itself. Hiding that would let a frozen screen pass for a calm one.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, font, radius, space, type as typeScale } from "@nexus/design";
import type { ConnectionState } from "../api/realtime.ts";
import { connectionStore } from "../state/stores.ts";
import { useStore } from "../state/useStore.ts";

const PRESENTATION: Record<ConnectionState, { tint: string; label: string | null }> = {
  // Healthy: a dot, no text.
  OPEN: { tint: color.freshness.LIVE, label: null },
  CONNECTING: { tint: color.text.tertiary, label: "Connecting" },
  RECONNECTING: { tint: color.severity.WARNING, label: "Reconnecting" },
  OFFLINE: { tint: color.severity.CRITICAL, label: "Offline" },
  IDLE: { tint: color.text.tertiary, label: null },
};

export function ConnectionPill() {
  const state = useStore(connectionStore);
  const { tint, label } = PRESENTATION[state];

  return (
    <View style={[styles.pill, label !== null && styles.pillLabelled]}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      {label ? <Text style={[styles.text, { color: tint }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: space.xs },
  pillLabelled: {
    borderRadius: radius.pill, paddingHorizontal: space.sm,
    paddingVertical: space.xxs, backgroundColor: color.bg.overlay,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 0.4 },
});
