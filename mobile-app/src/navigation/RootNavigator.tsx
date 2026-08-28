import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { AppNavigator } from "./AppNavigator";
import { AuthStack } from "./AuthStack";
import { offlineSyncService } from "@/services/offline-sync.service";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme";

export function RootNavigator() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const hasRestored = useAuthStore((state) => state.hasRestored);
  const authEntryRoute = useAuthStore((state) => state.authEntryRoute);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (!user) return undefined;
    return offlineSyncService.startAutoSync();
  }, [user]);

  if (!hasRestored && isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <StatusBar style="dark" />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style={user ? "dark" : "light"} />
      {user ? <AppNavigator /> : <AuthStack key={authEntryRoute} initialRouteName={authEntryRoute} />}
    </NavigationContainer>
  );
}
