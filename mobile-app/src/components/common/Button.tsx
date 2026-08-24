import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Text } from "@/i18n";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { colors, borderRadius, typography } from "@/theme";
import { useTranslation } from "@/i18n";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger" | "success";
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function Button({ label, onPress, variant = "primary", loading, icon, style, accessibilityLabel }: ButtonProps) {
  const { t } = useTranslation();
  const handlePress = () => {
    void Haptics.selectionAsync();
    onPress?.();
  };

  const content = (
    <>
      {loading ? <ActivityIndicator color={variant === "ghost" ? colors.primary : colors.surface} /> : icon}
      {!loading && <Text style={[styles.label, variant === "ghost" && styles.ghostLabel, variant === "danger" && styles.dangerLabel, variant === "success" && styles.successLabel]}>{label}</Text>}
    </>
  );

  if (variant === "primary") {
    return (
      <Pressable onPress={handlePress} style={[styles.pressable, style]} accessibilityRole="button" accessibilityLabel={t(accessibilityLabel ?? label)}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradient}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.secondary, variant === "danger" && styles.danger, variant === "success" && styles.success, style]}
      accessibilityRole="button"
      accessibilityLabel={t(accessibilityLabel ?? label)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 54,
    borderRadius: borderRadius.card,
    overflow: "hidden"
  },
  gradient: {
    minHeight: 54,
    borderRadius: borderRadius.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  secondary: {
    minHeight: 50,
    borderRadius: borderRadius.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface
  },
  danger: {
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorBg
  },
  success: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg
  },
  label: {
    ...typography.subtitle,
    color: colors.surface,
    fontWeight: "700"
  },
  ghostLabel: {
    color: colors.primary
  },
  dangerLabel: {
    color: colors.error
  },
  successLabel: {
    color: colors.successDark
  }
});
