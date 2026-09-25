import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ScreenHeader, SearchBar } from "@/components/common";
import { languageOptions, Text, useTranslation } from "@/i18n";
import { colors, typography } from "@/theme";

export function LanguageScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { locale, setLocale } = useTranslation();
  const [selected, setSelected] = useState(locale);
  const [search, setSearch] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);
  const selectedLanguage = languageOptions.find((language) => language.locale === selected) ?? languageOptions[0];
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
    setSearch("");
    setPickerVisible(false);
  };

  const continueToOnboarding = async () => {
    await setLocale(selected);
    navigation.navigate("Onboarding");
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Choose Language" onBack={() => navigation.goBack()} />
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
        <Text style={styles.subtitle}>Select your preferred language to continue</Text>
        <Pressable style={styles.dropdown} onPress={() => setPickerVisible(true)} accessibilityRole="button" accessibilityLabel="Choose language">
          <View style={styles.selectedInfo}>
            <Text style={styles.languageName}>{selectedLanguage.name}</Text>
            <Text style={styles.countryName}>{selectedLanguage.country}</Text>
          </View>
          <ChevronDown size={20} color={colors.textMuted} />
        </Pressable>
        <Button label="Continue" onPress={continueToOnboarding} style={styles.button} />
      </View>

      <Modal visible={pickerVisible} animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={[styles.modal, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select language</Text>
            <Pressable onPress={() => { setPickerVisible(false); setSearch(""); }} accessibilityRole="button">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search languages or countries" />
          <FlatList
            data={filteredLanguages}
            keyExtractor={(item) => `${item.locale}-${item.country}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = selected === item.locale;
              return (
                <Pressable style={styles.option} onPress={() => selectLanguage(item.locale)} accessibilityRole="button" accessibilityLabel={`Select ${item.name}, ${item.country}`}>
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionName}>{item.name}</Text>
                    <Text style={styles.optionCountry}>{item.country}</Text>
                  </View>
                  {isSelected ? <Check size={19} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: 20 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 18 },
  dropdown: { minHeight: 58, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderLight, backgroundColor: colors.inputBg, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectedInfo: { gap: 3 },
  languageName: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  countryName: { color: colors.textMuted, fontSize: 12 },
  button: { marginTop: "auto" },
  modal: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20, gap: 14 },
  modalHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { ...typography.screenTitle, color: colors.foreground },
  close: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  option: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.borderLighter },
  optionInfo: { gap: 3 },
  optionName: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  optionCountry: { color: colors.textMuted, fontSize: 11 },
});
