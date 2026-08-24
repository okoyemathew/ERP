import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Button, ScreenHeader } from "@/components/common";
import { languageOptions, Text, useTranslation, type SupportedLocale } from "@/i18n";
import { colors } from "@/theme";

export function LanguageScreen({ navigation }: { navigation: any }) {
  const { locale, setLocale } = useTranslation();
  const [selected, setSelected] = useState<SupportedLocale>(locale);

  useEffect(() => {
    setSelected(locale);
  }, [locale]);

  const selectLanguage = (nextLocale: SupportedLocale) => {
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
      <View style={styles.content}>
        <Text style={styles.subtitle}>Select your preferred language to continue</Text>
        <View style={styles.grid}>
          {languageOptions.map((language) => (
            <Pressable key={language.locale} style={[styles.card, selected === language.locale && styles.selected]} onPress={() => selectLanguage(language.locale)} accessibilityLabel={`Select ${language.name}`}>
              <Text style={styles.flag}>{language.code}</Text>
              <Text style={[styles.name, selected === language.locale && styles.selectedText]}>{language.name}</Text>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: 20 },
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
