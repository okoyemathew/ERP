import "react-native-gesture-handler";
import React from "react";
import { Platform, UIManager } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { I18nProvider, installI18nTextPatch } from "./src/i18n";

installI18nTextPatch();

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <RootNavigator />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
