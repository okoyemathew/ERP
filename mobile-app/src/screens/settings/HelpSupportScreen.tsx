import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, StyleSheet } from "react-native";
import { Mail, Phone } from "lucide-react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";

export function HelpSupportScreen({ navigation }: { navigation: any }) {
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(false);
    try {
      const config = await businessService.config(businessId);
      setSupportEmail(config.business.email);
      setSupportPhone(config.business.phone);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEmail = async () => {
    if (!supportEmail) {
      Alert.alert("Support", "Business support email is not configured.");
      return;
    }
    const url = `mailto:${supportEmail}?subject=NexPOS%20Support`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return;
    }
    Alert.alert("Support", supportEmail);
  };

  const openPhone = async () => {
    if (!supportPhone) {
      Alert.alert("Support", "Business support phone number is not configured.");
      return;
    }
    const url = `tel:${supportPhone.replace(/\s/g, "")}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return;
    }
    Alert.alert("Support", supportPhone);
  };

  if (loading) return <LoadingState label="Loading support information" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title="Help & Support" onBack={() => navigation.goBack()}>
      <SectionTitle title="Contact Support" />
      <Card style={styles.card}>
        <Text style={styles.text}>Use the options below to contact the business support contact saved in Business Profile.</Text>
        {supportEmail ? <Text style={styles.contact}>{supportEmail}</Text> : null}
        {supportPhone ? <Text style={styles.contact}>{supportPhone}</Text> : null}
        <Button label="Email Support" variant="ghost" icon={<Mail size={16} color={colors.primary} />} onPress={openEmail} />
        <Button label="Call Support" variant="ghost" icon={<Phone size={16} color={colors.primary} />} onPress={openPhone} />
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  text: { ...typography.body, color: colors.textSecondary },
  contact: { ...typography.subtitle, color: colors.foreground, fontWeight: "800" }
});
