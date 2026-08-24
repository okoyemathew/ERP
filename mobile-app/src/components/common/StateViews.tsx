import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { AlertCircle } from "lucide-react-native";
import { Button } from "./Button";
import { colors, typography } from "@/theme";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={styles.error}>
      <AlertCircle size={20} color={colors.error} />
      <Text style={styles.title}>Failed to load</Text>
      {onRetry ? <Button label="Retry" onPress={onRetry} style={styles.button} /> : null}
    </View>
  );
}

export function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View style={styles.state}>
      {icon}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10
  },
  error: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorBg,
    gap: 10
  },
  title: {
    ...typography.subtitle,
    color: colors.foreground
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted
  },
  button: {
    alignSelf: "flex-start",
    minWidth: 120
  }
});
