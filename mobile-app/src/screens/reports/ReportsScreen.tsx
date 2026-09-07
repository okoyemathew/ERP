import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card } from "@/components/common";
import { ErrorState, LoadingState } from "@/components/common/StateViews";
import { AreaChart, PieChart } from "@/components/charts";
import { ScrollScreen } from "@/screens/shared/ScreenKit";
import { printingService } from "@/services/printing.service";
import { reportsService } from "@/services/reports.service";
import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/theme";
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
  const businessName = useAuth((state) => state.business?.name);
  const [period, setPeriod] = useState<Period>("daily");
  const [salesReport, setSalesReport] = useState<ReportResponse | null>(null);
  const [profitReport, setProfitReport] = useState<ReportResponse | null>(null);
  const [expenseReport, setExpenseReport] = useState<ReportResponse | null>(null);
  const [statistics, setStatistics] = useState<DashboardStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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

  const buildExportText = () => {
    const paymentBreakdown = salesReport?.paymentBreakdown as Array<{ paymentMethod?: string; totalAmount?: string | number }> | undefined;
    const salesRows = salesReport?.data as Array<Record<string, unknown>> | undefined;
    const lines = [
      businessName ?? "Business",
      `${period.toUpperCase()} REPORT`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "SUMMARY",
      `Revenue: ${formatCurrency(numberValue(summary.totalSales))}`,
      `Profit: ${formatCurrency(numberValue(profitSummary.netProfit))}`,
      `Orders: ${numberValue(summary.transactionCount)}`,
      `Expenses: ${formatCurrency(numberValue(expenseSummary.totalExpenses))}`,
      "",
      "SALES BY PAYMENT",
      ...(paymentBreakdown?.length
        ? paymentBreakdown.map((row) => `${row.paymentMethod ?? "Other"}: ${formatCurrency(numberValue(row.totalAmount))}`)
        : ["No payment sales found"]),
      "",
      "LAST 7 DAYS REVENUE",
      ...(chartData.length
        ? chartData.map((row) => `${row.label}: ${formatCurrency(numberValue(row.revenue))}`)
        : ["No revenue data found"]),
      "",
      "REPORT DATA",
      ...(salesRows?.length
        ? salesRows.slice(0, 20).map((row, index) => {
            const label = String(row.saleNumber ?? row.period ?? row.date ?? `Row ${index + 1}`);
            const amount = numberValue(row.totalAmount ?? row.revenue ?? row.amount);
            return `${label}: ${formatCurrency(amount)}`;
          })
        : ["No detailed rows found"])
    ];

    return lines.join("\n");
  };

  const exportReport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await printingService.printText(buildExportText());
    } catch (exportError) {
      Alert.alert("Export failed", exportError instanceof Error ? exportError.message : "Unable to export report.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <ScrollScreen title="Reports">
        <LoadingState label="Loading reports" />
      </ScrollScreen>
    );
  }

  if (error) {
    return (
      <ScrollScreen title="Reports">
        <ErrorState onRetry={() => void load()} />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen title="Reports">
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
      <Button label="Export Report" loading={exporting} onPress={() => void exportReport()} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8 },
  tab: { color: colors.primary, backgroundColor: colors.secondaryBg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, fontSize: 11, fontWeight: "800" },
  activeTab: { color: colors.surface, backgroundColor: colors.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { width: "47.8%" },
  value: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  label: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  title: { color: colors.textSecondary, fontSize: 14, fontWeight: "800", marginBottom: 8 }
});
