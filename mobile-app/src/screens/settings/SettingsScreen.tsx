import React from "react";
import { Bell, Building2, Globe, HelpCircle, LogOut, Palette, ReceiptText, Shield, User } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { SimpleRow, ListScreen } from "@/screens/shared/ScreenKit";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme";

type SettingsRow = {
  label: string;
  icon: LucideIcon;
  route?: string;
  onPress?: () => void;
};

export function SettingsScreen({ navigation }: { navigation: any }) {
  const user = useAuthStore((state) => state.user);
  const role = user?.roleName ? (user.roleName === "Owner" ? "owner" : "employee") : user?.role ?? "owner";
  const logout = useAuthStore((state) => state.logout);
  const navigateStack = (route: string) => {
    const parent = navigation.getParent?.();
    if (parent) parent.navigate(route as never);
    else navigation.navigate(route);
  };
  const rows: SettingsRow[] = [
    ...(role === "owner" ? [
      { label: "Business Profile", icon: Building2, route: "BusinessProfile" },
      { label: "Receipt Settings", icon: ReceiptText, route: "ReceiptSettings" },
      { label: "Tax Settings", icon: Shield, route: "TaxSettings" },
      { label: "Printer Settings", icon: ReceiptText, route: "PrinterSettings" }
    ] : []),
    { label: "Notifications", icon: Bell, route: "NotificationSettings" },
    { label: "Language", icon: Globe, route: "LanguageSettings" },
    ...(role === "owner" ? [{ label: "Theme", icon: Palette, route: "ThemeSettings" }] : []),
    { label: "Help & Support", icon: HelpCircle, route: "HelpSupport" },
    { label: "About", icon: User, route: "AboutBusiness" },
    { label: "Logout", icon: LogOut, onPress: logout }
  ];
  return (
    <ListScreen
      title="Settings"
      data={rows}
      keyExtractor={(item) => item.label}
      renderItem={({ item }) => {
        const Icon = item.icon;
        const route = item.route;
        const onPress = route ? () => navigateStack(route) : item.onPress;
        const color = item.label === "Logout" ? colors.error : colors.primary;
        return <SimpleRow title={item.label} icon={<Icon size={17} color={color} />} onPress={onPress} />;
      }}
    />
  );
}
