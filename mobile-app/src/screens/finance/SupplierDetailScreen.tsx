import React, { useCallback, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Banknote, Pencil, Truck } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet, Badge, Button, Card, ErrorState, LoadingState, ScreenHeader } from "@/components/common";
import { suppliersService } from "@/services/suppliers.service";
import { colors } from "@/theme";
import type { ApiSupplier, SupplierPaymentHistoryResponse } from "@/types/supplier";
import { formatCurrency } from "@/utils/format";

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

export function SupplierDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const supplierId = route.params?.supplierId as string;
  const [supplier, setSupplier] = useState<ApiSupplier | null>(null);
  const [history, setHistory] = useState<SupplierPaymentHistoryResponse | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentRef = useRef<BottomSheet>(null);

  const loadSupplier = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [supplierResponse, historyResponse] = await Promise.all([
        suppliersService.detail(supplierId),
        suppliersService.paymentHistory(supplierId)
      ]);
      setSupplier(supplierResponse);
      setHistory(historyResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load supplier.");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useFocusEffect(
    useCallback(() => {
      void loadSupplier();
    }, [loadSupplier])
  );

  const openPayment = () => {
    if (!supplier) return;
    setAmount(String(money(supplier.outstandingBalance)));
    setReference(`SUP-${Date.now()}`);
    paymentRef.current?.expand();
  };

  const recordPayment = async () => {
    if (!supplier) return;
    const value = Number(amount);
    if (!value || value <= 0 || value > money(supplier.outstandingBalance)) {
      Alert.alert("Check amount", "Payment must be greater than zero and cannot exceed the supplier balance.");
      return;
    }
    if (!reference.trim()) {
      Alert.alert("Missing reference", "Payment reference is required.");
      return;
    }

    setProcessing(true);
    try {
      await suppliersService.recordPayment(supplier.id, { amount: value, reference: reference.trim() });
      paymentRef.current?.close();
      await loadSupplier();
    } catch (paymentError) {
      Alert.alert("Payment failed", paymentError instanceof Error ? paymentError.message : "Unable to record supplier payment.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading && !supplier) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Supplier Detail" onBack={() => navigation.goBack()} />
        <LoadingState label="Loading supplier" />
      </View>
    );
  }

  if (error || !supplier) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Supplier Detail" onBack={() => navigation.goBack()} />
        <ErrorState onRetry={() => void loadSupplier()} />
      </View>
    );
  }

  const balance = money(supplier.outstandingBalance);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Supplier Detail" onBack={() => navigation.goBack()} right={<Pressable onPress={() => navigation.navigate("SupplierForm", { supplierId })}><Pencil size={18} color={colors.primary} /></Pressable>} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 96 }]}
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        <Card style={styles.hero}>
          <View style={styles.icon}><Truck size={22} color={colors.primary} /></View>
          <View style={styles.heroBody}>
            <Text style={styles.name}>{supplier.companyName}</Text>
            <Text style={styles.meta}>{supplier.phone} | {supplier.contactPerson ?? "No contact"}</Text>
          </View>
          <Badge label={supplier.status} variant={supplier.status === "ACTIVE" ? "success" : "warning"} />
        </Card>

        <Card style={styles.balanceCard}>
          <Text style={styles.meta}>Supplier Balance</Text>
          <Text style={styles.largeAmount}>{formatCurrency(balance)}</Text>
          <Text style={styles.meta}>Supplier credit outstanding</Text>
          {balance > 0 ? <Button label="Record Payment" variant="success" icon={<Banknote size={16} color={colors.successDark} />} onPress={openPayment} /> : null}
        </Card>

        <Text style={styles.sectionTitle}>Purchase Orders</Text>
        {(supplier.purchaseOrders ?? []).length === 0 ? (
          <Card><Text style={styles.meta}>No purchase orders yet.</Text></Card>
        ) : supplier.purchaseOrders?.map((order) => (
          <Card key={order.id} style={styles.row}>
            <View>
              <Text style={styles.title}>{order.orderNumber}</Text>
              <Text style={styles.meta}>{new Date(order.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.balance}>{formatCurrency(money(order.totalAmount))}</Text>
              <Badge label={order.status} variant="warning" />
            </View>
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Goods Supplied</Text>
        {(supplier.goodsSupplied ?? []).length === 0 ? (
          <Card><Text style={styles.meta}>No goods supplied yet.</Text></Card>
        ) : supplier.goodsSupplied?.map((goods) => (
          <Card key={goods.id} style={styles.row}>
            <View>
              <Text style={styles.title}>{goods.supplyNumber}</Text>
              <Text style={styles.meta}>{new Date(goods.supplyDate).toLocaleDateString()}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.balance}>{formatCurrency(money(goods.totalAmount))}</Text>
              <Badge label={goods.status} variant="success" />
            </View>
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Supplier Payments</Text>
        {(history?.paymentHistory ?? []).length === 0 ? (
          <Card><Text style={styles.meta}>No supplier payments yet.</Text></Card>
        ) : history?.paymentHistory.map((payment) => (
          <Card key={payment.id} style={styles.row}>
            <View style={styles.historyBody}>
              <Text style={styles.title}>{payment.description}</Text>
              <Text style={styles.meta}>{new Date(payment.date).toLocaleDateString()}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>

      <AppBottomSheet ref={paymentRef} snapPoints={["52%"]}>
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
          showsVerticalScrollIndicator
          persistentScrollbar
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <Text style={styles.sheetTitle}>Record Supplier Payment</Text>
          <Card style={styles.totalCard}>
            <Text style={styles.meta}>{supplier.companyName}</Text>
            <Text style={styles.largeAmount}>{formatCurrency(balance)}</Text>
            <Text style={styles.meta}>Outstanding balance</Text>
          </Card>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={styles.amountInput} accessibilityLabel="Supplier payment amount" />
          <TextInput value={reference} onChangeText={setReference} style={styles.amountInput} accessibilityLabel="Supplier payment reference" />
          <Button label="Record Payment" variant="success" loading={processing} onPress={recordPayment} />
        </BottomSheetScrollView>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  heroBody: { flex: 1 },
  name: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  title: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  balanceCard: { alignItems: "center", gap: 8 },
  largeAmount: { color: colors.primary, fontSize: 28, fontWeight: "900", marginTop: 4 },
  sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "900" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  rowRight: { alignItems: "flex-end", gap: 5 },
  historyBody: { flex: 1 },
  balance: { color: colors.foreground, fontSize: 14, fontWeight: "900" },
  sheet: { padding: 16, gap: 12 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  totalCard: { alignItems: "center" },
  amountInput: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground, fontSize: 16, fontWeight: "800" }
});
