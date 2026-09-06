import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Eye, EyeOff, Lock, Mail, ShoppingCart } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Input } from "@/components/common";
import { colors } from "@/theme";
import { useAuthStore } from "@/store/authStore";

export function LoginScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.isLoading);
  const apiError = useAuthStore((state) => state.error);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async () => {
    const emailOrPhone = email.trim().toLowerCase();
    if (!emailOrPhone || !password) {
      setValidationError("Enter your email, phone, or username and password.");
      return;
    }

    setValidationError(null);
    try {
      await login({ emailOrPhone, password });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed. Please try again.";
      Alert.alert("Unable to sign in", message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <ShoppingCart size={28} color={colors.surface} strokeWidth={1.6} />
          </View>
          <Text style={styles.title}>NexPOS</Text>
          <Text style={styles.subtitle}>Welcome back</Text>
        </View>
        <View style={styles.form}>
          <Input
            label="Email, Phone or Username"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            icon={<Mail size={15} color={colors.textPlaceholder} />}
            accessibilityLabel="Email, phone or username"
          />
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center" },
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
