import React, { useCallback, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { Banknote, CreditCard, Pencil, Printer, Smartphone } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReceiptTicket } from "@/components/receipt";
import { AppBottomSheet, Avatar, Badge, Button, Card, ErrorState, LoadingState, ScreenHeader } from "@/components/common";
import { customersService } from "@/services/customers.service";
import { printingService } from "@/services/printing.service";
import { colors } from "@/theme";
import type { ReceiptDocument, SaleItem } from "@/types/domain.types";
import type { CustomerCreditSale, CustomerPaymentMethod, CustomerPaymentHistoryItem, CustomerProfileResponse, CustomerSale } from "@/types/customer";
import { customerDisplayName } from "@/types/customer";
import { formatCurrency } from "@/utils/format";

const methods: Array<{ label: string; value: CustomerPaymentMethod; icon: React.ReactNode }> = [
  { label: "Cash", value: "CASH", icon: <Banknote size={15} color={colors.primary} /> },
  { label: "Card", value: "CARD", icon: <CreditCard size={15} color={colors.primary} /> },
  { label: "Mobile", value: "MOBILE_MONEY", icon: <Smartphone size={15} color={colors.primary} /> }
];

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function saleTotal(sale: CustomerSale): number {
  return money(sale.totalAmount);
}

function paymentAmount(item: CustomerPaymentHistoryItem): number {
  return money(item.payment.amount);
}

function creditInvoicePaid(credit: CustomerCreditSale): number {
  const invoiceTotal = money(credit.sale?.totalAmount ?? credit.totalCredit);
  const remainingBalance = Math.max(0, money(credit.balance));
  return Math.max(0, Math.min(invoiceTotal, invoiceTotal - remainingBalance));
}

function receiptMethodFromPayment(method: CustomerPaymentMethod): ReceiptDocument["method"] {
  if (method === "CARD") return "card";
  if (method === "MOBILE_MONEY") return "mobile";
  if (method === "BANK_TRANSFER") return "bank";
  return "cash";
}

export function CustomerDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const customerId = route.params?.customerId as string;
  const [profile, setProfile] = useState<CustomerProfileResponse | null>(null);
  const [purchases, setPurchases] = useState<CustomerSale[]>([]);
  const [payments, setPayments] = useState<CustomerPaymentHistoryItem[]>([]);
  const [credits, setCredits] = useState<CustomerCreditSale[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<CustomerCreditSale | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptDocument | null>(null);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [receiptSheetVisible, setReceiptSheetVisible] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CustomerPaymentMethod>("CASH");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentRef = useRef<BottomSheet>(null);
  const receiptRef = useRef<BottomSheet>(null);

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileResponse, purchaseResponse, paymentResponse, creditResponse] = await Promise.all([
        customersService.profile(customerId),
        customersService.purchaseHistory(customerId, { limit: 10 }),
        customersService.paymentHistory(customerId, { limit: 10 }),
        customersService.creditHistory(customerId, { limit: 10 }).catch(() => ({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }))
      ]);
      setProfile(profileResponse);
      setPurchases(purchaseResponse.data);
      setPayments(paymentResponse.data);
      setCredits(creditResponse.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load customer.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomer();
    }, [loadCustomer])
  );

  const customer = profile?.customer;
  const summary = profile?.summary;
  const name = customer ? customerDisplayName(customer) : "";

  const openPayment = (credit: CustomerCreditSale) => {
    setSelectedCredit(credit);
    setAmount(String(money(credit.balance)));
    setPaymentSheetVisible(true);
  };

  const buildCreditInvoiceReceipt = (
    credit: CustomerCreditSale,
    override?: {
      paid?: number;
      balance?: number;
      method?: ReceiptDocument["method"];
      paymentLines?: ReceiptDocument["paymentLines"];
    }
  ): ReceiptDocument => {
    const invoiceTotal = money(credit.sale?.totalAmount ?? credit.totalCredit);
    const amountPaid = override?.paid ?? creditInvoicePaid(credit);
    const remainingBalance = override?.balance ?? Math.max(0, money(credit.balance));
    const receiptItems: SaleItem[] = (credit.sale?.items ?? []).map((item) => ({
      productId: item.product?.id ?? item.id,
      name: item.product?.name ?? "Product",
      qty: Number(item.quantity),
      price: money(item.unitPrice)
    }));

    return {
      id: credit.sale?.saleNumber ?? credit.id.slice(0, 8).toUpperCase(),
      kind: remainingBalance > 0 ? "credit" : "sale",
      businessName: "EST JP MOTORS",
      title: "Credit Invoice",
      orderNumber: credit.sale?.saleNumber ?? credit.id.slice(0, 8).toUpperCase(),
      customerName: name,
      items: receiptItems,
      subtotal: invoiceTotal,
      tax: 0,
      total: invoiceTotal,
      paid: amountPaid,
      balance: remainingBalance,
      method: override?.method ?? (remainingBalance > 0 ? "credit" : "cash"),
      createdAt: credit.sale?.saleDate ?? credit.createdAt,
      printed: false,
      paymentLines: override?.paymentLines ?? credit.payments?.map((payment) => ({
        date: payment.paymentDate,
        amount: money(payment.amount),
        method: payment.paymentMethod,
        referenceNumber: payment.referenceNumber
      }))
    };
  };

  const openCreditInvoice = (credit: CustomerCreditSale) => {
    setActiveReceipt(buildCreditInvoiceReceipt(credit));
    setReceiptSheetVisible(true);
  };

  const handlePayment = async () => {
    if (!selectedCredit) return;
    const value = Number(amount);
    const balance = money(selectedCredit.balance);
    if (!value || value <= 0 || value > balance) {
      Alert.alert("Check amount", "Payment must be greater than zero and cannot exceed the credit balance.");
      return;
    }

    setProcessing(true);
    try {
      const paidBeforePayment = creditInvoicePaid(selectedCredit);
      const remainingAfterPayment = Math.max(0, balance - value);
      const paidAfterPayment = Math.min(money(selectedCredit.sale?.totalAmount ?? selectedCredit.totalCredit), paidBeforePayment + value);
      const paymentLine = {
        date: new Date().toISOString(),
        amount: value,
        method,
        referenceNumber: null
      };
      await customersService.collectCreditPayment(customerId, {
        amount: value,
        paymentMethod: method,
        creditSaleId: selectedCredit.id,
        referenceNumber: `MOB-${Date.now()}`
      });
      paymentRef.current?.close();
      setPaymentSheetVisible(false);
      setActiveReceipt(buildCreditInvoiceReceipt(selectedCredit, {
        paid: paidAfterPayment,
        balance: remainingAfterPayment,
        method: receiptMethodFromPayment(method),
        paymentLines: [...(selectedCredit.payments ?? []).map((payment) => ({
          date: payment.paymentDate,
          amount: money(payment.amount),
          method: payment.paymentMethod,
          referenceNumber: payment.referenceNumber
        })), paymentLine]
      }));
      setReceiptSheetVisible(true);
      setSelectedCredit(null);
      await loadCustomer();
    } catch (paymentError) {
      Alert.alert("Payment failed", paymentError instanceof Error ? paymentError.message : "Unable to collect payment.");
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintInvoice = async () => {
    if (!activeReceipt) return;
    await printingService.print(activeReceipt);
    setActiveReceipt({ ...activeReceipt, printed: true });
  };

  if (loading && !profile) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Customer Detail" onBack={() => navigation.goBack()} />
        <LoadingState label="Loading customer" />
      </View>
    );
  }

  if (error || !customer || !summary) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Customer Detail" onBack={() => navigation.goBack()} />
        <ErrorState onRetry={() => void loadCustomer()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Customer Detail" onBack={() => navigation.goBack()} right={<Pressable onPress={() => navigation.navigate("CustomerForm", { customerId })}><Pencil size={18} color={colors.primary} /></Pressable>} />
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Avatar name={name} size={60} />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.phone}>{customer.phone}</Text>
        <View style={styles.stats}>
          <Text style={styles.stat}>Spent {formatCurrency(money(summary.totalSales))}</Text>
          <Text style={styles.stat}>Owes {formatCurrency(money(summary.outstandingBalance))}</Text>
        </View>
      </LinearGradient>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 96 }]}
        showsVerticalScrollIndicator
        persistentScrollbar
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sectionTitle}>Credit Invoices</Text>
        {credits.length === 0 ? (
          <Card><Text style={styles.meta}>No credit invoices for this customer.</Text></Card>
        ) : credits.map((credit) => (
          <Card key={credit.id} style={styles.invoice}>
            <View style={styles.invoiceHead}>
              <View>
                <Text style={styles.title}>{credit.sale?.saleNumber ?? credit.id.slice(0, 8)}</Text>
                <Text style={styles.meta}>Due balance {formatCurrency(money(credit.balance))}</Text>
              </View>
              <Badge label={credit.status} variant={money(credit.balance) <= 0 ? "success" : credit.status === "PARTIALLY_PAID" ? "warning" : "error"} />
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.meta}>Total credit</Text>
              <Text style={styles.balance}>{formatCurrency(money(credit.totalCredit))}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.meta}>Paid</Text>
              <Text style={styles.balance}>{formatCurrency(money(credit.sale?.amountPaid ?? credit.amountPaid))}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.meta}>Remaining balance</Text>
              <Text style={styles.balance}>{formatCurrency(money(credit.sale?.balanceDue ?? credit.balance))}</Text>
            </View>
            <Button
              label="Print Invoice"
              variant="ghost"
              icon={<Printer size={16} color={colors.primary} />}
              onPress={() => {
                console.log("CUSTOMER_DETAIL_PRINT_INVOICE_PRESSED", credit.id);
                openCreditInvoice(credit);
              }}
            />
            {money(credit.balance) > 0 ? (
              <Button
                label="Confirm Payment"
                variant="success"
                onPress={() => {
                  console.log("CUSTOMER_DETAIL_CONFIRM_PAYMENT_PRESSED", credit.id);
                  openPayment(credit);
                }}
              />
            ) : null}
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Purchase History</Text>
        {purchases.length === 0 ? (
          <Card><Text style={styles.meta}>No purchases yet.</Text></Card>
        ) : purchases.map((sale) => (
          <Card key={sale.id} style={styles.paymentRow}>
            <View>
              <Text style={styles.title}>{sale.saleNumber}</Text>
              <Text style={styles.meta}>{new Date(sale.saleDate).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.balance}>{formatCurrency(saleTotal(sale))}</Text>
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Payment History</Text>
        {payments.length === 0 ? (
          <Card><Text style={styles.meta}>No customer payments yet.</Text></Card>
        ) : payments.map((payment, index) => (
          <Card key={`${payment.type}-${index}`} style={styles.paymentRow}>
            <View>
              <Text style={styles.title}>{payment.type.replace("_", " ")}</Text>
              <Text style={styles.meta}>{new Date(payment.date).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.balance}>{formatCurrency(paymentAmount(payment))}</Text>
          </Card>
        ))}
      </ScrollView>
      {paymentSheetVisible ? <AppBottomSheet ref={paymentRef} snapPoints={["64%"]} initialIndex={0} onClose={() => {
        setPaymentSheetVisible(false);
        setSelectedCredit(null);
      }}>
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
          showsVerticalScrollIndicator
          persistentScrollbar
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
        >
          <Text style={styles.sheetTitle}>Confirm Payment</Text>
          {selectedCredit ? (
            <>
              <Card style={styles.totalCard}>
                <Text style={styles.meta}>{selectedCredit.sale?.saleNumber ?? selectedCredit.id.slice(0, 8)}</Text>
                <Text style={styles.largeAmount}>{formatCurrency(money(selectedCredit.balance))}</Text>
                <Text style={styles.meta}>Outstanding credit balance</Text>
              </Card>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={styles.amountInput} accessibilityLabel="Payment amount" />
              <View style={styles.methodRow}>
                {methods.map((item) => (
                  <Pressable key={item.value} onPress={() => setMethod(item.value)} style={[styles.methodChip, method === item.value && styles.methodChipActive]}>
                    {item.icon}
                    <Text style={[styles.methodText, method === item.value && styles.methodTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Button
                label="Confirm Payment"
                variant="success"
                loading={processing}
                onPress={() => {
                  console.log("CUSTOMER_DETAIL_PAYMENT_SUBMIT_PRESSED", selectedCredit.id);
                  void handlePayment();
                }}
              />
            </>
          ) : null}
        </BottomSheetScrollView>
      </AppBottomSheet> : null}
      {receiptSheetVisible ? <AppBottomSheet ref={receiptRef} snapPoints={["90%"]} initialIndex={0} onClose={() => {
        setReceiptSheetVisible(false);
        setActiveReceipt(null);
      }}>
        <View style={styles.receiptSheet}>
          <View style={styles.receiptHeader}>
            <Text style={styles.sheetTitle}>Invoice Preview</Text>
            <Button
              label="Print"
              variant="ghost"
              icon={<Printer size={16} color={colors.primary} />}
              onPress={() => {
                console.log("CUSTOMER_DETAIL_PRINT_SUBMIT_PRESSED", activeReceipt?.id);
                void handlePrintInvoice();
              }}
              style={styles.printButton}
            />
          </View>
          <BottomSheetScrollView
            style={styles.sheetScroller}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 48 }}
            showsVerticalScrollIndicator
            persistentScrollbar
            nestedScrollEnabled
          >
            {activeReceipt ? <ReceiptTicket receipt={activeReceipt} /> : null}
          </BottomSheetScrollView>
        </View>
      </AppBottomSheet> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { padding: 20, alignItems: "center", gap: 6 },
  name: { color: colors.surface, fontSize: 20, fontWeight: "800" },
  phone: { color: "rgba(255,255,255,0.72)", fontSize: 12 },
  stats: { flexDirection: "row", gap: 10, marginTop: 12 },
  stat: { color: colors.surface, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, overflow: "hidden", fontSize: 11, fontWeight: "700" },
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "900" },
  invoice: { gap: 12 },
  invoiceHead: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  title: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.borderLighter, paddingTop: 10 },
  balance: { color: colors.foreground, fontSize: 14, fontWeight: "900" },
  paymentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheet: { padding: 16, gap: 12 },
  receiptSheet: { flex: 1, paddingTop: 16, paddingHorizontal: 16, gap: 12 },
  sheetScroller: { flex: 1 },
  receiptHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  printButton: { minHeight: 44, paddingHorizontal: 14 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  totalCard: { alignItems: "center" },
  largeAmount: { color: colors.primary, fontSize: 28, fontWeight: "900", marginTop: 4 },
  amountInput: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground, fontSize: 20, fontWeight: "900" },
  methodRow: { flexDirection: "row", gap: 8 },
  methodChip: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", gap: 4 },
  methodChipActive: { borderColor: colors.primary, backgroundColor: colors.secondaryBg },
  methodText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  methodTextActive: { color: colors.primary }
});
