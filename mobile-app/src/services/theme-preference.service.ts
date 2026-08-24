import * as SecureStore from "expo-secure-store";

export type ThemePreference = "light" | "system";

const THEME_KEY = "nexpos.themePreference";

export const themePreferenceService = {
  async get(): Promise<ThemePreference> {
    const stored = await SecureStore.getItemAsync(THEME_KEY);
    return stored === "system" ? "system" : "light";
  },

  async set(theme: ThemePreference): Promise<void> {
    await SecureStore.setItemAsync(THEME_KEY, theme);
  }
};
