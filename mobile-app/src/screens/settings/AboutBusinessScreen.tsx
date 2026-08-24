import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";

const ABOUT_LIMIT = 2000;

export function AboutBusinessScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManage = useAuthStore((state) => state.can("businesses.manage"));
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const [businessName, setBusinessName] = useState("");
  const [about, setAbout] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(false);
    try {
      const config = await businessService.config(businessId);
      setBusinessName(config.business.name);
      setAbout(config.business.about ?? "");
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
    if (!canManage) {
      Alert.alert("Permission required", "You do not have permission to update business information.");
      return;
    }
    if (about.length > ABOUT_LIMIT) {
      Alert.alert("Too long", `About business must be ${ABOUT_LIMIT} characters or less.`);
      return;
    }

    setSaving(true);
    try {
      await businessService.updateBusiness(businessId, { about: about.trim() || null });
      await refreshProfile();
      Alert.alert("Saved", "Business about information updated.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save business about information.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading business information" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title="About" onBack={() => navigation.goBack()}>
      <SectionTitle title={businessName || "Business Information"} />
      <Card style={styles.form}>
        <Input
          label="About Business"
          value={about}
          onChangeText={setAbout}
          editable={canManage}
          multiline
          maxLength={ABOUT_LIMIT}
          numberOfLines={8}
          textAlignVertical="top"
          placeholder="Write a short description of your business"
          style={styles.aboutInput}
        />
        <Text style={styles.counter}>{about.length}/{ABOUT_LIMIT}</Text>
      </Card>

      {!canManage ? <Text style={styles.note}>You do not have permission to update business information.</Text> : null}
      <Button label="Save Changes" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  aboutInput: { minHeight: 140 },
  counter: { ...typography.caption, color: colors.textMuted, textAlign: "right" },
  note: { ...typography.caption, color: colors.textMuted }
});
