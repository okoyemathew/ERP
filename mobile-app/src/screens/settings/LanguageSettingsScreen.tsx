import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Button, Card, SearchBar } from "@/components/common";
import { languageOptions, Text, useTranslation } from "@/i18n";
import { businessService } from "@/services/business.service";
import { ScrollScreen } from "@/screens/shared/ScreenKit";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme";

export function LanguageSettingsScreen({ navigation }: { navigation: any }) {
  const { locale, setLocale } = useTranslation();
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManageSettings = useAuthStore((state) => state.can("settings.manage"));
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const [selected, setSelected] = useState(locale);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(locale);
  }, [locale]);

  const filteredLanguages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? languageOptions.filter((language) => `${language.name} ${language.country}`.toLocaleLowerCase().includes(query)) : languageOptions;
  }, [search]);

  const selectLanguage = async (nextLocale: string) => {
    setSelected(nextLocale);
    await setLocale(nextLocale);
  };

  const save = async () => {
    setSaving(true);
    try {
      await setLocale(selected);

      if (businessId && canManageSettings) {
        await businessService.updateSettings(businessId, { language: selected });
        await refreshProfile();
      }

      Alert.alert("Saved", "Language settings updated.");
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save language settings.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollScreen title="Language" onBack={() => navigation.goBack()}>
      <Text style={styles.subtitle}>Select your preferred language to continue</Text>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search languages or countries" />
      <View style={styles.grid}>
        {filteredLanguages.map((language) => {
          const active = selected === language.locale;
          return (
            <Pressable key={`${language.locale}-${language.country}`} onPress={() => void selectLanguage(language.locale)} accessibilityRole="button" accessibilityLabel={`Select ${language.name}`}>
              <Card style={[styles.card, active && styles.selected]}>
                <Text style={styles.code}>{language.locale.toUpperCase()}</Text>
                <View style={styles.body}>
                  <Text style={[styles.name, active && styles.selectedText]}>{language.name}</Text>
                  <Text style={styles.select}>{language.country}</Text>
                </View>
                {active ? (
                  <View style={styles.check}>
                    <Check size={11} color={colors.surface} />
                  </View>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
      </View>
      <Button label="Save Changes" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.textMuted, fontSize: 13 },
  grid: { gap: 12 },
  card: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 2, borderColor: colors.borderLighter },
  selected: { borderColor: colors.primary, backgroundColor: "#EFF6FF" },
  code: { width: 44, color: colors.foreground, fontSize: 24, fontWeight: "900" },
  body: { flex: 1 },
  name: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  selectedText: { color: colors.primary },
  select: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3, fontWeight: "700" },
  check: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }
});
