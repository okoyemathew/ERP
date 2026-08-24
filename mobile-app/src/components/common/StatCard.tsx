import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { ArrowDownRight, ArrowUpRight } from "lucide-react-native";
import { Card } from "./Card";
import { colors, typography } from "@/theme";

export function StatCard({
  label,
  value,
  icon,
  color,
  background,
  delta,
  down
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  background: string;
  delta?: string;
  down?: boolean;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: background }]}>{icon}</View>
        {delta ? (
          <View style={styles.delta}>
            {down ? <ArrowDownRight size={11} color={colors.error} /> : <ArrowUpRight size={11} color={colors.success} />}
            <Text style={[styles.deltaText, { color: down ? colors.error : colors.success }]}>{delta}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "47%"
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  deltaText: {
    ...typography.badge
  },
  value: {
    ...typography.kpiValue,
    color: colors.foreground,
    fontSize: 22
  },
  label: {
    ...typography.caption,
    color: colors.textPlaceholder,
    marginTop: 2
  }
});
