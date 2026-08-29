import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import BottomSheet from "@gorhom/bottom-sheet";
import { CreditCard, HandCoins, Search } from "lucide-react-native";
import { AppBottomSheet, Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { creditSalesService } from "@/services/credit-sales.service";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing } from "@/theme";
import type { ApiCreditSale, CreditSaleListResponse } from "@/types/creditSale";
import type { PosPaymentMethod } from "@/types/sales";
import { toApiPaymentMethod } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

const paymentMethods: Array<{ label: string; value: Exclude<PosPaymentMethod, "credit"> }> = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
  { label: "Mobile", value: "mobile" }
];

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function CreditSalesScreen() {
  const user = useAuth((state) => state.user);
  const roleName = user?.roleName?.trim();
  const canUseFinancialCredit = Boolean(user?.permissions?.includes("credit-sales.manage") || roleName === "Owner" || roleName === "Admin" || (!roleName && user?.role === "owner"));
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<CreditSaleListResponse | null>(null);
  const [selected, setSelected] = useState<ApiCreditSale | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Exclude<PosPaymentMethod, "credit">>("cash");
  const [paymentDate, setPaymentDate] = useState(todayDate());
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentRef = useRef<BottomSheet>(null);

  const loadCredits = useCallback(async (search = query, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const term = search.trim();
      const data = canUseFinancialCredit
        ? term
          ? await creditSalesService.search(term, { limit: 50 })
          : await creditSalesService.outstanding({ limit: 50 })
        : await creditSalesService.posOutstanding({ limit: 50, search: term || undefined });
      setResponse(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load credit sales.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canUseFinancialCredit, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCredits(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [loadCredits, query]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  const rows = response?.data ?? [];
  const summary = response?.summary;

  const selectedPayments = useMemo(() => selected?.payments ?? [], [selected]);

  const refresh = () => {
    setRefreshing(true);
    void loadCredits(query, false);
  };

  const openPayment = (creditSale: ApiCreditSale) => {
    setSelected(creditSale);
    setAmount(String(money(creditSale.balance)));
    setPaymentDate(todayDate());
    setReference(`CR-${Date.now()}`);
    paymentRef.current?.expand();
  };

  const collectPayment = async () => {
    if (!selected) return;
    const value = Number(amount);
    const balance = money(selected.balance);

    if (!value || value <= 0) {
      Alert.alert("Check amount", "Payment amount must be greater than zero.");
      return;
    }
    if (value > balance) {
      Alert.alert("Check amount", "Payment cannot be greater than the outstanding balance.");
      return;
    }

    setProcessing(true);
    try {
      const collectCreditPayment = canUseFinancialCredit ? creditSalesService.collectPayment : creditSalesService.collectPosPayment;
      const updated = await collectCreditPayment(selected.id, {
        amount: value,
        paymentMethod: toApiPaymentMethod(method),
        paymentDate: new Date(paymentDate).toISOString(),
        referenceNumber: reference.trim() || undefined
      });
      setSelected(updated);
      setAmount(String(money(updated.balance)));
      await loadCredits(query, false);
      if (money(updated.balance) <= 0) {
        paymentRef.current?.close();
      }
    } catch (paymentError) {
      Alert.alert("Payment failed", paymentError instanceof Error ? paymentError.message : "Unable to record credit payment.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading && !response) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Credit Sales" />
        <LoadingState label="Loading credit sales" />
      </View>
    );
  }

  if (error && !response) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Credit Sales" />
        <ErrorState onRetry={() => void loadCredits()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Credit Sales" />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search credit sales" />
            <View style={styles.stats}>
              <Card style={styles.stat}><Text style={styles.statValue}>{summary?.totalCreditSales ?? 0}</Text><Text style={styles.statLabel}>Credits</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(money(summary?.totalOutstandingCredit))}</Text><Text style={styles.statLabel}>Outstanding</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(money(summary?.totalCollected))}</Text><Text style={styles.statLabel}>Collected</Text></Card>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openPayment(item)} accessibilityLabel={`Open ${item.sale.saleNumber}`}>
            <Card style={styles.row}>
              <View style={styles.icon}><HandCoins size={17} color={colors.primary} /></View>
              <View style={styles.body}>
                <Text style={styles.title}>{item.customer.name}</Text>
                <Text style={styles.meta}>{item.sale.saleNumber} | {item.sale.items.length} products | {item.sale.salesperson.name || item.sale.salesperson.username}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.amount}>{formatCurrency(money(item.balance))}</Text>
                <Badge label={item.status} variant={item.status === "PAID" ? "success" : item.isOverdue ? "error" : "warning"} />
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No credit sales found" />}
        contentContainerStyle={styles.list}
      />

      <AppBottomSheet ref={paymentRef} snapPoints={["88%"]}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Credit Payment</Text>
          {selected ? (
            <>
              <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator persistentScrollbar>
                <Card style={styles.totalCard}>
                  <Text style={styles.meta}>{selected.customer.name}</Text>
                  <Text style={styles.largeAmount}>{formatCurrency(money(selected.balance))}</Text>
                  <Text style={styles.meta}>Remaining balance</Text>
                </Card>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amountInput} accessibilityLabel="Credit payment amount" />
                <TextInput value={paymentDate} onChangeText={setPaymentDate} style={styles.amountInput} accessibilityLabel="Payment date" />
                <TextInput value={reference} onChangeText={setReference} style={styles.amountInput} accessibilityLabel="Payment reference" />
                <View style={styles.methodGrid}>
                  {paymentMethods.map((item) => (
                    <Pressable
                      key={item.value}
                      onPress={() => setMethod(item.value)}
                      style={[styles.methodChip, method === item.value && styles.methodChipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay by ${item.label}`}
                    >
                      <CreditCard size={15} color={method === item.value ? colors.surface : colors.primary} />
                      <Text style={[styles.methodText, method === item.value && styles.methodTextActive]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.sectionTitle}>Credit History</Text>
                {selectedPayments.length === 0 ? (
                  <Card><Text style={styles.meta}>No payments collected yet.</Text></Card>
                ) : selectedPayments.map((payment) => (
                  <Card key={payment.id} style={styles.paymentRow}>
                    <View style={styles.body}>
                      <Text style={styles.title}>{payment.paymentMethod}</Text>
                      <Text style={styles.meta}>{new Date(payment.paymentDate).toLocaleDateString()} | {payment.employee?.name ?? "Employee"}</Text>
                    </View>
                    <Text style={styles.amount}>{formatCurrency(money(payment.amount))}</Text>
                  </Card>
                ))}
              </ScrollView>
              <Button label="Record Payment" variant="success" loading={processing} onPress={() => void collectPayment()} />
            </>
          ) : null}
        </View>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 10 },
  headerContent: { gap: 12 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", padding: 10 },
  statValue: { color: colors.foreground, fontSize: 14, fontWeight: "800" },
  statLabel: { color: colors.textPlaceholder, fontSize: 10, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  body: { flex: 1 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  rowRight: { alignItems: "flex-end", gap: 5 },
  amount: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  sheet: { flex: 1, padding: 16, gap: 12 },
  sheetScroll: { gap: 12, paddingBottom: 16 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  totalCard: { alignItems: "center" },
  largeAmount: { color: colors.primary, fontSize: 28, fontWeight: "900", marginTop: 4 },
  amountInput: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground, fontSize: 16, fontWeight: "800" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: { minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  methodTextActive: { color: colors.surface },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  paymentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }
});
