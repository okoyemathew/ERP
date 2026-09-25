import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ScreenHeader, SearchBar } from "@/components/common";
import { languageOptions, Text, useTranslation } from "@/i18n";
import { colors } from "@/theme";

export function LanguageScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { locale, setLocale } = useTranslation();
  const [selected, setSelected] = useState(locale);
  const [search, setSearch] = useState("");
  const filteredLanguages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? languageOptions.filter((language) => `${language.name} ${language.country}`.toLocaleLowerCase().includes(query)) : languageOptions;
  }, [search]);

  useEffect(() => {
    setSelected(locale);
  }, [locale]);

  const selectLanguage = (nextLocale: string) => {
    setSelected(nextLocale);
    void setLocale(nextLocale);
  };

  const continueToOnboarding = async () => {
    await setLocale(selected);
    navigation.navigate("Onboarding");
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Choose Language" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        <Text style={styles.subtitle}>Select your preferred language to continue</Text>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search languages or countries" />
        <View style={styles.grid}>
          {filteredLanguages.map((language) => (
            <Pressable key={`${language.locale}-${language.country}`} style={[styles.card, selected === language.locale && styles.selected]} onPress={() => selectLanguage(language.locale)} accessibilityLabel={`Select ${language.name}`}>
              <Text style={styles.flag}>{language.locale.toUpperCase()}</Text>
              <Text style={[styles.name, selected === language.locale && styles.selectedText]}>{language.name}</Text>
              <Text style={styles.country}>{language.country}</Text>
              <Text style={styles.select}>Select</Text>
              {selected === language.locale ? (
                <View style={styles.check}>
                  <Check size={11} color={colors.surface} />
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
        <Button label="Continue" onPress={continueToOnboarding} style={styles.button} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: 20 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    width: "48%",
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.borderLighter,
    backgroundColor: colors.inputBg,
    padding: 16
  },
  selected: { borderColor: colors.primary, backgroundColor: "#EFF6FF" },
  flag: { fontSize: 26, marginBottom: 12 },
  name: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  country: { color: colors.textPlaceholder, fontSize: 10, marginTop: 2 },
  selectedText: { color: colors.primary },
  select: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  check: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  button: { marginTop: "auto" }
});
