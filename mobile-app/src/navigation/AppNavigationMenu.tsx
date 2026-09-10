import React, { createContext, useCallback, useContext, useState } from "react";
import { StyleSheet, View } from "react-native";
import { DrawerMenu } from "@/components/common/DrawerMenu";
import { useAuthStore } from "@/store/authStore";
import type { AppStackParamList } from "@/types/navigation.types";
import { appRoleForUser } from "@/utils/permissions";
import { navigationRef } from "./navigationRef";

type AppNavigationMenuContextValue = {
  openMenu: () => void;
};

const AppNavigationMenuContext =
  createContext<AppNavigationMenuContextValue | null>(null);

export function useAppNavigationMenu() {
  return useContext(AppNavigationMenuContext);
}

export function AppNavigationMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const role = appRoleForUser(user);

  const openMenu = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const navigate = useCallback((route: keyof AppStackParamList) => {
    setDrawerOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate(route as never);
    }
  }, []);

  const signOut = useCallback(() => {
    setDrawerOpen(false);
    void logout();
  }, [logout]);

  return (
    <AppNavigationMenuContext.Provider value={{ openMenu }}>
      <View style={styles.container}>
        {children}
        <DrawerMenu
          open={drawerOpen}
          role={role}
          onClose={() => setDrawerOpen(false)}
          onLogout={signOut}
          onNavigate={navigate}
        />
      </View>
    </AppNavigationMenuContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
