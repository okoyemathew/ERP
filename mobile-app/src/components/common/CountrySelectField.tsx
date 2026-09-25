import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { colors, typography } from "@/theme";
import { countryOptions, type CountryOption } from "@/utils/countries";
import { Text } from "@/i18n";
import { SearchBar } from "./SearchBar";

type Props = {
  label?: string;
  value?: string | null;
  onSelect: (country: CountryOption) => void;
  disabled?: boolean;
};

export function CountrySelectField({ label = "Country", value, onSelect, disabled = false }: Props) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const countries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? countryOptions.filter((country) => `${country.name} ${country.code}`.toLocaleLowerCase().includes(query)) : countryOptions;
  }, [search]);

  const choose = (country: CountryOption) => {
    onSelect(country);
    setSearch("");
    setVisible(false);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable disabled={disabled} onPress={() => setVisible(true)} style={[styles.field, disabled && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Select ${label}`}>
        <Text style={[styles.value, !value && styles.placeholder]}>{value || "Select country"}</Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>Select country</Text>
            <Pressable onPress={() => setVisible(false)} accessibilityRole="button"><Text style={styles.close}>Close</Text></Pressable>
          </View>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search countries" />
          <FlatList
            data={countries}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.option} onPress={() => choose(item)} accessibilityRole="button" accessibilityLabel={`Select ${item.name}`}>
                <View style={styles.optionBody}>
                  <Text style={styles.optionName}>{item.name}</Text>
                  <Text style={styles.optionMeta}>{item.language} · {item.currency}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { ...typography.caption, color: colors.textTertiary, fontWeight: "600" },
  field: { minHeight: 50, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderLight, backgroundColor: colors.inputBg, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  disabled: { opacity: 0.62 },
  value: { ...typography.body, color: colors.foreground },
  placeholder: { color: colors.textPlaceholder },
  modal: { flex: 1, backgroundColor: colors.surface, padding: 20, gap: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...typography.screenTitle, color: colors.foreground },
  close: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  option: { minHeight: 58, justifyContent: "center", borderBottomWidth: 1, borderColor: colors.borderLighter },
  optionBody: { gap: 3 },
  optionName: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
  optionMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
});
