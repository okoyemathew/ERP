import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { KeyRound, Lock, Mail } from "lucide-react-native";
import { Button, Input, ScreenHeader } from "@/components/common";
import { authService } from "@/services/auth.service";
import { colors } from "@/theme";

export function ResetPasswordScreen({ navigation, route }: { navigation: any; route: any }) {
  const [emailOrPhone, setEmailOrPhone] = useState(route.params?.emailOrPhone ?? "");
  const [token, setToken] = useState(route.params?.token ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const identifier = emailOrPhone.trim();
    const resetToken = token.trim();
    if (!identifier || !resetToken || !newPassword || !confirmPassword) {
      setError("Enter the token and your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/.test(newPassword) || newPassword.length < 8) {
      setError("Password must include uppercase, lowercase, number, and special character.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authService.resetPassword({ emailOrPhone: identifier, token: resetToken, newPassword });
      Alert.alert("Password reset", "You can now sign in with your new password.");
      navigation.navigate("Login");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScreenHeader title="Reset Password" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Input label="Email or Mobile Number" value={emailOrPhone} onChangeText={setEmailOrPhone} autoCapitalize="none" icon={<Mail size={15} color={colors.textPlaceholder} />} />
        <Input label="Token" value={token} onChangeText={setToken} keyboardType="number-pad" icon={<KeyRound size={15} color={colors.textPlaceholder} />} />
        <Input label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry icon={<Lock size={15} color={colors.textPlaceholder} />} />
        <Input label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry icon={<Lock size={15} color={colors.textPlaceholder} />} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Reset Password" onPress={loading ? undefined : submit} loading={loading} style={styles.button} />
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
