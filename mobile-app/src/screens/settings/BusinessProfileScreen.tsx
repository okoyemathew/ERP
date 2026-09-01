import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { BusinessConfig } from "@/types/business";
import { DEFAULT_BUSINESS_CURRENCY, SUPPORTED_CURRENCIES, getCurrencyOption } from "@/utils/currency";

type BusinessForm = BusinessConfig["business"] & {
  language: string;
  allowCreditSales: boolean;
  allowNegativeStock: boolean;
  enableOfflineMode: boolean;
};

function emptyForm(businessId: string): BusinessForm {
  return {
    id: businessId,
    name: "",
    about: null,
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    taxNumber: "",
    registrationNo: "",
    logo: null,
    currency: DEFAULT_BUSINESS_CURRENCY,
    timezone: "UTC",
    language: "en",
    allowCreditSales: true,
    allowNegativeStock: false,
    enableOfflineMode: true
  };
}

export function BusinessProfileScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManageBusiness = useAuthStore((state) => state.can("businesses.manage"));
  const canManageSettings = useAuthStore((state) => state.can("settings.manage"));
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const [form, setForm] = useState<BusinessForm>(() => emptyForm(businessId ?? ""));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(false);
    try {
      const config = await businessService.config(businessId);
      setForm({
        ...emptyForm(businessId),
        ...config.business,
        language: config.settings?.language ?? "en",
        allowCreditSales: config.settings?.allowCreditSales ?? true,
        allowNegativeStock: config.settings?.allowNegativeStock ?? false,
        enableOfflineMode: config.settings?.enableOfflineMode ?? true,
        currency: config.settings?.currency ?? config.business.currency,
        timezone: config.settings?.timezone ?? config.business.timezone
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (field: keyof BusinessForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const selectedCurrency = getCurrencyOption(form.currency);

  const save = async () => {
    if (!businessId || saving) return;
    if (!canManageBusiness && !canManageSettings) {
      Alert.alert("Permission required", "You do not have permission to update business settings.");
      return;
    }
    setSaving(true);
    try {
      if (canManageBusiness) {
        await businessService.updateBusiness(businessId, {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          country: form.country || null,
          postalCode: form.postalCode || null,
          taxNumber: form.taxNumber || null,
          registrationNo: form.registrationNo || null,
          currency: form.currency,
          timezone: form.timezone
        });
      }
      if (canManageSettings) {
        await businessService.updateSettings(businessId, {
          currency: form.currency,
          timezone: form.timezone,
          language: form.language,
          allowCreditSales: form.allowCreditSales,
          allowNegativeStock: form.allowNegativeStock,
          enableOfflineMode: form.enableOfflineMode
        });
      }
      await refreshProfile();
      Alert.alert("Saved", "Business settings updated.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save business settings.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading business" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title="Business Profile" onBack={() => navigation.goBack()}>
      <SectionTitle title="Business Information" />
      <Card style={styles.form}>
        <Input label="Business Name" value={form.name} onChangeText={(value) => setField("name", value)} editable={canManageBusiness} />
        <Input label="Email" value={form.email ?? ""} onChangeText={(value) => setField("email", value)} keyboardType="email-address" autoCapitalize="none" editable={canManageBusiness} />
        <Input label="Phone" value={form.phone ?? ""} onChangeText={(value) => setField("phone", value)} keyboardType="phone-pad" editable={canManageBusiness} />
        <Input label="Address" value={form.address ?? ""} onChangeText={(value) => setField("address", value)} editable={canManageBusiness} />
        <Input label="City" value={form.city ?? ""} onChangeText={(value) => setField("city", value)} editable={canManageBusiness} />
        <Input label="Country" value={form.country ?? ""} onChangeText={(value) => setField("country", value)} editable={canManageBusiness} />
      </Card>

      <SectionTitle title="Currency and Tax Identity" />
      <Card style={styles.form}>
        <View style={styles.currencyHeader}>
          <Text style={styles.currencyLabel}>Currency</Text>
          <Text style={styles.currencyValue}>{selectedCurrency.code} - {selectedCurrency.symbol}</Text>
        </View>
        <View style={styles.currencyOptions}>
          {SUPPORTED_CURRENCIES.map((currency) => {
            const selected = currency.code === selectedCurrency.code;
            return (
              <Pressable
                key={currency.code}
                onPress={() => setField("currency", currency.code)}
                disabled={!canManageBusiness && !canManageSettings}
                style={[styles.currencyOption, selected && styles.currencyOptionSelected, (!canManageBusiness && !canManageSettings) && styles.disabledOption]}
                accessibilityRole="button"
                accessibilityLabel={`Select ${currency.code} ${currency.name}`}
              >
                <Text style={[styles.currencyCode, selected && styles.currencyCodeSelected]}>{currency.code}</Text>
                <Text style={styles.currencyName}>{currency.name}</Text>
                <Text style={styles.currencySymbol}>{currency.symbol}</Text>
              </Pressable>
            );
          })}
        </View>
        <Input label="Timezone" value={form.timezone} onChangeText={(value) => setField("timezone", value)} editable={canManageBusiness || canManageSettings} />
        <Input label="Tax Number" value={form.taxNumber ?? ""} onChangeText={(value) => setField("taxNumber", value)} editable={canManageBusiness} />
        <Input label="Registration Number" value={form.registrationNo ?? ""} onChangeText={(value) => setField("registrationNo", value)} editable={canManageBusiness} />
      </Card>

      {!canManageBusiness && !canManageSettings ? <Text style={styles.note}>You do not have permission to update business settings.</Text> : null}
      <Button label="Save Changes" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  note: { ...typography.caption, color: colors.textMuted },
  currencyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  currencyLabel: { ...typography.caption, color: colors.textMuted },
  currencyValue: { ...typography.subtitle, color: colors.foreground, fontWeight: "800" },
  currencyOptions: { gap: 8 },
  currencyOption: { minHeight: 52, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  currencyOptionSelected: { borderColor: colors.primary, backgroundColor: colors.secondaryBg },
  disabledOption: { opacity: 0.62 },
  currencyCode: { width: 36, color: colors.textSecondary, fontSize: 12, fontWeight: "900" },
  currencyCodeSelected: { color: colors.primary },
  currencyName: { flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  currencySymbol: { color: colors.foreground, fontSize: 12, fontWeight: "900" }
});
