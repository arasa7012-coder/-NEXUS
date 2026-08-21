/**
 * NEXUS application root.
 *
 * NOT VERIFIED IN THIS ENVIRONMENT — expo and react-native cannot be installed
 * here, so this has never been bundled or rendered.
 */

import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { color } from "@nexus/design";
import { RootNavigator, nexusNavigationTheme } from "./src/app/navigation.tsx";

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Dark-first: the status bar matches the instrument-panel ground. */}
      <StatusBar style="light" backgroundColor={color.bg.base} />
      <NavigationContainer theme={nexusNavigationTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
