import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { LayoutDashboard, Menu, Plus, ShoppingBag, Users } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabParamList } from "@/types/navigation.types";
import { colors, shadows, spacing, typography } from "@/theme";

type TabName = keyof BottomTabParamList;
export type BottomNavItem = { name: TabName; label: string; icon: LucideIcon };

export const ownerBottomTabs: BottomNavItem[] = [
  { name: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { name: "SalesRecords", label: "Sales Records", icon: ShoppingBag },
  { name: "AddNewSales", label: "Add New Sales", icon: Plus },
  { name: "Customers", label: "Customers", icon: Users },
  { name: "More", label: "More", icon: Menu }
];

export function BottomNav({
  active,
  onTabPress,
  tabs = ownerBottomTabs,
  fabIndex = 2
}: {
  active: TabName;
  onTabPress: (tab: TabName) => void;
  tabs?: BottomNavItem[];
  fabIndex?: number | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { height: spacing.bottomNavHeight + insets.bottom, paddingBottom: insets.bottom || 12 }]}>
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const selected = active === tab.name;
        const isFab = fabIndex === index;
        return (
          <Pressable key={tab.name} style={styles.tab} onPress={() => onTabPress(tab.name)} accessibilityRole="tab" accessibilityLabel={tab.label}>
            {isFab ? (
              <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.fab}>
                <Icon size={24} color={colors.surface} strokeWidth={2.5} />
              </LinearGradient>
            ) : (
              <Icon size={22} color={selected ? colors.primary : colors.textPlaceholder} strokeWidth={selected ? 2.4 : 1.8} />
            )}
            <Text style={[styles.label, selected && styles.active]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLighter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    zIndex: 20
  },
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.cartFAB
  },
  label: {
    ...typography.navLabel,
    color: colors.textPlaceholder
  },
  active: {
    color: colors.primary
  }
});
