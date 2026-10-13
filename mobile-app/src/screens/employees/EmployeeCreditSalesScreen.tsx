import React, { useCallback, useMemo, useRef, useState } from "react";
import type GorhomBottomSheet from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Printer, Search, ShoppingBag, Users } from "lucide-react-native";
import { Text } from "@/i18n";
import { AppBottomSheet, Badge, Button, Card, EmptyState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { employeesService } from "@/services/employees.service";
import { creditSalesService } from "@/services/credit-sales.service";
import { printingService } from "@/services/printing.service";
import { salesService } from "@/services/sales.service";
import { colors, spacing } from "@/theme";
import type { EmployeeSalesResponse } from "@/types/employee";
import type { ApiCreditSale } from "@/types/creditSale";
import type { ApiSale } from "@/types/sales";
import type { ReceiptDocument } from "@/types/domain.types";
import { formatCurrency } from "@/utils/format";

type CustomerSales = {
  id: string;
  name: string;
  phone: string;
  sales: ApiSale[];
  total: number;
  balance: number;
};

function customerName(sale: ApiSale) {
  return sale.customer?.companyName || [sale.customer?.firstName, sale.customer?.lastName].filter(Boolean).join(" ") || "Customer";
}

function compactDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isCreditSale(sale: ApiSale) {
  return sale.payments.some((payment) => payment.paymentMethod === "CREDIT") ||
    Number(sale.balanceDue) > 0 ||
    String((sale as ApiSale & { remarks?: string | null }).remarks ?? "").toLowerCase().includes("credit");
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
}

function offlineCreditSalesResponse(employeeId: string, employeeUserId: string, sales: ApiSale[]): EmployeeSalesResponse {
  const creditSales = sales.filter(isCreditSale);
  const totalSalesValue = creditSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const totalCollected = creditSales.reduce((sum, sale) => sum + Number(sale.amountPaid || 0), 0);
  const totalBalanceDue = creditSales.reduce((sum, sale) => sum + Number(sale.balanceDue || 0), 0);
  const completed = creditSales.filter((sale) => sale.status === "COMPLETED");
  return {
    employee: { id: employeeId, userId: employeeUserId, employeeCode: "", firstName: "", lastName: "", status: "ACTIVE", role: null, branch: null },
    summary: {
      transactions: creditSales.length,
      completedSalesCount: completed.length,
      totalSalesValue,
      totalCreditSales: totalBalanceDue,
      totalCollected,
      totalBalanceDue,
      averageSaleValue: completed.length ? totalSalesValue / completed.length : 0
    },
    data: creditSales.sort((left, right) => new Date(right.saleDate).getTime() - new Date(left.saleDate).getTime()),
    meta: { page: 1, limit: creditSales.length, total: creditSales.length, totalPages: creditSales.length ? 1 : 0 }
  };
}

export function EmployeeCreditSalesScreen({ route, navigation }: { route: any; navigation: any }) {
  const employeeId = route.params.employeeId as string;
  const employeeName = route.params.employeeName as string;
  const employeeUserId = route.params.employeeUserId as string;
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const [response, setResponse] = useState<EmployeeSalesResponse | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showingOfflineData, setShowingOfflineData] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<ApiSale | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setShowingOfflineData(false);
    try {
      const result = await employeesService.sales(employeeId, {
        basis: "invoices",
        creditOnly: true,
        limit: 200,
        sortBy: "saleDate",
        sortOrder: "desc"
      });
      setResponse(result);
      // Keep a second employee-scoped sales response on the device. It is used if the
      // specialized employee endpoint is temporarily unavailable while offline.
      void salesService.list({ userId: employeeUserId, limit: 200 }).catch(() => undefined);
    } catch {
      try {
        // This uses the app's saved sales response and queued offline sales when the employee endpoint is unavailable.
        const fallback = await salesService.list({ userId: employeeUserId, limit: 200 });
        setResponse(offlineCreditSalesResponse(employeeId, employeeUserId, fallback.data));
        setShowingOfflineData(true);
      } catch {
        setResponse(offlineCreditSalesResponse(employeeId, employeeUserId, []));
        setShowingOfflineData(true);
      }
    } finally {
      setLoading(false);
    }
  }, [employeeId, employeeUserId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const customers = useMemo<CustomerSales[]>(() => {
    const grouped = new Map<string, CustomerSales>();
    for (const sale of response?.data ?? []) {
      const id = sale.customer?.id ?? sale.customerId ?? `sale-${sale.id}`;
      const current = grouped.get(id) ?? {
        id,
        name: customerName(sale),
        phone: sale.customer?.phone ?? "",
        sales: [],
        total: 0,
        balance: 0
      };
      current.sales.push(sale);
      current.total += Number(sale.totalAmount || 0);
      current.balance += Number(sale.balanceDue || 0);
      grouped.set(id, current);
    }
    const normalized = query.trim().toLowerCase();
    return Array.from(grouped.values())
      .filter((customer) => !normalized || [customer.name, customer.phone, ...customer.sales.map((sale) => sale.saleNumber)].some((value) => value.toLowerCase().includes(normalized)))
      .sort((left, right) => right.total - left.total);
  }, [query, response?.data]);

  // Calculate from the records displayed by this screen so the number includes
  // cached and queued offline credit sales as well as synchronized sales.
  const todayCreditSales = useMemo(() => (
    (response?.data ?? [])
      .filter((sale) => isCreditSale(sale) && isToday(sale.saleDate))
      .reduce((total, sale) => total + Number(sale.totalAmount || 0), 0)
  ), [response?.data]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;

  const openSale = (sale: ApiSale) => {
    setSelectedSale(sale);
    requestAnimationFrame(() => sheetRef.current?.snapToIndex(0));
  };

  const receiptDocument = (sale = selectedSale): ReceiptDocument | null => {
    if (!sale) return null;
    const method = sale.payments.some((payment) => payment.paymentMethod === "CREDIT") ? "credit" : "cash";
    return {
      id: sale.receipt?.receiptNumber ?? sale.saleNumber,
      kind: Number(sale.balanceDue) > 0 ? "credit" : "sale",
      title: "Credit Invoice",
      orderNumber: sale.saleNumber,
      customerName: customerName(sale),
      employeeName,
      items: sale.items.map((item) => ({ productId: item.productId, name: item.product.name, qty: item.quantity, price: Number(item.unitPrice) })),
      subtotal: Number(sale.subtotal),
      tax: Number(sale.taxAmount),
      total: Number(sale.totalAmount),
      paid: Number(sale.amountPaid),
      balance: Number(sale.balanceDue),
      method,
      createdAt: sale.saleDate,
      printed: false,
      paymentLines: sale.payments.map((payment) => ({ date: payment.paymentDate, amount: Number(payment.amount), method: payment.paymentMethod, referenceNumber: payment.referenceNumber }))
    };
  };

  const receiptDocumentFromCreditSale = (creditSale: ApiCreditSale): ReceiptDocument => {
    const total = Number(creditSale.sale.totalAmount);
    const paid = Math.min(total, Math.max(0, Number(creditSale.sale.amountPaid)));
    const balance = Math.max(0, Number(creditSale.sale.balanceDue));
    return {
      id: creditSale.sale.saleNumber,
      kind: balance > 0 ? "credit" : "sale",
      title: "Credit Invoice",
      orderNumber: creditSale.sale.saleNumber,
      customerName: creditSale.customer.name,
      employeeName: creditSale.sale.salesperson.name || creditSale.sale.salesperson.username,
      items: creditSale.sale.items.map((item) => ({ productId: item.productId, name: item.productName, qty: item.quantity, price: Number(item.unitPrice), originalQty: item.originalQuantity, returnedQty: item.returnedQuantity, returnedValue: item.returnedValue == null ? undefined : Number(item.returnedValue), originalTotal: item.originalTotalAmount == null ? undefined : Number(item.originalTotalAmount) })),
      subtotal: Number(creditSale.sale.subtotal),
      tax: Number(creditSale.sale.taxAmount),
      total,
      paid,
      balance,
      method: balance > 0 ? "credit" : "cash",
      createdAt: creditSale.sale.saleDate,
      printed: false,
      paymentLines: [
        ...(creditSale.sale.payments ?? []).filter((payment) => payment.paymentMethod !== "CREDIT"),
        ...creditSale.payments
      ].map((payment) => ({ date: payment.paymentDate, amount: Number(payment.amount), method: payment.paymentMethod, referenceNumber: payment.referenceNumber }))
    };
  };

  const printReceipt = async (sale = selectedSale) => {
    if (!sale) return;
    try {
      // Use the current credit invoice when online. If the device is offline,
      // retain the cached sale and its queued payment data as the print source.
      const latestCreditSale = sale.creditSaleId
        ? await creditSalesService.detail(sale.creditSaleId).catch(() => null)
        : null;
      const receipt = latestCreditSale ? receiptDocumentFromCreditSale(latestCreditSale) : receiptDocument(sale);
      if (receipt) await printingService.print(receipt);
    } catch (error) {
      Alert.alert("Unable to print", error instanceof Error ? error.message : "Unable to print this receipt.");
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Credit Sales" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator persistentScrollbar>
        <Card style={styles.summaryCard}>
          <Text style={styles.employeeName}>{employeeName}</Text>
          <Text style={styles.summaryLabel}>Employee credit sales</Text>
          <Text style={styles.dailyCreditTotal}>Today's credit sales: {formatCurrency(todayCreditSales)}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatCurrency(Number(response?.summary.totalSalesValue ?? 0))}</Text>
              <Text style={styles.statLabel}>Total Credit Sales</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.purple }]}>{formatCurrency(Number(response?.summary.totalCreditSales ?? 0))}</Text>
              <Text style={styles.statLabel}>Outstanding</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{customers.length}</Text>
              <Text style={styles.statLabel}>Customers</Text>
            </View>
          </View>
        </Card>

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search customer or invoice" />

        {showingOfflineData ? <Text style={styles.offlineNotice}>Showing saved data. New offline sales will appear here and sync automatically when the connection returns.</Text> : null}

        {loading ? <LoadingState label="Loading credit sales" /> : customers.length ? customers.map((customer) => {
          const expanded = selectedCustomerId === customer.id;
          return (
            <Card key={customer.id} style={styles.customerCard}>
              <Pressable
                onPress={() => navigation.navigate("CreditCustomerDetails", {
                  customerId: customer.id,
                  readOnly: true,
                  employeeUserId,
                  employeeName,
                  employeeSales: customer.sales
                })}
                style={({ pressed }) => [styles.customerPressable, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`View credit details for ${customer.name}`}
              >
                <View style={styles.customerIcon}><Users size={17} color={colors.primary} /></View>
                <View style={styles.body}>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  <Text style={styles.meta}>{customer.phone || `${customer.sales.length} credit invoice${customer.sales.length === 1 ? "" : "s"}`}</Text>
                  <Text style={styles.viewDetails}>{expanded ? "Hide credit details" : "View credit details"}</Text>
                </View>
                <View style={styles.amounts}>
                  <Text style={styles.amount}>{formatCurrency(customer.total)}</Text>
                  <Text style={styles.meta}>Due: {formatCurrency(customer.balance)}</Text>
                </View>
              </Pressable>
              {expanded ? (
                <View style={styles.invoiceList}>
                  <View style={styles.readOnlyHeader}>
                    <View style={styles.body}>
                      <Text style={styles.sectionTitle}>Credit details</Text>
                      <Text style={styles.meta}>Read only. You can open or print invoices.</Text>
                    </View>
                    <Badge label="read only" variant="primary" />
                  </View>
                  <View style={styles.creditTotals}>
                    <View style={styles.creditStat}>
                      <Text style={styles.meta}>Total credit</Text>
                      <Text style={styles.amount}>{formatCurrency(customer.total)}</Text>
                    </View>
                    <View style={styles.creditStat}>
                      <Text style={styles.meta}>Paid</Text>
                      <Text style={styles.amount}>{formatCurrency(Math.max(0, customer.total - customer.balance))}</Text>
                    </View>
                    <View style={styles.creditStat}>
                      <Text style={styles.meta}>Balance</Text>
                      <Text style={[styles.amount, { color: colors.purple }]}>{formatCurrency(customer.balance)}</Text>
                    </View>
                  </View>
                  <Text style={styles.invoiceHeading}>Credit invoices</Text>
                  {customer.sales.map((sale) => (
                    <View key={sale.id} style={styles.invoiceCard}>
                    <Pressable
                      onPress={() => openSale(sale)}
                      style={({ pressed }) => [styles.invoiceRow, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Open invoice ${sale.saleNumber}`}
                    >
                      <View style={styles.invoiceIcon}><ShoppingBag size={15} color={colors.primary} /></View>
                      <View style={styles.body}>
                        <Text style={styles.invoiceTitle}>{sale.saleNumber}</Text>
                        <Text style={styles.meta}>{compactDate(sale.saleDate)}{sale.localSyncStatus ? " · Waiting to sync" : ""}</Text>
                      </View>
                      <View style={styles.amounts}>
                        <Text style={styles.amount}>{formatCurrency(Number(sale.totalAmount))}</Text>
                        <Text style={styles.meta}>Due: {formatCurrency(Number(sale.balanceDue))}</Text>
                        {sale.localSyncStatus ? <Badge label="offline" variant="warning" /> : null}
                      </View>
                    </Pressable>
                    <Button
                      label="Print Invoice"
                      variant="ghost"
                      icon={<Printer size={16} color={colors.primary} />}
                      onPress={() => void printReceipt(sale)}
                      style={styles.printInvoiceButton}
                    />
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        }) : <EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title={query ? "No matching customers" : "No credit sales recorded"} />}
      </ScrollView>

      {selectedSale ? (
        <AppBottomSheet ref={sheetRef} snapPoints={["82%"]} initialIndex={0} onClose={() => setSelectedSale(null)}>
          <BottomSheetScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator persistentScrollbar>
            <View style={styles.sheetHeader}>
              <View style={styles.body}>
                <Text style={styles.sheetTitle}>{selectedSale.saleNumber}</Text>
                <Text style={styles.meta}>{customerName(selectedSale)} / {compactDate(selectedSale.saleDate)}</Text>
                <Text style={styles.viewDetails}>Read-only invoice</Text>
              </View>
              <View style={styles.actions}>
                <Button label="Print Invoice" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printReceipt()} style={styles.actionButton} />
              </View>
            </View>
            <Card style={styles.detailCard}>
              <Text style={styles.sectionTitle}>Invoice details</Text>
              <DetailRow label="Total" value={formatCurrency(Number(selectedSale.totalAmount))} />
              <DetailRow label="Paid" value={formatCurrency(Number(selectedSale.amountPaid))} />
              <DetailRow label="Balance due" value={formatCurrency(Number(selectedSale.balanceDue))} />
              <DetailRow label="Status" value={`${selectedSale.status} / ${selectedSale.paymentStatus}`} />
            </Card>
            <Card style={styles.detailCard}>
              <Text style={styles.sectionTitle}>Products</Text>
              {selectedSale.items.map((item) => (
                <DetailRow key={item.id} label={`${item.product.name} / ${item.quantity} x ${formatCurrency(Number(item.unitPrice))}`} value={formatCurrency(Number(item.totalAmount))} />
              ))}
            </Card>
            <Card style={styles.detailCard}>
              <Text style={styles.sectionTitle}>Payments</Text>
              {selectedSale.payments.length ? selectedSale.payments.map((payment) => (
                <DetailRow key={payment.id} label={`${payment.paymentMethod} / ${compactDate(payment.paymentDate)}`} value={formatCurrency(Number(payment.amount))} />
              )) : <Text style={styles.meta}>No payments recorded.</Text>}
            </Card>
          </BottomSheetScrollView>
        </AppBottomSheet>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.meta}>{label}</Text><Text style={styles.amount}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 12 },
  summaryCard: { gap: 8 },
  employeeName: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  summaryLabel: { color: colors.textPlaceholder, fontSize: 12 },
  dailyCreditTotal: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 8, marginTop: 4 },
  stat: { flex: 1, gap: 3 },
  statValue: { color: colors.foreground, fontSize: 14, fontWeight: "900" },
  statLabel: { color: colors.textPlaceholder, fontSize: 10 },
  customerCard: { gap: 10 },
  customerPressable: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54 },
  customerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  body: { flex: 1 },
  customerName: { color: colors.textSecondary, fontSize: 14, fontWeight: "900" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  viewDetails: { color: colors.primary, fontSize: 11, fontWeight: "800", marginTop: 5 },
  amounts: { alignItems: "flex-end" },
  amount: { color: colors.foreground, fontSize: 13, fontWeight: "900" },
  invoiceList: { borderTopWidth: 1, borderTopColor: colors.borderLighter, paddingTop: 8, gap: 8 },
  readOnlyHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  creditTotals: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  creditStat: { flex: 1, gap: 2 },
  invoiceHeading: { color: colors.textSecondary, fontSize: 12, fontWeight: "900", marginTop: 2 },
  invoiceCard: { gap: 6, borderTopWidth: 1, borderTopColor: colors.borderLighter, paddingTop: 8 },
  invoiceRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 },
  invoiceIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  invoiceTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  printInvoiceButton: { minHeight: 42 },
  pressed: { opacity: 0.82 },
  offlineNotice: { color: colors.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 2 },
  sheetContent: { padding: 16, paddingBottom: 48, gap: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, flexShrink: 1 },
  actionButton: { minHeight: 42, paddingHorizontal: 10 },
  detailCard: { gap: 10 },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "900" },
  detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: colors.borderLighter, paddingTop: 9 }
});
