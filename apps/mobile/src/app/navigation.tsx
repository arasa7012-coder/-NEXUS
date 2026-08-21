/**
 * Application navigation (§14).
 *
 * Native stack + bottom tabs. Five tabs, because a bottom bar stops being
 * usable past five and because everything else in NEXUS is reached
 * *contextually* from an entity rather than needing its own tab. Entities,
 * global search and settings are reached from the Command Center and from the
 * entities they belong to — which is what stops primary navigation growing
 * with every future module.
 *
 * The root gate is the session: an unauthenticated user sees Login and nothing
 * else, so no screen can ever mount without a token to fetch with.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — react-navigation is not installable here.
 */

import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { Theme } from "@react-navigation/native";
import { color, font, type as typeScale } from "@nexus/design";
import type { EntityRef } from "@nexus/contracts";
import { CommandCenterScreen } from "../screens/CommandCenter.tsx";
import { AlertsScreen } from "../screens/Alerts.tsx";
import { IntelligenceScreen } from "../screens/Intelligence.tsx";
import { RiskScreen } from "../screens/Risk.tsx";
import { MonitoringScreen } from "../screens/Monitoring.tsx";
import { MonitorEditorScreen } from "../screens/MonitorEditor.tsx";
import { LoginScreen } from "../screens/Login.tsx";
import { sessionStore } from "../state/stores.ts";
import { useStore } from "../state/useStore.ts";
import { startRealtime, stopRealtime } from "../api/realtimeBinding.ts";

export type RootStackParamList = {
  Tabs: undefined;
  AlertDetail: { alertId: string };
  EntityDetail: { entity: EntityRef };
  MonitorEditor: { monitorId?: string; target: EntityRef };
};

export type TabParamList = {
  Command: undefined;
  Intelligence: undefined;
  Risk: undefined;
  Monitoring: undefined;
  Alerts: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

export const nexusNavigationTheme: Theme = {
  dark: true,
  colors: {
    primary: color.accent.default,
    background: color.bg.base,
    card: color.bg.raised,
    text: color.text.primary,
    border: color.border.subtle,
    notification: color.severity.CRITICAL,
  },
  fonts: {
    regular: { fontFamily: font.sans.regular, fontWeight: "400" },
    medium: { fontFamily: font.sans.medium, fontWeight: "500" },
    bold: { fontFamily: font.sans.semibold, fontWeight: "600" },
    heavy: { fontFamily: font.sans.semibold, fontWeight: "700" },
  },
};

/**
 * Until entity selection exists, Intelligence and Risk need a subject. This is
 * a navigation default, not fabricated data: the screens fetch it from the API
 * exactly like any other entity, and render UNAVAILABLE if it cannot be served.
 */
const DEFAULT_ENTITY: EntityRef = { kind: "ASSET", id: "BTCUSDT", label: "Bitcoin / USDT" };

function TabNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent.default,
        tabBarInactiveTintColor: color.text.tertiary,
        tabBarStyle: { backgroundColor: color.bg.raised, borderTopColor: color.border.subtle },
        tabBarLabelStyle: { fontFamily: font.sans.medium, fontSize: typeScale.micro.size },
      }}
    >
      <Tabs.Screen name="Command">
        {({ navigation }) => (
          <CommandCenterScreen
            onOpenAlert={() => {}}
            onOpenMonitors={() => navigation.navigate("Monitoring")}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Intelligence">
        {() => <IntelligenceScreen entity={DEFAULT_ENTITY} />}
      </Tabs.Screen>
      <Tabs.Screen name="Risk">
        {() => <RiskScreen entity={DEFAULT_ENTITY} />}
      </Tabs.Screen>
      <Tabs.Screen name="Monitoring">
        {({ navigation }) => (
          <MonitoringScreen
            onCreate={() => navigation.navigate("MonitorEditor", { target: DEFAULT_ENTITY })}
            onEdit={(monitor) =>
              navigation.navigate("MonitorEditor", { monitorId: monitor.id, target: monitor.target })}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Alerts">
        {() => <AlertsScreen onOpen={() => {}} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const session = useStore(sessionStore);

  // The realtime stream is bound to the session lifetime: it opens once
  // authenticated and is torn down on sign-out, so a revoked token can never
  // leave a stream running.
  useEffect(() => {
    if (session.status === "AUTHENTICATED") {
      void startRealtime();
      return () => { stopRealtime(); };
    }
    stopRealtime();
    return undefined;
  }, [session.status]);

  if (session.status !== "AUTHENTICATED") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.base } }}>
        <Stack.Screen name="Tabs" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.base } }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="MonitorEditor" options={{ presentation: "modal" }}>
        {({ route, navigation }) => (
          <MonitorEditorScreen
            target={route.params.target}
            onSaved={() => navigation.goBack()}
            onCancel={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
