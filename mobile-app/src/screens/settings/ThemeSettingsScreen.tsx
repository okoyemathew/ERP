import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/i18n";
import { Button, Card, LoadingState } from "@/components/common";
import { ScrollScreen } from "@/screens/shared/ScreenKit";
import type { ThemePreference } from "@/services/theme-preference.service";
import { colors, typography } from "@/theme";
import { useAppTheme } from "@/theme/ThemeProvider";

const options: Array<{ label: string; value: ThemePreference; subtitle: string }> = [
  { label: "Light", value: "light", subtitle: "Always use light appearance" },
  { label: "Dark", value: "dark", subtitle: "Always use dark appearance" },
  { label: "System", value: "system", subtitle: "Follow your device appearance setting" }
];

export function ThemeSettingsScreen({ navigation }: { navigation: any }) {
  const { preference, loading, setPreference } = useAppTheme();
  const [selected, setSelected] = useState<ThemePreference>(preference);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(preference);
  }, [preference]);

  const save = async () => {
    setSaving(true);
    try {
      await setPreference(selected);
      Alert.alert("Saved", "Theme settings updated.");
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save theme settings.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading theme settings" />;

  return (
    <ScrollScreen title="Theme" onBack={() => navigation.goBack()}>
      <View style={styles.list}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <Pressable key={option.value} onPress={() => setSelected(option.value)} accessibilityRole="button" accessibilityLabel={`Select ${option.label} theme`}>
              <Card style={[styles.option, active && styles.selected]}>
                <View style={styles.optionBody}>
                  <Text style={styles.optionTitle}>{option.label}</Text>
                  <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                </View>
                {active ? (
                  <View style={styles.check}>
                    <Check size={12} color={colors.surface} />
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
  list: { gap: 12 },
  option: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: colors.borderLighter },
  selected: { borderColor: colors.primary, backgroundColor: "#EFF6FF" },
  optionBody: { flex: 1, gap: 4 },
  optionTitle: { ...typography.subtitle, color: colors.textSecondary, fontWeight: "800" },
  optionSubtitle: { ...typography.caption, color: colors.textMuted },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }
});
