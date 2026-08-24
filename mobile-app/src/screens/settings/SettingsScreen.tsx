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
};

export function SettingsScreen({ navigation }: { navigation: any }) {
  const role = useAuthStore((state) => state.user?.role ?? "owner");
  const logout = useAuthStore((state) => state.logout);
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
    { label: "About", icon: User, route: "AboutBusiness" }
  ];
  return (
    <ListScreen
      title="Settings"
      data={rows}
      keyExtractor={(item) => item.label}
      renderItem={({ item }) => {
        const Icon = item.icon;
        return <SimpleRow title={item.label} icon={<Icon size={17} color={colors.primary} />} onPress={item.route ? () => navigation.navigate(item.route) : undefined} />;
      }}
      empty={<SimpleRow title="Logout" icon={<LogOut size={17} color={colors.error} />} onPress={logout} />}
    />
  );
}
