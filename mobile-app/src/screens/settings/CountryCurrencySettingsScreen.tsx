import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Button, Card, CountrySelectField, ErrorState, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import { getCurrencyOption } from "@/utils/currency";
import { Text } from "@/i18n";

export function CountryCurrencySettingsScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManageBusiness = useAuthStore((state) => state.can("businesses.manage"));
  const canManageSettings = useAuthStore((state) => state.can("settings.manage"));
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(false);
    try {
      const config = await businessService.config(businessId);
      setCountry(config.business.country ?? "");
      setCurrency(config.settings?.currency ?? config.business.currency ?? "USD");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!businessId || saving) return;
    if (!canManageBusiness || !canManageSettings) {
      Alert.alert("Permission required", "You do not have permission to update country and currency settings.");
      return;
    }
    setSaving(true);
    try {
      await businessService.updateBusiness(businessId, { country, currency });
      await businessService.updateSettings(businessId, { currency });
      await refreshProfile();
      Alert.alert("Saved", "Country and currency settings updated.");
      navigation.goBack();
    } catch (saveError) {
      Alert.alert("Unable to save", saveError instanceof Error ? saveError.message : "Unable to update country and currency settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading settings" />;
  if (error) return <ErrorState onRetry={load} />;
  const currencyOption = getCurrencyOption(currency);

  return (
    <ScrollScreen title="Country & Currency" onBack={() => navigation.goBack()}>
      <SectionTitle title="Regional Settings" />
      <Card style={styles.form}>
        <CountrySelectField
          value={country}
          disabled={!canManageBusiness || !canManageSettings}
          onSelect={(option) => { setCountry(option.name); setCurrency(option.currency); }}
        />
        <View style={styles.currencyRow}>
          <View>
            <Text style={styles.label}>Currency</Text>
            <Text style={styles.value}>{currencyOption.code} · {currencyOption.name}</Text>
          </View>
          <Text style={styles.symbol}>{currencyOption.symbol}</Text>
        </View>
        <Text style={styles.note}>Currency updates automatically from the selected country.</Text>
      </Card>
      <Button label="Save Changes" loading={saving} onPress={save} disabled={!canManageBusiness || !canManageSettings} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  currencyRow: { minHeight: 58, borderRadius: 10, paddingHorizontal: 14, backgroundColor: colors.secondaryBg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...typography.caption, color: colors.textMuted, fontWeight: "700" },
  value: { color: colors.foreground, fontSize: 13, fontWeight: "800", marginTop: 3 },
  symbol: { color: colors.primary, fontSize: 22, fontWeight: "900" },
  note: { ...typography.caption, color: colors.textMuted },
});
