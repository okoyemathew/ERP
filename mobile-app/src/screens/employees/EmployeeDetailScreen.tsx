import React, { useCallback, useEffect, useRef, useState } from "react";
import type GorhomBottomSheet from "@gorhom/bottom-sheet";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreditCard, Printer, Search, ShoppingBag } from "lucide-react-native";
import { AppBottomSheet, Avatar, Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar, statusVariant } from "@/components/common";
import { employeesService } from "@/services/employees.service";
import { printingService } from "@/services/printing.service";
import { salesService } from "@/services/sales.service";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme";
import type { ApiEmployee, EmployeeProfileResponse, EmployeeSalesResponse } from "@/types/employee";
import type { ApiSale } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

function customerName(sale: ApiSale) {
  return sale.customer
    ? sale.customer.companyName ||
        [sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(" ")
    : "Walk-in Customer";
}

function salePaymentMethod(sale: ApiSale) {
  return sale.payments[0]?.paymentMethod ?? (Number(sale.balanceDue) > 0 ? "CREDIT" : "UNPAID");
}

export function EmployeeDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const employeeId = route.params?.employeeId as string;
  const insets = useSafeAreaInsets();
  const saleSheetRef = useRef<GorhomBottomSheet>(null);
  const canManage = useAuthStore((state) => state.can("employees.manage"));
  const canManageRoles = useAuthStore((state) => state.can("roles.manage"));
  const [profile, setProfile] = useState<EmployeeProfileResponse | null>(null);
  const [sales, setSales] = useState<EmployeeSalesResponse | null>(null);
  const [salesQuery, setSalesQuery] = useState("");
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState(false);
  const [loadingMoreSales, setLoadingMoreSales] = useState(false);
  const [selectedSale, setSelectedSale] = useState<ApiSale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await employeesService.profile(employeeId);
      setProfile(response);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  const loadSales = useCallback(async (page = 1, showSpinner = true) => {
    if (showSpinner) setSalesLoading(true);
    if (page > 1) setLoadingMoreSales(true);
    setSalesError(false);
    try {
      const response = await employeesService.sales(employeeId, {
        page,
        limit: 10,
        search: salesQuery.trim() || undefined,
        sortBy: "saleDate",
        sortOrder: "desc"
      });
      setSales((current) =>
        page > 1 && current
          ? { ...response, data: [...current.data, ...response.data] }
          : response
      );
    } catch {
      setSalesError(true);
    } finally {
      setSalesLoading(false);
      setLoadingMoreSales(false);
    }
  }, [employeeId, salesQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSales(1, !sales);
    }, 350);
    return () => clearTimeout(timer);
  }, [loadSales]);

  const updateStatus = async (action: "activate" | "deactivate" | "suspend") => {
    if (!profile) return;
    try {
      if (action === "activate") await employeesService.activate(profile.employee.id);
      if (action === "deactivate") await employeesService.deactivate(profile.employee.id);
      if (action === "suspend") await employeesService.suspend(profile.employee.id);
      await load();
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "Unable to update employee status.";
      Alert.alert("Unable to update", message);
    }
  };

  const openSale = (sale: ApiSale) => {
    setSelectedSale(sale);
    saleSheetRef.current?.snapToIndex(0);
  };

  const printSalesRecord = async () => {
    if (!profile) return;
    try {
      const response = await employeesService.printSales(profile.employee.id, {
        search: salesQuery.trim() || undefined,
        sortBy: "saleDate",
        sortOrder: "desc"
      });
      await printingService.printText(response.text);
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print sales record.";
      Alert.alert("Unable to print", message);
    }
  };

  const printReceipt = async () => {
    if (!selectedSale?.receipt?.id) return;
    try {
      const response = await salesService.printReceipt(selectedSale.receipt.id);
      await printingService.printText(response.text);
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print receipt.";
      Alert.alert("Unable to print", message);
    }
  };

  const toggleLogin = async (employee: ApiEmployee) => {
    try {
      await employeesService.setLoginAccess(employee.id, !employee.canLogin);
      await load();
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Unable to update login access.";
      Alert.alert("Unable to update", message);
    }
  };

  if (loading) return <LoadingState label="Loading employee" />;
  if (error || !profile) return <ErrorState onRetry={load} />;

  const employee = profile.employee;
  const name = `${employee.firstName} ${employee.lastName}`.trim() || employee.user.username;
  const latestSession = profile.recentSessions[0];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Employee Detail" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
          <Avatar name={name} imageUri={employee.profileImage ?? undefined} size={64} />
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.role}>{employee.user.role?.name ?? "No role"} | {employee.status}</Text>
        </LinearGradient>
        <View style={styles.grid}>
          <Card style={styles.stat}><Text style={styles.value}>{profile.summary.salesCount}</Text><Text style={styles.label}>Sales</Text></Card>
          <Card style={styles.stat}><Text style={styles.value}>{profile.summary.activeSessions}</Text><Text style={styles.label}>Active sessions</Text></Card>
        </View>
        <View style={styles.content}>
          <Card style={styles.infoCard}>
            <Info label="Employee Code" value={employee.employeeCode} />
            <Info label="Department" value={employee.department ?? "Not set"} />
            <Info label="Designation" value={employee.designation ?? "Not set"} />
            <Info label="Phone" value={employee.phone ?? "Not set"} />
            <Info label="Email" value={employee.email ?? "Not set"} />
            <Info label="Last Login" value={employee.lastLogin ?? employee.user.lastLogin ?? "No login recorded"} />
            <Info label="Device" value={latestSession?.deviceName ?? latestSession?.deviceType ?? employee.deviceId ?? "No device recorded"} />
            <Info label="Login Access" value={employee.canLogin ? "Enabled" : "Disabled"} />
          </Card>

          <Card style={styles.salesCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Sales</Text>
                <Text style={styles.sectionMeta}>Completed totals from recorded sales</Text>
              </View>
              <Button label="Print" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printSalesRecord()} style={styles.smallButton} />
            </View>
            <View style={styles.salesStats}>
              <View style={styles.salesStat}>
                <Text style={styles.value}>{formatCurrency(Number(sales?.summary.totalSalesValue ?? 0))}</Text>
                <Text style={styles.label}>Total Sales</Text>
              </View>
              <View style={styles.salesStat}>
                <Text style={styles.value}>{sales?.summary.completedSalesCount ?? 0}</Text>
                <Text style={styles.label}>Completed</Text>
              </View>
            </View>
            <SearchBar value={salesQuery} onChangeText={setSalesQuery} placeholder="Search employee sales" />
            {salesLoading ? (
              <LoadingState label="Loading sales" />
            ) : salesError ? (
              <ErrorState onRetry={() => void loadSales()} />
            ) : sales?.data.length ? (
              <View style={styles.salesList}>
                {sales.data.map((sale) => (
                  <Pressable key={sale.id} style={styles.saleRow} onPress={() => openSale(sale)} accessibilityRole="button" accessibilityLabel={`Open ${sale.saleNumber}`}>
                    <View style={styles.saleIcon}><ShoppingBag size={15} color={colors.primary} /></View>
                    <View style={styles.saleBody}>
                      <Text style={styles.item}>{sale.saleNumber}</Text>
                      <Text style={styles.label}>{new Date(sale.saleDate).toLocaleDateString()} | {salePaymentMethod(sale)}</Text>
                    </View>
                    <View style={styles.saleRight}>
                      <Text style={styles.item}>{formatCurrency(Number(sale.totalAmount))}</Text>
                      <Badge label={sale.status} variant={statusVariant(sale.status)} />
                    </View>
                  </Pressable>
                ))}
                {sales.meta.page < sales.meta.totalPages ? (
                  <Button label={loadingMoreSales ? "Loading" : "Load More"} variant="ghost" loading={loadingMoreSales} onPress={() => void loadSales(sales.meta.page + 1, false)} />
                ) : null}
              </View>
            ) : (
              <EmptyState icon={<Search size={24} color={colors.textPlaceholder} />} title="No sales found" />
            )}
          </Card>

          {canManage ? (
            <View style={styles.actions}>
              <Button label="Edit Employee" onPress={() => navigation.navigate("EmployeeForm", { employeeId: employee.id })} />
              <Button label={employee.canLogin ? "Disable Login" : "Enable Login"} variant="ghost" onPress={() => void toggleLogin(employee)} />
              <Button label={employee.status === "ACTIVE" ? "Deactivate" : "Activate"} variant={employee.status === "ACTIVE" ? "danger" : "success"} onPress={() => void updateStatus(employee.status === "ACTIVE" ? "deactivate" : "activate")} />
              {canManageRoles ? <Button label="Suspend" variant="ghost" onPress={() => void updateStatus("suspend")} /> : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <AppBottomSheet ref={saleSheetRef} snapPoints={["82%"]} onClose={() => setSelectedSale(null)}>
        <ScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {selectedSale ? (
            <>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>{selectedSale.saleNumber}</Text>
                  <Text style={styles.sectionMeta}>{new Date(selectedSale.saleDate).toLocaleString()}</Text>
                </View>
                {selectedSale.receipt?.id ? <Button label="Receipt" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printReceipt()} style={styles.smallButton} /> : null}
              </View>
              <Card style={styles.infoCard}>
                <Info label="Employee" value={name} />
                <Info label="Customer" value={customerName(selectedSale)} />
                <Info label="Payment" value={salePaymentMethod(selectedSale)} />
                <Info label="Status" value={`${selectedSale.status} / ${selectedSale.paymentStatus}`} />
                <Info label="Subtotal" value={formatCurrency(Number(selectedSale.subtotal))} />
                <Info label="Discount" value={formatCurrency(Number(selectedSale.discountAmount))} />
                <Info label="Tax" value={formatCurrency(Number(selectedSale.taxAmount))} />
                <Info label="Total" value={formatCurrency(Number(selectedSale.totalAmount))} />
              </Card>
              <Card style={styles.infoCard}>
                <Text style={styles.sectionTitle}>Products</Text>
                {selectedSale.items.map((item) => (
                  <View key={item.id} style={styles.productRow}>
                    <View style={styles.saleBody}>
                      <Text style={styles.item}>{item.product.name}</Text>
                      <Text style={styles.label}>Qty {item.quantity} x {formatCurrency(Number(item.unitPrice))}</Text>
                    </View>
                    <Text style={styles.item}>{formatCurrency(Number(item.totalAmount))}</Text>
                  </View>
                ))}
              </Card>
              <Card style={styles.infoCard}>
                <Text style={styles.sectionTitle}>Payments</Text>
                {selectedSale.payments.length ? selectedSale.payments.map((payment) => (
                  <View key={payment.id} style={styles.productRow}>
                    <View style={styles.saleBody}>
                      <Text style={styles.item}>{payment.paymentMethod}</Text>
                      <Text style={styles.label}>{new Date(payment.paymentDate).toLocaleDateString()}</Text>
                    </View>
                    <Text style={styles.item}>{formatCurrency(Number(payment.amount))}</Text>
                  </View>
                )) : <Text style={styles.label}>No payments recorded</Text>}
              </Card>
            </>
          ) : null}
        </ScrollView>
      </AppBottomSheet>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.item}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1 },
  hero: { padding: 20, alignItems: "center", gap: 6 },
  name: { color: colors.surface, fontSize: 20, fontWeight: "800" },
  role: { color: "rgba(255,255,255,0.72)", fontSize: 12 },
  grid: { flexDirection: "row", gap: 12, padding: 16 },
  stat: { flex: 1, alignItems: "center" },
  value: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
  label: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  content: { paddingHorizontal: 16, gap: 10 },
  infoCard: { gap: 12 },
  infoRow: { gap: 3 },
  item: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  actions: { gap: 10 },
  salesCard: { gap: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "800" },
  sectionMeta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  smallButton: { minHeight: 44, paddingHorizontal: 12 },
  salesStats: { flexDirection: "row", gap: 10 },
  salesStat: { flex: 1, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, padding: 12 },
  salesList: { gap: 8 },
  saleRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, padding: 10 },
  saleIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  saleBody: { flex: 1, gap: 3 },
  saleRight: { alignItems: "flex-end", gap: 5 },
  sheetContent: { padding: 16, gap: 12 },
  productRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }
});
