import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { BusinessConfig } from "@/types/business";

type TaxForm = NonNullable<BusinessConfig["taxSettings"]>;

const defaults: TaxForm = {
  taxName: "VAT",
  taxPercentage: 0,
  taxNumber: "",
  taxEnabled: false
};

export function TaxSettingsScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManage = useAuthStore((state) => state.can("settings.manage"));
  const [form, setForm] = useState<TaxForm>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(false);
    try {
      const config = await businessService.config(businessId);
      setForm({ ...defaults, ...config.taxSettings, taxNumber: config.taxSettings?.taxNumber ?? config.business.taxNumber ?? "" });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!businessId || saving) return;
    setSaving(true);
    try {
      await businessService.updateTaxSettings(businessId, {
        ...form,
        taxPercentage: Number(form.taxPercentage) || 0
      });
      Alert.alert("Saved", "Tax settings updated.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save tax settings.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading tax settings" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title="Tax Settings" onBack={() => navigation.goBack()}>
      <SectionTitle title="Tax Information" />
      <Card style={styles.form}>
        <Input label="Tax Name" value={form.taxName} onChangeText={(taxName) => setForm((current) => ({ ...current, taxName }))} editable={canManage} />
        <Input label="Tax Percentage" value={String(form.taxPercentage)} onChangeText={(taxPercentage) => setForm((current) => ({ ...current, taxPercentage }))} keyboardType="decimal-pad" editable={canManage} />
        <Input label="Tax Number" value={form.taxNumber ?? ""} onChangeText={(taxNumber) => setForm((current) => ({ ...current, taxNumber }))} editable={canManage} />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Enable Tax</Text>
          <Switch value={form.taxEnabled} disabled={!canManage} onValueChange={(taxEnabled) => setForm((current) => ({ ...current, taxEnabled }))} thumbColor={form.taxEnabled ? colors.primary : colors.surface} trackColor={{ false: colors.borderLight, true: colors.secondaryBg }} />
        </View>
      </Card>

      {!canManage ? <Text style={styles.note}>You do not have permission to update tax settings.</Text> : null}
      <Button label="Save Changes" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { ...typography.subtitle, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textMuted }
});
