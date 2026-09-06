import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Bell, DollarSign, Package, ShoppingBag, ShoppingCart, TrendingUp, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, EmptyState, StatCard } from "@/components/common";
import { ErrorState, LoadingState } from "@/components/common/StateViews";
import { AreaChart } from "@/components/charts";
import { reportsService } from "@/services/reports.service";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing } from "@/theme";
import type { DashboardStatistics, DashboardSummary } from "@/types/report";
import { formatCurrency } from "@/utils/format";

const quickActions = [
  { label: "New Sale", route: "AddNewSales", icon: ShoppingBag, color: colors.primary },
  { label: "Add Stock", route: "Inventory", icon: Package, color: colors.success },
  { label: "Add Customer", route: "Customers", icon: Users, color: colors.purple },
  { label: "Reports", route: "Reports", icon: TrendingUp, color: colors.orange }
];

const tabRoutes = new Set(["Dashboard", "SalesRecords", "AddNewSales", "Customers", "More"]);

export function OwnerDashboard({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuth((state) => state.user);
  const businessId = useAuth((state) => state.business?.id);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [statistics, setStatistics] = useState<DashboardStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextStatistics] = await Promise.all([
        reportsService.dashboardSummary(businessId),
        reportsService.dashboardStatistics(businessId)
      ]);
      setSummary(nextSummary);
      setStatistics(nextStatistics);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      (statistics?.salesLast7Days ?? []).map((row) => ({
        label: row.date.slice(5),
        revenue: row.revenue
      })),
    [statistics]
  );
  const recentSales = summary?.recentSales ?? [];
  const bottomPadding = spacing.bottomNavHeight + Math.max(insets.bottom, 24) + 48;

  const navigateApp = (route: string) => {
    if (tabRoutes.has(route)) {
      navigation.navigate(route);
      return;
    }
    const parent = navigation.getParent?.();
    if (parent) parent.navigate(route as never);
    else navigation.navigate(route);
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.statusBarTop) }]}>
          <View>
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.name}>{user?.firstName ?? "Owner"}</Text>
          </View>
        </View>
        <LoadingState label="Loading dashboard" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.statusBarTop) }]}>
          <View>
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.name}>{user?.firstName ?? "Owner"}</Text>
          </View>
        </View>
        <ErrorState onRetry={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.statusBarTop) }]}>
        <View>
          <Text style={styles.greeting}>Good morning</Text>
          <Text style={styles.name}>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Owner"}</Text>
        </View>
        <Pressable onPress={() => navigateApp("Notifications")} style={styles.bell} accessibilityLabel="Notifications">
          <Bell size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
      <FlatList
        data={recentSales}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        persistentScrollbar
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.grid}>
              <StatCard label="Today's Sales" value={formatCurrency(summary?.totalRevenueToday ?? 0)} icon={<DollarSign size={17} color={colors.primary} />} color={colors.primary} background={colors.secondaryBg} />
              <StatCard label="Orders" value={String(summary?.totalSalesToday ?? 0)} icon={<ShoppingCart size={17} color={colors.success} />} color={colors.success} background={colors.successBg} />
              <StatCard label="Profit" value={formatCurrency(summary?.todayProfit ?? 0)} icon={<TrendingUp size={17} color={colors.warning} />} color={colors.warning} background={colors.warningBg} />
              <StatCard label="Customers" value={String(summary?.activeCustomersCount ?? 0)} icon={<Users size={17} color={colors.purple} />} color={colors.purple} background={colors.purpleBg} />
            </View>
            <Text style={styles.section}>Quick Actions</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                <Pressable key={action.label} onPress={() => navigateApp(action.route)} style={styles.action} accessibilityLabel={action.label}>
                  <Icon size={21} color={action.color} />
                  <Text style={styles.actionText}>{action.label}</Text>
                </Pressable>
              );})}
            </ScrollView>
            <Card>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Weekly Revenue</Text>
                <Text style={styles.delta}>+18.4%</Text>
              </View>
              <AreaChart data={chartData.length ? chartData : [{ label: "Today", revenue: 0 }]} />
            </Card>
            <Card style={styles.lowStock}>
              <Package size={18} color={colors.orange} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lowTitle}>Low Stock Alert</Text>
                <Text style={styles.lowText}>{summary?.lowStockProductsCount ?? 0} products need immediate restocking</Text>
              </View>
              <Text style={styles.view}>View</Text>
            </Card>
            <Text style={styles.section}>Recent Sales</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.sale}>
            <View style={styles.saleIcon}><ShoppingBag size={15} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.saleCustomer}>{item.customerName}</Text>
              <Text style={styles.saleMeta}>{item.saleNumber} | {item.itemCount} items</Text>
            </View>
            <Text style={styles.saleAmount}>{formatCurrency(item.totalAmount)}</Text>
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon={<ShoppingBag size={28} color={colors.textPlaceholder} />} title="No recent sales" />}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { color: colors.textPlaceholder, fontSize: 14, fontWeight: "600" },
  name: { color: colors.foreground, fontSize: 20, fontWeight: "800", marginTop: 2 },
  bell: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.inputBg, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 12 },
  headerContent: { gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  section: { color: colors.textTertiary, fontSize: 13, fontWeight: "800", marginTop: 6 },
  actions: { gap: 14, paddingVertical: 2 },
  action: { width: 76, alignItems: "center", gap: 8, paddingVertical: 6 },
  actionText: { color: colors.textTertiary, fontSize: 10, fontWeight: "600", textAlign: "center" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  delta: { color: colors.success, fontSize: 11, fontWeight: "800" },
  lowStock: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  lowTitle: { color: "#9A3412", fontSize: 12, fontWeight: "800" },
  lowText: { color: "#C2410C", fontSize: 11, marginTop: 3 },
  view: { color: colors.orange, fontSize: 12, fontWeight: "800" },
  sale: { flexDirection: "row", alignItems: "center", gap: 12 },
  saleIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  saleCustomer: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  saleMeta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 2 },
  saleAmount: { color: colors.foreground, fontSize: 13, fontWeight: "800" }
});
