import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { BusinessConfig } from "@/types/business";

type NotificationForm = NonNullable<BusinessConfig["notificationSettings"]>;

const defaults: NotificationForm = {
  lowStockAlert: true,
  lowStockLevel: 5,
  dailySalesSummary: true,
  weeklySalesSummary: true,
  monthlySalesSummary: true,
  pushNotifications: true,
  emailNotifications: false
};

export function NotificationSettingsScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManage = useAuthStore((state) => state.can("notifications.manage"));
  const [form, setForm] = useState<NotificationForm>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(false);
    try {
      const config = await businessService.config(businessId);
      setForm({ ...defaults, ...config.notificationSettings });
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
      await businessService.updateNotificationSettings(businessId, {
        ...form,
        lowStockLevel: Number(form.lowStockLevel) || 0
      });
      Alert.alert("Saved", "Notification settings updated.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save notification settings.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading notification settings" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title="Notifications" onBack={() => navigation.goBack()}>
      <SectionTitle title="Alerts" />
      <Card style={styles.form}>
        <ToggleRow label="Low Stock Alert" value={form.lowStockAlert} disabled={!canManage} onValueChange={(lowStockAlert) => setForm((current) => ({ ...current, lowStockAlert }))} />
        <Input label="Low Stock Level" value={String(form.lowStockLevel)} onChangeText={(lowStockLevel) => setForm((current) => ({ ...current, lowStockLevel: Number(lowStockLevel) || 0 }))} keyboardType="number-pad" editable={canManage} />
      </Card>

      <SectionTitle title="Summaries" />
      <Card style={styles.form}>
        <ToggleRow label="Daily Sales Summary" value={form.dailySalesSummary} disabled={!canManage} onValueChange={(dailySalesSummary) => setForm((current) => ({ ...current, dailySalesSummary }))} />
        <ToggleRow label="Weekly Sales Summary" value={form.weeklySalesSummary} disabled={!canManage} onValueChange={(weeklySalesSummary) => setForm((current) => ({ ...current, weeklySalesSummary }))} />
        <ToggleRow label="Monthly Sales Summary" value={form.monthlySalesSummary} disabled={!canManage} onValueChange={(monthlySalesSummary) => setForm((current) => ({ ...current, monthlySalesSummary }))} />
      </Card>

      <SectionTitle title="Channels" />
      <Card style={styles.form}>
        <ToggleRow label="Push Notifications" value={form.pushNotifications} disabled={!canManage} onValueChange={(pushNotifications) => setForm((current) => ({ ...current, pushNotifications }))} />
        <ToggleRow label="Email Notifications" value={form.emailNotifications} disabled={!canManage} onValueChange={(emailNotifications) => setForm((current) => ({ ...current, emailNotifications }))} />
      </Card>

      {!canManage ? <Text style={styles.note}>You do not have permission to update notification settings.</Text> : null}
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
