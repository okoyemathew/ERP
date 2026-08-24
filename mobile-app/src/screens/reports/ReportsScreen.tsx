import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ScreenHeader } from "@/components/common";
import { ErrorState, LoadingState } from "@/components/common/StateViews";
import { AreaChart, PieChart } from "@/components/charts";
import { reportsService } from "@/services/reports.service";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing } from "@/theme";
import type { DashboardStatistics, ReportResponse } from "@/types/report";
import { formatCurrency } from "@/utils/format";

type Period = "daily" | "weekly" | "monthly" | "yearly";

const tabs: Array<{ label: string; value: Period }> = [
  { label: "Day", value: "daily" },
  { label: "Week", value: "weekly" },
  { label: "Month", value: "monthly" },
  { label: "Year", value: "yearly" }
];

const numberValue = (value: unknown) => Number(value ?? 0);

export function ReportsScreen() {
  const businessId = useAuth((state) => state.business?.id);
  const [period, setPeriod] = useState<Period>("daily");
  const [salesReport, setSalesReport] = useState<ReportResponse | null>(null);
  const [profitReport, setProfitReport] = useState<ReportResponse | null>(null);
  const [expenseReport, setExpenseReport] = useState<ReportResponse | null>(null);
  const [statistics, setStatistics] = useState<DashboardStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [sales, profit, expenses, stats] = await Promise.all([
        reportsService.sales(period),
        reportsService.profit(),
        reportsService.expenses(period === "daily" ? "day" : period.replace("ly", "")),
        reportsService.dashboardStatistics(businessId)
      ]);
      setSalesReport(sales);
      setProfitReport(profit);
      setExpenseReport(expenses);
      setStatistics(stats);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [businessId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = salesReport?.summary ?? {};
  const profitSummary = profitReport?.summary ?? {};
  const expenseSummary = expenseReport?.summary ?? {};
  const chartData = useMemo(
    () =>
      (statistics?.salesLast7Days ?? []).map((row) => ({
        label: row.date.slice(5),
        revenue: row.revenue
      })),
    [statistics]
  );
  const pieData = useMemo(() => {
    const paymentBreakdown = salesReport?.paymentBreakdown as Array<{ paymentMethod?: string; totalAmount?: string | number }> | undefined;
    const palette = [colors.primary, colors.success, colors.orange, colors.purple, colors.warning];
    return (paymentBreakdown ?? [])
      .map((row, index) => ({
        name: row.paymentMethod ?? "Other",
        value: Number(row.totalAmount ?? 0),
        color: palette[index % palette.length]
      }))
      .filter((row) => row.value > 0);
  }, [salesReport]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Reports" />
        <LoadingState label="Loading reports" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Reports" />
        <ErrorState onRetry={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Reports" />
      <View style={styles.content}>
        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <Pressable key={tab.value} onPress={() => setPeriod(tab.value)}>
              <Text style={[styles.tab, period === tab.value && styles.activeTab]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.grid}>
          <Card style={styles.stat}><Text style={styles.value}>{formatCurrency(numberValue(summary.totalSales))}</Text><Text style={styles.label}>Revenue</Text></Card>
          <Card style={styles.stat}><Text style={styles.value}>{formatCurrency(numberValue(profitSummary.netProfit))}</Text><Text style={styles.label}>Profit</Text></Card>
          <Card style={styles.stat}><Text style={styles.value}>{numberValue(summary.transactionCount)}</Text><Text style={styles.label}>Orders</Text></Card>
          <Card style={styles.stat}><Text style={styles.value}>{formatCurrency(numberValue(expenseSummary.totalExpenses))}</Text><Text style={styles.label}>Expenses</Text></Card>
        </View>
        <Card><Text style={styles.title}>Revenue vs Profit</Text><AreaChart data={chartData.length ? chartData : [{ label: "Today", revenue: 0 }]} /></Card>
        <Card><Text style={styles.title}>Sales by Payment</Text><PieChart data={pieData.length ? pieData : [{ name: "No Sales", value: 1, color: colors.borderLight }]} /></Card>
        <Button label="Export Report" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 12 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { color: colors.primary, backgroundColor: colors.secondaryBg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, fontSize: 11, fontWeight: "800" },
  activeTab: { color: colors.surface, backgroundColor: colors.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { width: "47.8%" },
  value: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  label: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  title: { color: colors.textSecondary, fontSize: 14, fontWeight: "800", marginBottom: 8 }
});
