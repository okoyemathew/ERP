import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Bell, DollarSign, Receipt, ShoppingBag, ShoppingCart, Truck, Users } from "lucide-react-native";
import { Button, Card } from "@/components/common";
import { ErrorState, LoadingState } from "@/components/common/StateViews";
import { reportsService } from "@/services/reports.service";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing } from "@/theme";
import type { DashboardSummary } from "@/types/report";
import { formatCurrency } from "@/utils/format";

const quickAccess = [
  { label: "Sales Records", route: "SalesRecords", icon: ShoppingBag },
  { label: "My Customers", route: "Customers", icon: Users },
  { label: "Expenses", route: "Expenses", icon: Receipt },
  { label: "Supplied Products", route: "Supplied", icon: Truck }
];

export function EmployeeDashboard({ navigation }: { navigation: any }) {
  const user = useAuth((state) => state.user);
  const businessId = useAuth((state) => state.business?.id);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await reportsService.dashboardSummary(businessId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statCards = useMemo(
    () => [
      { label: "Today's Sales", value: formatCurrency(summary?.totalRevenueToday ?? 0), icon: DollarSign, color: colors.primary },
      { label: "This Week", value: formatCurrency(summary?.totalSales ?? 0), icon: ShoppingCart, color: colors.success },
      { label: "Orders", value: String(summary?.totalSalesToday ?? 0), icon: Receipt, color: colors.warning }
    ],
    [summary]
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{new Date().toLocaleDateString()}</Text>
            <Text style={styles.name}>{user?.firstName ?? "Employee"}</Text>
          </View>
        </View>
        <LoadingState label="Loading dashboard" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{new Date().toLocaleDateString()}</Text>
            <Text style={styles.name}>{user?.firstName ?? "Employee"}</Text>
          </View>
        </View>
        <ErrorState onRetry={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{new Date().toLocaleDateString()}</Text>
          <Text style={styles.name}>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Employee"}</Text>
        </View>
        <Pressable onPress={() => navigation.navigate("Notifications")} style={styles.bell} accessibilityLabel="Notifications">
          <Bell size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
            <Card key={stat.label} style={styles.stat}>
              <Icon size={15} color={stat.color} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          );})}
        </View>
        <Button label="Start New Sale" icon={<ShoppingCart size={19} color={colors.surface} />} onPress={() => navigation.navigate("AddNewSales")} style={styles.cta} />
        <Text style={styles.section}>Quick Access</Text>
        <View style={styles.grid}>
          {quickAccess.map((item) => {
            const Icon = item.icon;
            return (
            <Pressable key={item.label} onPress={() => navigation.navigate(item.route)} accessibilityLabel={item.label}>
              <Card style={styles.tile}>
                <Icon size={20} color={colors.primary} />
                <Text style={styles.tileText}>{item.label}</Text>
              </Card>
            </Pressable>
          );})}
        </View>
        <Text style={styles.section}>Recent Activity</Text>
        {(summary?.recentSales ?? []).map((item) => (
          <Card key={item.id} style={styles.sale}>
            <Text style={styles.saleCustomer}>{item.customerName}</Text>
            <Text style={styles.saleAmount}>{formatCurrency(item.totalAmount)}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { color: colors.textPlaceholder, fontSize: 12, fontWeight: "600" },
  name: { color: colors.foreground, fontSize: 20, fontWeight: "800", marginTop: 2 },
  bell: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 12 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, alignItems: "center", gap: 5 },
  statValue: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  statLabel: { color: colors.textPlaceholder, fontSize: 10, textAlign: "center" },
  cta: { borderRadius: 20 },
  section: { color: colors.textTertiary, fontSize: 13, fontWeight: "800", marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47.8%", height: 112, justifyContent: "space-between" },
  tileText: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  sale: { flexDirection: "row", justifyContent: "space-between" },
  saleCustomer: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  saleAmount: { color: colors.foreground, fontSize: 13, fontWeight: "800" }
});
