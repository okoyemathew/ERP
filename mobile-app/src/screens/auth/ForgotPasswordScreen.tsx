import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Mail, Phone } from "lucide-react-native";
import { Button, Input, ScreenHeader } from "@/components/common";
import { authService } from "@/services/auth.service";
import { colors } from "@/theme";

export function ForgotPasswordScreen({ navigation }: { navigation: any }) {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = emailOrPhone.trim();
    if (!value) {
      setError("Enter your email or mobile number.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await authService.forgotPassword({ emailOrPhone: value });
      navigation.navigate("ResetPassword", {
        emailOrPhone: value,
        token: response.devToken
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send reset token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScreenHeader title="Forgot Password" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Input
          label="Email or Mobile Number"
          value={emailOrPhone}
          onChangeText={setEmailOrPhone}
          keyboardType="email-address"
          autoCapitalize="none"
          icon={emailOrPhone.includes("@") ? <Mail size={15} color={colors.textPlaceholder} /> : <Phone size={15} color={colors.textPlaceholder} />}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Send Token" onPress={loading ? undefined : submit} loading={loading} style={styles.button} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: 20, gap: 14 },
  error: { color: colors.error, fontSize: 12, fontWeight: "700" },
  button: { marginTop: "auto" }
});
