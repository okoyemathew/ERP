import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { themePreferenceService, type ThemePreference } from "@/services/theme-preference.service";

export type AppColorScheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  colorScheme: AppColorScheme;
  loading: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [loading, setLoading] = useState(true);
  const colorScheme: AppColorScheme = preference === "system"
    ? systemColorScheme === "dark" ? "dark" : "light"
    : preference;

  useEffect(() => {
    let mounted = true;
    void themePreferenceService.get()
      .catch((): ThemePreference => "light")
      .then((storedPreference) => {
        if (!mounted) return;
        setPreferenceState(storedPreference);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    await themePreferenceService.set(nextPreference);
    setPreferenceState(nextPreference);
  }, []);

  const value = useMemo(() => ({ preference, colorScheme, loading, setPreference }), [preference, colorScheme, loading, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useAppTheme must be used within ThemeProvider");
  return context;
}
