/**
 * Authentication (§3).
 *
 * The screen holds no secret of any kind. It exchanges credentials for tokens
 * over HTTPS and hands them straight to expo-secure-store; no provider key,
 * signing key, or backend credential exists anywhere in the app bundle.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-native is not installable here.
 */

import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, font, MIN_TOUCH_TARGET, radius, space, type as typeScale } from "@nexus/design";
import { login } from "../api/session.ts";
import { sessionStore } from "../state/stores.ts";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await login(email, password);
    if (result.ok) {
      sessionStore.set({ status: "AUTHENTICATED", userId: result.userId, roles: result.roles });
    } else {
      // The server deliberately does not distinguish unknown-account from
      // wrong-password, and neither does this screen.
      setError(result.error.message);
    }
    setBusy(false);
  };

  const canSubmit = email.trim().length > 2 && password.length > 0 && !busy;

  return (
    <SafeAreaView style={styles.shell}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
        <View style={styles.brand}>
          <Text style={styles.wordmark}>NEXUS</Text>
          <Text style={styles.tagline}>Trading intelligence</Text>
        </View>

        <View style={styles.form}>
          <Field label="Email" value={email} onChange={setEmail}
            autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" />
          <Field label="Password" value={password} onChange={setPassword}
            secureTextEntry autoCapitalize="none" textContentType="password" />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => { void submit(); }}
            disabled={!canSubmit}
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
          >
            {busy ? <ActivityIndicator color={color.text.inverse} /> : <Text style={styles.buttonText}>Sign in</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void;
  secureTextEntry?: boolean; autoCapitalize?: "none"; keyboardType?: "email-address"; textContentType?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label.toUpperCase()}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        style={styles.input}
        placeholderTextColor={color.text.tertiary}
        secureTextEntry={props.secureTextEntry ?? false}
        autoCapitalize={props.autoCapitalize ?? "none"}
        autoCorrect={false}
        keyboardType={props.keyboardType ?? "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg.base },
  body: { flex: 1, justifyContent: "center", padding: space.xl, gap: space.xxxl },
  brand: { alignItems: "center", gap: space.xs },
  wordmark: { color: color.text.primary, fontFamily: font.sans.semibold, fontSize: 36, letterSpacing: 8 },
  tagline: { color: color.text.tertiary, fontSize: typeScale.caption.size, letterSpacing: 2 },
  form: { gap: space.lg },
  field: { gap: space.xs },
  fieldLabel: { color: color.text.tertiary, fontFamily: font.sans.medium, fontSize: typeScale.micro.size, letterSpacing: 1 },
  input: {
    minHeight: MIN_TOUCH_TARGET, backgroundColor: color.bg.raised, borderRadius: radius.md,
    borderWidth: 1, borderColor: color.border.default, paddingHorizontal: space.md,
    color: color.text.primary, fontSize: typeScale.body.size,
  },
  error: { color: color.severity.CRITICAL, fontSize: typeScale.caption.size },
  button: {
    minHeight: MIN_TOUCH_TARGET, borderRadius: radius.md, backgroundColor: color.accent.default,
    alignItems: "center", justifyContent: "center", marginTop: space.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: color.text.inverse, fontFamily: font.sans.semibold, fontSize: typeScale.body.size },
});
