import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { ArrowUpRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card } from "@/components/common";
import { colors } from "@/theme";
import { formatCurrency } from "@/utils/format";

export function AdvertScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) + 28 }]}
      showsVerticalScrollIndicator
      persistentScrollbar
    >
      <View style={styles.preview}>
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.muted}>Today's Revenue</Text>
              <Text style={styles.value}>{formatCurrency(12450)}</Text>
            </View>
            <View style={styles.delta}>
              <ArrowUpRight size={12} color={colors.success} />
              <Text style={styles.deltaText}>+12.4%</Text>
            </View>
          </View>
          <View style={styles.chart}>
            {[30, 54, 38, 62, 78, 96, 58].map((height, index) => (
              <View key={index} style={[styles.bar, { height }]} />
            ))}
          </View>
          <View style={styles.chips}>
            {["Revenue", "Orders", "Customers"].map((label) => <Text key={label} style={styles.chip}>{label}</Text>)}
          </View>
        </Card>
      </View>
      <View style={styles.bottom}>
        <Text style={styles.title}>Manage Your Business Smarter</Text>
        <Text style={styles.body}>Sales, inventory, reports, employees and customers in one secure cloud application.</Text>
        <Button label="Get Started" onPress={() => navigation.navigate("Language")} />
        <Button label="Learn More" variant="ghost" onPress={() => navigation.navigate("Onboarding")} style={styles.ghost} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.darkBg
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    padding: 24
  },
  preview: {
    flex: 1,
    justifyContent: "center"
  },
  card: {
    borderRadius: 24,
    backgroundColor: colors.surface
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  muted: {
    color: colors.textMuted,
    fontSize: 11
  },
  value: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 4
  },
  delta: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: colors.successBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  deltaText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700"
  },
  chart: {
    height: 130,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 18
  },
  bar: {
    width: 24,
    borderRadius: 12,
    backgroundColor: colors.secondaryBg
  },
  chips: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18
  },
  chip: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700"
  },
  bottom: {
    gap: 12,
    paddingBottom: 28
  },
  title: {
    color: colors.surface,
    fontSize: 26,
    fontWeight: "800"
  },
  body: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 12
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.3)"
  }
});
