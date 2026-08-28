import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import {
  Archive,
  Banknote,
  BarChart2,
  Bell,
  Box,
  ChevronRight,
  ClipboardList,
  HandCoins,
  LogOut,
  Receipt,
  Settings,
  Truck,
  User,
  Users,
  X
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { AppStackParamList } from "@/types/navigation.types";
import type { Role } from "@/types/domain.types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "./Avatar";
import { Overlay } from "./Overlay";
import { Badge } from "./Badge";
import { colors, typography } from "@/theme";
import { canAccess } from "@/utils/permissions";

type RouteName = keyof AppStackParamList;

const ownerOnly: Array<{ icon: LucideIcon; label: string; route: RouteName; color: string; bg: string }> = [
  { icon: BarChart2, label: "Reports", route: "Reports", color: colors.primary, bg: colors.secondaryBg },
  { icon: Box, label: "Warehouse", route: "Inventory", color: colors.success, bg: colors.successBg },
  { icon: Users, label: "Employees", route: "Employees", color: colors.orange, bg: colors.orangeBg },
  { icon: Banknote, label: "Cash Register", route: "CashRegister", color: colors.purple, bg: colors.purpleBg },
  { icon: ClipboardList, label: "Pending Payments", route: "PendingPayments", color: colors.error, bg: colors.errorBg },
  { icon: Archive, label: "Disbursed Products", route: "Disbursed", color: "#546E7A", bg: "#ECEFF1" }
];

const shared: Array<{ icon: LucideIcon; label: string; route: RouteName; color: string; bg: string }> = [
  { icon: HandCoins, label: "Credit Sales", route: "CreditSales", color: "#0891B2", bg: "#E0F2FE" },
  { icon: Receipt, label: "Expenses", route: "Expenses", color: colors.orange, bg: colors.orangeBg },
  { icon: Truck, label: "Supplied Products", route: "Supplied", color: "#00838F", bg: "#E0F7FA" },
  { icon: Bell, label: "Notifications", route: "Notifications", color: "#5C6BC0", bg: "#E8EAF6" },
  { icon: User, label: "Profile", route: "Profile", color: "#607D8B", bg: "#ECEFF1" },
  { icon: Settings, label: "Settings", route: "Settings", color: "#455A64", bg: "#ECEFF1" }
];

export function DrawerMenu({
  open,
  role,
  onClose,
  onNavigate,
  onLogout
}: {
  open: boolean;
  role: Role;
  onClose: () => void;
  onNavigate: (route: RouteName) => void;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-286)).current;
  const name = role === "owner" ? "James Becker" : "Sarah Johnson";
  const items = role === "owner" ? [...ownerOnly, ...shared] : shared.filter((item) => canAccess(role, item.route));

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: open ? 0 : -286,
      stiffness: 340,
      damping: 32,
      useNativeDriver: true
    }).start();
  }, [open, translateX]);

  if (!open) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Overlay onPress={onClose} />
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        <View style={styles.header}>
          <View style={styles.top}>
            <Text style={styles.brand}>NexPOS</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close menu">
              <X size={16} color={colors.surface} />
            </Pressable>
          </View>
          <View style={styles.profile}>
            <Avatar name={name} size={48} />
            <View>
              <Text style={styles.name}>{name}</Text>
              <Badge label={role === "owner" ? "Business Owner" : "Employee"} variant="primary" />
            </View>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable key={item.label} style={styles.item} onPress={() => onNavigate(item.route)} accessibilityLabel={item.label}>
                <View style={[styles.itemIcon, { backgroundColor: item.bg }]}>
                  <Icon size={18} color={item.color} />
                </View>
                <Text style={styles.itemText}>{item.label}</Text>
                <ChevronRight size={14} color={colors.borderLight} />
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable style={[styles.logout, { paddingBottom: Math.max(insets.bottom + 12, 24), minHeight: 74 + insets.bottom }]} onPress={onLogout} accessibilityLabel="Logout">
          <View style={[styles.itemIcon, { backgroundColor: colors.errorBg }]}>
            <LogOut size={18} color={colors.error} />
          </View>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 286,
    backgroundColor: colors.surface,
    zIndex: 30
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: colors.primary
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20
  },
  brand: {
    ...typography.screenTitle,
    color: colors.surface
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center"
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  name: {
    ...typography.subtitle,
    color: colors.surface,
    marginBottom: 5
  },
  list: {
    paddingVertical: 8
  },
  item: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  itemText: {
    ...typography.subtitle,
    color: colors.textSecondary,
    flex: 1
  },
  logout: {
    minHeight: 62,
    borderTopWidth: 1,
    borderTopColor: colors.borderLighter,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  logoutText: {
    ...typography.subtitle,
    color: colors.error
  }
});
