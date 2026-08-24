import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Lock, Mail, MapPin, Phone, User } from "lucide-react-native";
import { Avatar, Button, Input, ScreenHeader } from "@/components/common";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";

export function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const business = useAuthStore((state) => state.business);
  const logout = useAuthStore((state) => state.logout);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const changePassword = useAuthStore((state) => state.changePassword);
  const loading = useAuthStore((state) => state.isLoading);
  const apiError = useAuthStore((state) => state.error);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const name = user?.name ?? "";
  const email = user?.email ?? "";
  const phone = user?.phone ?? "";
  const location = business?.address ?? business?.name ?? "";

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Enter your current password and new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/.test(newPassword) || newPassword.length < 8) {
      setPasswordError("Password must include uppercase, lowercase, number, and special character.");
      return;
    }

    setPasswordError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Password updated", "Your password has been changed.");
    } catch {
      // The store exposes a clean error message for this screen.
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Avatar name={name} size={80} />
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.role}>{user?.role ?? "owner"}</Text>
        </View>
        <Input label="Full Name" value={name} editable={false} icon={<User size={15} color={colors.textPlaceholder} />} />
        <Input label="Email" value={email} editable={false} icon={<Mail size={15} color={colors.textPlaceholder} />} />
        <Input label="Phone" value={phone} editable={false} icon={<Phone size={15} color={colors.textPlaceholder} />} />
        <Input label="Location" value={location} editable={false} icon={<MapPin size={15} color={colors.textPlaceholder} />} />
        <Button label="Save" onPress={loading ? undefined : refreshProfile} loading={loading} />
        <View style={styles.passwordBlock}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <Input label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry icon={<Lock size={15} color={colors.textPlaceholder} />} />
          <Input label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry icon={<Lock size={15} color={colors.textPlaceholder} />} />
          <Input label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry icon={<Lock size={15} color={colors.textPlaceholder} />} />
          {(passwordError || apiError) && <Text style={styles.error}>{passwordError ?? apiError}</Text>}
          <Button label="Change Password" onPress={loading ? undefined : handleChangePassword} loading={loading} />
        </View>
        <Button label="Logout" variant="danger" onPress={logout} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, gap: 14, paddingBottom: 32 },
  hero: { alignItems: "center", paddingVertical: 18 },
  name: { color: colors.foreground, fontSize: 20, fontWeight: "800", marginTop: 12 },
  role: { color: colors.primary, backgroundColor: colors.secondaryBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, overflow: "hidden", marginTop: 6, textTransform: "capitalize" },
  passwordBlock: { gap: 12, paddingTop: 6 },
  sectionTitle: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  error: { color: colors.error, fontSize: 12, fontWeight: "700" }
});
