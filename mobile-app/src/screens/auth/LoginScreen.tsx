import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Eye, EyeOff, Lock, Mail, ShoppingCart } from "lucide-react-native";
import { Button, Input } from "@/components/common";
import { colors } from "@/theme";
import { useAuthStore } from "@/store/authStore";

export function LoginScreen({ navigation }: { navigation: any }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.isLoading);
  const apiError = useAuthStore((state) => state.error);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async () => {
    const emailOrPhone = email.trim();
    if (!emailOrPhone || !password) {
      setValidationError("Enter your email or phone and password.");
      return;
    }

    setValidationError(null);
    try {
      await login({ emailOrPhone, password });
    } catch {
      // The store exposes a clean API error for the screen.
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <ShoppingCart size={28} color={colors.surface} strokeWidth={1.6} />
        </View>
        <Text style={styles.title}>NexPOS</Text>
        <Text style={styles.subtitle}>Welcome back</Text>
      </View>
      <View style={styles.form}>
        <Input label="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" icon={<Mail size={15} color={colors.textPlaceholder} />} accessibilityLabel="Email address" />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
          icon={<Lock size={15} color={colors.textPlaceholder} />}
          accessibilityLabel="Password"
        />
        <Pressable onPress={() => setShow(!show)} style={styles.eye} accessibilityLabel="Toggle password visibility">
          {show ? <EyeOff size={16} color={colors.textPlaceholder} /> : <Eye size={16} color={colors.textPlaceholder} />}
        </Pressable>
        {(validationError || apiError) && <Text style={styles.error}>{validationError ?? apiError}</Text>}
        <Pressable onPress={() => navigation.navigate("ForgotPassword")}>
          <Text style={styles.forgot}>Forgot password?</Text>
        </Pressable>
        <Button label="Sign In" onPress={loading ? undefined : submit} loading={loading} />
        <View style={styles.shortcuts}>
          <Button label="Owner Login" variant="ghost" onPress={loading ? undefined : submit} style={styles.shortcut} />
          <Button label="Employee Login" variant="ghost" onPress={loading ? undefined : submit} style={styles.shortcut} />
        </View>
        <Pressable onPress={() => navigation.navigate("Register")}>
          <Text style={styles.createAccount}>Create Business Owner Account</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 34 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { color: colors.foreground, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 6, fontSize: 14 },
  form: { gap: 14 },
  eye: { position: "absolute", top: 102, right: 14, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  error: { color: colors.error, fontSize: 12, fontWeight: "700" },
  forgot: { color: colors.primary, textAlign: "right", fontSize: 12, fontWeight: "700" },
  shortcuts: { flexDirection: "row", gap: 10 },
  shortcut: { flex: 1, minHeight: 44, backgroundColor: colors.mutedBg },
  createAccount: { color: colors.primary, textAlign: "center", fontSize: 12, fontWeight: "800" }
});
