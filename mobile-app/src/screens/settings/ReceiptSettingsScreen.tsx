import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { BusinessConfig } from "@/types/business";

type ReceiptForm = NonNullable<BusinessConfig["receiptSettings"]>;

const defaults: ReceiptForm = {
  businessName: "",
  businessAddress: "",
  businessPhone: "",
  footerMessage: "",
  showLogo: true,
  autoPrint: false,
  paperWidth: "80mm"
};

export function ReceiptSettingsScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManage = useAuthStore((state) => state.can("receipt.manage"));
  const [form, setForm] = useState<ReceiptForm>(defaults);
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
        ...defaults,
        businessName: config.receiptSettings?.businessName ?? config.business.name,
        businessAddress: config.receiptSettings?.businessAddress ?? config.business.address ?? "",
        businessPhone: config.receiptSettings?.businessPhone ?? config.business.phone ?? "",
        footerMessage: config.receiptSettings?.footerMessage ?? "",
        showLogo: config.receiptSettings?.showLogo ?? true,
        autoPrint: config.receiptSettings?.autoPrint ?? false,
        paperWidth: config.receiptSettings?.paperWidth ?? "80mm"
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
      Alert.alert("Saved", "Receipt settings updated.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save receipt settings.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading receipt settings" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title="Receipt Settings" onBack={() => navigation.goBack()}>
      <SectionTitle title="Receipt Information" />
      <Card style={styles.form}>
        <Input label="Receipt Business Name" value={form.businessName ?? ""} onChangeText={(businessName) => setForm((current) => ({ ...current, businessName }))} editable={canManage} />
        <Input label="Receipt Address" value={form.businessAddress ?? ""} onChangeText={(businessAddress) => setForm((current) => ({ ...current, businessAddress }))} editable={canManage} />
        <Input label="Receipt Phone" value={form.businessPhone ?? ""} onChangeText={(businessPhone) => setForm((current) => ({ ...current, businessPhone }))} editable={canManage} />
        <Input label="Footer Message" value={form.footerMessage ?? ""} onChangeText={(footerMessage) => setForm((current) => ({ ...current, footerMessage }))} editable={canManage} />
        <Input label="Paper Width" value={form.paperWidth} onChangeText={(paperWidth) => setForm((current) => ({ ...current, paperWidth }))} editable={canManage} />
      </Card>

      <SectionTitle title="Printing" />
      <Card style={styles.form}>
        <ToggleRow label="Show Logo" value={form.showLogo} disabled={!canManage} onValueChange={(showLogo) => setForm((current) => ({ ...current, showLogo }))} />
        <ToggleRow label="Auto Print" value={form.autoPrint} disabled={!canManage} onValueChange={(autoPrint) => setForm((current) => ({ ...current, autoPrint }))} />
      </Card>

      {!canManage ? <Text style={styles.note}>You do not have permission to update receipt settings.</Text> : null}
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
