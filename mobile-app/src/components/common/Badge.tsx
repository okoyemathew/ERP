import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { borderRadius, colors, typography } from "@/theme";

type BadgeVariant = "success" | "warning" | "error" | "neutral" | "primary";

const stylesByVariant: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.successDark },
  warning: { bg: colors.warningBg, fg: "#C2410C" },
  error: { bg: colors.errorBg, fg: colors.error },
  neutral: { bg: "#F3F4F6", fg: "#6B7280" },
  primary: { bg: colors.secondaryBg, fg: colors.primary }
};

export function Badge({ label, variant = "neutral" }: { label: string; variant?: BadgeVariant }) {
  const v = stylesByVariant[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <Text style={[styles.text, { color: v.fg }]}>{label}</Text>
    </View>
  );
}

export const statusVariant = (status: string): BadgeVariant => {
  if (["completed", "paid", "approved", "Active", "In Stock"].includes(status)) return "success";
  if (["pending", "partial", "Low", "On Leave"].includes(status)) return "warning";
  if (["refunded", "rejected", "Critical", "Out"].includes(status)) return "error";
  return "neutral";
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: borderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  text: {
    ...typography.badge,
    textTransform: "capitalize"
  }
});
