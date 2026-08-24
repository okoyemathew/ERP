import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { BusinessConfig } from "@/types/business";

type PrinterForm = Pick<NonNullable<BusinessConfig["receiptSettings"]>, "autoPrint" | "paperWidth" | "showLogo">;

const defaults: PrinterForm = {
  autoPrint: false,
  paperWidth: "80mm",
  showLogo: true
};

export function PrinterSettingsScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManage = useAuthStore((state) => state.can("receipt.manage"));
  const [form, setForm] = useState<PrinterForm>(defaults);
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
        autoPrint: config.receiptSettings?.autoPrint ?? defaults.autoPrint,
        paperWidth: config.receiptSettings?.paperWidth ?? defaults.paperWidth,
        showLogo: config.receiptSettings?.showLogo ?? defaults.showLogo
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

  const save = async () => {
    if (!businessId || saving) return;
    setSaving(true);
    try {
      await businessService.updateReceiptSettings(businessId, form);
      Alert.alert("Saved", "Printer settings updated.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save printer settings.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading printer settings" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title="Printer Settings" onBack={() => navigation.goBack()}>
      <SectionTitle title="Receipt Printer" />
      <Card style={styles.form}>
        <Input label="Paper Width" value={form.paperWidth} onChangeText={(paperWidth) => setForm((current) => ({ ...current, paperWidth }))} editable={canManage} />
        <ToggleRow label="Auto Print" value={form.autoPrint} disabled={!canManage} onValueChange={(autoPrint) => setForm((current) => ({ ...current, autoPrint }))} />
        <ToggleRow label="Print Logo" value={form.showLogo} disabled={!canManage} onValueChange={(showLogo) => setForm((current) => ({ ...current, showLogo }))} />
      </Card>

      {!canManage ? <Text style={styles.note}>You do not have permission to update printer settings.</Text> : null}
      <Button label="Save Changes" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

function ToggleRow({ label, value, disabled, onValueChange }: { label: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} disabled={disabled} onValueChange={onValueChange} thumbColor={value ? colors.primary : colors.surface} trackColor={{ false: colors.borderLight, true: colors.secondaryBg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { ...typography.subtitle, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textMuted }
});
