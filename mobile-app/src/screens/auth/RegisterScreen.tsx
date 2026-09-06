import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Input, ScreenHeader, StepProgressBar } from "@/components/common";
import { authService } from "@/services/auth.service";
import { colors } from "@/theme";

export function RegisterScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateCurrentStep = () => {
    if (step === 0 && !businessName.trim()) {
      return "Enter your business name.";
    }

    if (step === 1) {
      if (!ownerFullName.trim()) return "Enter the owner's full name.";
      if (!ownerEmail.trim()) return "Enter the owner's email address.";
      if (!/^\S+@\S+\.\S+$/.test(ownerEmail.trim())) return "Enter a valid email address.";
      if (password.length < 8) return "Password must be at least 8 characters.";
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/.test(password)) return "Password must include uppercase, lowercase, number, and special character.";
      if (password !== confirmPassword) return "Passwords do not match.";
    }

    return null;
  };

  const createAccount = async () => {
    const validationMessage = validateCurrentStep();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    if (step < 2) {
      setError(null);
      setStep(step + 1);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await authService.registerOwner({
        businessName: businessName.trim(),
        businessType: businessType.trim() || undefined,
        businessAddress: businessAddress.trim() || undefined,
        ownerFullName: ownerFullName.trim(),
        ownerPhone: ownerPhone.trim() || undefined,
        ownerEmail: ownerEmail.trim().toLowerCase(),
        password
      });

      Alert.alert("Account created", response.message, [
        {
          text: "Sign In",
          onPress: () => navigation.navigate("Login")
        }
      ]);
      navigation.navigate("Login");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScreenHeader title="Register Business" onBack={() => (step > 0 ? setStep(step - 1) : navigation.goBack())} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        <StepProgressBar step={step} />
        {step === 0 ? (
          <>
            <Input label="Business Name" placeholder="Becker's Store" value={businessName} onChangeText={setBusinessName} />
            <Input label="Business Type" placeholder="Retail Store" value={businessType} onChangeText={setBusinessType} />
            <Input label="Address" placeholder="123 Main St" value={businessAddress} onChangeText={setBusinessAddress} />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <Input label="Full Name" placeholder="James Becker" value={ownerFullName} onChangeText={setOwnerFullName} />
            <Input label="Phone" placeholder="+1 555 123 4567" value={ownerPhone} onChangeText={setOwnerPhone} keyboardType="phone-pad" />
            <Input label="Email" placeholder="james@nexpos.com" value={ownerEmail} onChangeText={setOwnerEmail} keyboardType="email-address" autoCapitalize="none" />
            <Input label="Password" secureTextEntry placeholder="Secure1234!" value={password} onChangeText={setPassword} />
            <Input label="Confirm Password" secureTextEntry placeholder="Secure1234!" value={confirmPassword} onChangeText={setConfirmPassword} />
          </>
        ) : null}
        {step === 2 ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Create your NexPOS workspace</Text>
            <Text style={styles.summaryBody}>{businessName.trim() || "Business"} profile, owner account and secure login are ready to create.</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={step < 2 ? "Continue" : "Create Account"} onPress={loading ? undefined : createAccount} loading={loading} style={styles.button} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: 20, gap: 14 },
  summary: { borderRadius: 16, backgroundColor: colors.secondaryBg, padding: 18, gap: 6 },
  summaryTitle: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  summaryBody: { color: colors.textMuted, fontSize: 13, lineHeight: 21 },
  error: { color: colors.error, fontSize: 12, fontWeight: "700" },
  button: { marginTop: "auto" }
});
