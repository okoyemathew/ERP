import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { borderRadius, colors, shadows, spacing } from "@/theme";

export function Card({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.card,
    padding: spacing.cardPadding,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
    ...shadows.card
  }
});
