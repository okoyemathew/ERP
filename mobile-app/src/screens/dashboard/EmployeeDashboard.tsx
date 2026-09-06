import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Bell, DollarSign, HandCoins, Receipt, ShoppingBag, ShoppingCart, TrendingUp, Truck, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, EmptyState, StatCard } from "@/components/common";
import { ErrorState, LoadingState } from "@/components/common/StateViews";
import { AreaChart } from "@/components/charts";
import { salesService } from "@/services/sales.service";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing } from "@/theme";
import type { ApiSale } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

const quickActions = [
  { label: "New Sale", route: "AddNewSales", icon: ShoppingBag, color: colors.primary },
  { label: "Credit Sales", route: "CreditSales", icon: HandCoins, color: "#0891B2" },
  { label: "Expenses", route: "Expenses", icon: Receipt, color: colors.orange },
  { label: "Supplied Products", route: "Supplied", icon: Truck, color: "#00838F" }
];

const tabRoutes = new Set(["Dashboard", "SalesRecords", "AddNewSales", "Customers", "More"]);

type ChartPoint = { label: string; revenue: number };

function saleCustomerName(sale: ApiSale) {
  if (sale.customer?.companyName) return sale.customer.companyName;
  return [sale.customer?.firstName, sale.customer?.lastName].filter(Boolean).join(" ") || "Walk-in Customer";
}

function saleAmount(sale: ApiSale) {
  return Number(sale.totalAmount ?? 0);
}

function buildChartData(sales: ApiSale[]): ChartPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 6 + index);
    return date;
  });

  const buckets = new Map(days.map((date) => [date.toISOString().slice(0, 10), 0]));

  sales.forEach((sale) => {
    const key = new Date(sale.saleDate).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + saleAmount(sale));
    }
  });

  return days.map((date) => {
    const key = date.toISOString().slice(0, 10);
    return { label: key.slice(5), revenue: buckets.get(key) ?? 0 };
  });
}

export function EmployeeDashboard({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuth((state) => state.user);
  const businessId = useAuth((state) => state.business?.id);
  const [todaySales, setTodaySales] = useState<ApiSale[]>([]);
  const [weeklySales, setWeeklySales] = useState<ApiSale[]>([]);
  const [recentSales, setRecentSales] = useState<ApiSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !user?.id) {
      setLoading(false);
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);

    setLoading(true);
    setError(null);
    try {
      const [nextTodaySales, nextWeeklySales, nextRecentSales] = await Promise.all([
        salesService.list({
          userId: user.id,
          status: "COMPLETED",
          startDate: todayStart.toISOString(),
          endDate: todayEnd.toISOString(),
          limit: 200
        }),
        salesService.list({
          userId: user.id,
          status: "COMPLETED",
          startDate: weekStart.toISOString(),
          endDate: todayEnd.toISOString(),
          limit: 200
        }),
        salesService.list({
          userId: user.id,
          status: "COMPLETED",
          limit: 10
        })
      ]);

      setTodaySales(nextTodaySales.data ?? []);
      setWeeklySales(nextWeeklySales.data ?? []);
      setRecentSales(nextRecentSales.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [businessId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => buildChartData(weeklySales), [weeklySales]);

  const todayRevenue = useMemo(() => todaySales.reduce((total, sale) => total + saleAmount(sale), 0), [todaySales]);
  const weeklyRevenue = useMemo(() => weeklySales.reduce((total, sale) => total + saleAmount(sale), 0), [weeklySales]);
  const uniqueCustomers = useMemo(() => new Set(weeklySales.map((sale) => sale.customerId).filter(Boolean)).size, [weeklySales]);
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
        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.statusBarTop) }]}>
          <View>
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.name}>{user?.firstName ?? "Employee"}</Text>
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
          <Text style={styles.name}>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Employee"}</Text>
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
              <StatCard label="Today's Sales" value={formatCurrency(todayRevenue)} icon={<DollarSign size={17} color={colors.primary} />} color={colors.primary} background={colors.secondaryBg} />
              <StatCard label="Orders" value={String(todaySales.length)} icon={<ShoppingCart size={17} color={colors.success} />} color={colors.success} background={colors.successBg} />
              <StatCard label="Week Sales" value={formatCurrency(weeklyRevenue)} icon={<TrendingUp size={17} color={colors.warning} />} color={colors.warning} background={colors.warningBg} />
              <StatCard label="Customers" value={String(uniqueCustomers)} icon={<Users size={17} color={colors.purple} />} color={colors.purple} background={colors.purpleBg} />
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
                );
              })}
            </ScrollView>
            <Card>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>My Weekly Revenue</Text>
                <Text style={styles.delta}>{weeklySales.length} sales</Text>
              </View>
              <AreaChart data={chartData.length ? chartData : [{ label: "Today", revenue: 0 }]} />
            </Card>
            <Pressable onPress={() => navigateApp("Supplied")} accessibilityLabel="View supplied products">
              <Card style={styles.supplied}>
                <Truck size={18} color="#00838F" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suppliedTitle}>Supplied Products</Text>
                  <Text style={styles.suppliedText}>Review products supplied through your assigned workflow</Text>
                </View>
                <Text style={styles.view}>View</Text>
              </Card>
            </Pressable>
            <Text style={styles.section}>Recent Sales</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.sale}>
            <View style={styles.saleIcon}>
              <ShoppingBag size={15} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.saleCustomer}>{saleCustomerName(item)}</Text>
              <Text style={styles.saleMeta}>{item.saleNumber} | {item.items?.length ?? 0} items</Text>
            </View>
            <Text style={styles.saleAmount}>{formatCurrency(saleAmount(item))}</Text>
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
  supplied: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#E0F7FA", borderColor: "#B2EBF2" },
  suppliedTitle: { color: "#006064", fontSize: 12, fontWeight: "800" },
  suppliedText: { color: "#00838F", fontSize: 11, marginTop: 3 },
  view: { color: "#00838F", fontSize: 12, fontWeight: "800" },
  sale: { flexDirection: "row", alignItems: "center", gap: 12 },
  saleIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  saleCustomer: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  saleMeta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 2 },
  saleAmount: { color: colors.foreground, fontSize: 13, fontWeight: "800" }
});
