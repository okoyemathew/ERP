import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { Banknote, CreditCard, FileDown, FileText, Phone, Printer, RotateCcw, Send, Smartphone, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReceiptTicket } from "@/components/receipt";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from "@/components/common";
import { creditSalesService } from "@/services/credit-sales.service";
import { productsService } from "@/services/products.service";
import { printingService } from "@/services/printing.service";
import { useAuth } from "@/hooks/useAuth";
import { borderRadius, colors, shadows, spacing } from "@/theme";
import type { ReceiptDocument, SaleItem } from "@/types/domain.types";
import type { ApiCreditSale, CustomerCreditResponse } from "@/types/creditSale";
import type { PosPaymentMethod } from "@/types/sales";
import { toApiPaymentMethod } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

type CreditSaleProductItem = ApiCreditSale["sale"]["items"][number];

const paymentMethods: Array<{ label: string; value: Exclude<PosPaymentMethod, "credit">; icon: React.ReactNode }> = [
  { label: "Cash", value: "cash", icon: <Banknote size={15} color={colors.primary} /> },
  { label: "Card", value: "card", icon: <CreditCard size={15} color={colors.primary} /> },
  { label: "Bank", value: "bank", icon: <CreditCard size={15} color={colors.primary} /> },
  { label: "Mobile", value: "mobile", icon: <Smartphone size={15} color={colors.primary} /> }
];

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function clampPaid(total: number, paid: number) {
  return Math.min(Math.max(paid, 0), Math.max(total, 0));
}

function lineTotal(item: ApiCreditSale["sale"]["items"][number]) {
  return money(item.totalAmount) || item.quantity * money(item.unitPrice);
}

function initialPaid(creditSale: ApiCreditSale) {
  return (creditSale.sale.payments ?? [])
    .filter((payment) => payment.paymentMethod !== "CREDIT")
    .reduce((sum, payment) => sum + money(payment.amount), 0);
}

function creditPaymentsPaid(creditSale: ApiCreditSale) {
  return (creditSale.payments ?? []).reduce((sum, payment) => sum + money(payment.amount), 0);
}

function invoiceTotals(creditSale: ApiCreditSale) {
  const total = money(creditSale.sale.totalAmount) || creditSale.sale.items.reduce((sum, item) => sum + lineTotal(item), 0);
  const paid = clampPaid(total, initialPaid(creditSale) + creditPaymentsPaid(creditSale));
  const balance = Math.max(total - paid, 0);
  return { total, paid, balance };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function buildCreditInvoiceReceipt(creditSale: ApiCreditSale, customerName: string): ReceiptDocument {
  const totals = invoiceTotals(creditSale);
  const paymentLines = [
    ...(creditSale.sale.payments ?? [])
      .filter((payment) => payment.paymentMethod !== "CREDIT")
      .map((payment) => ({
        date: payment.paymentDate,
        amount: money(payment.amount),
        method: payment.paymentMethod,
        referenceNumber: payment.referenceNumber
      })),
    ...(creditSale.payments ?? []).map((payment) => ({
      date: payment.paymentDate,
      amount: money(payment.amount),
      method: payment.paymentMethod,
      referenceNumber: payment.referenceNumber
    }))
  ];
  const receiptItems: SaleItem[] = creditSale.sale.items.map((item) => ({
    productId: item.productId,
    name: item.productName || "Product",
    qty: item.quantity,
    price: money(item.unitPrice)
  }));

  return {
    id: creditSale.sale.saleNumber,
    kind: totals.balance > 0 ? "credit" : "sale",
    businessName: "EST JP MOTORS",
    title: "Credit Invoice",
    orderNumber: creditSale.sale.saleNumber,
    customerName,
    employeeName: creditSale.sale.salesperson.name || creditSale.sale.salesperson.username,
    items: receiptItems,
    subtotal: money(creditSale.sale.subtotal) || totals.total,
    tax: money(creditSale.sale.taxAmount),
    total: totals.total,
    paid: totals.paid,
    balance: totals.balance,
    method: totals.balance > 0 ? "credit" : "cash",
    createdAt: creditSale.sale.saleDate || creditSale.createdAt,
    printed: false,
    paymentLines
  };
}

export function CreditCustomerDetailsScreen({ route, navigation }: { route: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const customerId = route.params?.customerId as string;
  const user = useAuth((state) => state.user);
  const roleName = user?.roleName?.trim();
  const canUseFinancialCredit = Boolean(user?.permissions?.includes("credit-sales.manage") || roleName === "Owner" || roleName === "Admin" || (!roleName && user?.role === "owner"));
  const [response, setResponse] = useState<CustomerCreditResponse | null>(null);
  const [selectedCredit, setSelectedCredit] = useState<ApiCreditSale | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptDocument | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [returnItem, setReturnItem] = useState<CreditSaleProductItem | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnKeyboardOffset, setReturnKeyboardOffset] = useState(0);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Exclude<PosPaymentMethod, "credit">>("cash");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transactions = response?.data ?? [];
  const customerName = response?.customer.name ?? "Customer";
  const bottomPadding = spacing.bottomNavHeight + Math.max(insets.bottom, 24) + 48;
  const modalBottomPadding = Math.max(insets.bottom, 24) + 72;

  const calculatedSummary = useMemo(() => {
    const totalCreditSales = response?.summary.totalCreditSales ?? transactions.length;
    const fallbackTotalAmount = transactions.reduce((sum, creditSale) => sum + invoiceTotals(creditSale).total, 0);
    const fallbackTotalPaid = transactions.reduce((sum, creditSale) => sum + invoiceTotals(creditSale).paid, 0);
    const totalAmount = money(response?.summary.totalAmount) || fallbackTotalAmount;
    const totalPaid = clampPaid(totalAmount, money(response?.summary.totalPaid) || fallbackTotalPaid);
    const totalOutstanding = Math.max(totalAmount - totalPaid, 0);
    return { totalCreditSales, totalAmount, totalPaid, totalOutstanding };
  }, [response?.summary, transactions]);

  const loadCustomerCredit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loader = canUseFinancialCredit ? creditSalesService.customerCredit : creditSalesService.posCustomerCredit;
      const data = await loader(customerId, { limit: 200 });
      setResponse(data);
      setSelectedCredit((current) => data.data.find((item) => item.id === current?.id) ?? current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load customer credit history.");
    } finally {
      setLoading(false);
    }
  }, [canUseFinancialCredit, customerId]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomerCredit();
    }, [loadCustomerCredit])
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setReturnKeyboardOffset(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setReturnKeyboardOffset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const openTransaction = (creditSale: ApiCreditSale) => {
    console.log("CREDIT_CUSTOMER_TRANSACTION_PRESSED", creditSale.id, creditSale.sale.saleNumber);
    setSelectedCredit(creditSale);
    setDetailVisible(true);
  };

  const openPayment = (creditSale: ApiCreditSale) => {
    console.log("CREDIT_CUSTOMER_PAYMENT_PRESSED", creditSale.id, creditSale.sale.saleNumber);
    setSelectedCredit(creditSale);
    setAmount(String(invoiceTotals(creditSale).balance));
    setReference(`CR-${Date.now()}`);
    setDetailVisible(false);
    setPaymentVisible(true);
  };

  const openReturnForm = (item: CreditSaleProductItem) => {
    setReturnItem(item);
    setReturnQuantity(item.quantity > 0 ? "1" : "0");
    setReturnRemarks("");
  };

  const openReturnForCreditSale = async (creditSale: ApiCreditSale) => {
    console.log("CREDIT_CUSTOMER_RETURN_PRODUCT_PRESSED", creditSale.id, creditSale.sale.saleNumber);
    try {
      const returnableCreditSale = creditSale.sale.items.length > 0
        ? creditSale
        : await creditSalesService.detail(creditSale.id);

      setSelectedCredit(returnableCreditSale);

      if (returnableCreditSale.sale.items.length === 0) {
        Alert.alert("Return unavailable", "No products were found on this credit invoice.");
        return;
      }

      if (returnableCreditSale.sale.items.length === 1) {
        setDetailVisible(false);
        openReturnForm(returnableCreditSale.sale.items[0]);
        return;
      }

      setDetailVisible(true);
    } catch (error) {
      Alert.alert("Return unavailable", error instanceof Error ? error.message : "Unable to load invoice products.");
    }
  };

  const closeReturnForm = () => {
    if (returnSubmitting) return;
    setReturnItem(null);
    setReturnQuantity("1");
    setReturnRemarks("");
  };

  const openInvoice = async (creditSale: ApiCreditSale) => {
    console.log("CREDIT_CUSTOMER_PRINT_INVOICE_PRESSED", creditSale.id, creditSale.sale.saleNumber);
    try {
      const printableCreditSale = creditSale.sale.items.length > 0
        ? creditSale
        : await creditSalesService.detail(creditSale.id);
      setSelectedCredit((current) => current?.id === printableCreditSale.id ? printableCreditSale : current);
      setActiveReceipt(buildCreditInvoiceReceipt(printableCreditSale, customerName));
      setReceiptVisible(true);
    } catch (error) {
      Alert.alert("Invoice", error instanceof Error ? error.message : "Unable to load invoice products.");
    }
  };

  const submitReturnRequest = async () => {
    if (!selectedCredit || !returnItem || returnSubmitting) return;

    const quantity = Number.parseInt(returnQuantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      Alert.alert("Invalid quantity", "Enter a quantity of at least 1.");
      return;
    }

    if (quantity > returnItem.quantity) {
      Alert.alert("Invalid quantity", `This credit sale only has ${returnItem.quantity} unit(s) of ${returnItem.productName}.`);
      return;
    }

    setReturnSubmitting(true);
    try {
      await productsService.createReturnRequest({
        productId: returnItem.productId,
        saleItemId: returnItem.id,
        quantity,
        unitCost: money(returnItem.unitPrice),
        referenceNumber: selectedCredit.sale.saleNumber,
        remarks: returnRemarks.trim() || `Customer return from credit sale ${selectedCredit.sale.saleNumber}`
      });
      const productName = returnItem.productName;
      setReturnItem(null);
      setReturnQuantity("1");
      setReturnRemarks("");
      await loadCustomerCredit();
      Alert.alert("Return submitted", `${productName} is now waiting for owner approval.`);
    } catch (returnError) {
      const message = returnError instanceof Error ? returnError.message : "Unable to submit return request.";
      Alert.alert("Return failed", message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  const collectPayment = async () => {
    if (!selectedCredit) return;
    const value = Number(amount);
    const balance = invoiceTotals(selectedCredit).balance;

    if (!value || value <= 0) {
      Alert.alert("Check amount", "Payment amount must be greater than zero.");
      return;
    }
    if (value > balance) {
      Alert.alert("Check amount", "Payment cannot be greater than the remaining balance.");
      return;
    }

    setProcessing(true);
    try {
      const collectCreditPayment = canUseFinancialCredit ? creditSalesService.collectPayment : creditSalesService.collectPosPayment;
      const updated = await collectCreditPayment(selectedCredit.id, {
        amount: value,
        paymentMethod: toApiPaymentMethod(method),
        paymentDate: new Date().toISOString(),
        referenceNumber: reference.trim() || undefined
      });
      setSelectedCredit(updated);
      setPaymentVisible(false);
      await loadCustomerCredit();
    } catch (paymentError) {
      Alert.alert("Payment failed", paymentError instanceof Error ? paymentError.message : "Unable to record credit payment.");
    } finally {
      setProcessing(false);
    }
  };

  const printInvoice = async () => {
    if (!activeReceipt) return;
    await printingService.print(activeReceipt);
    setActiveReceipt(null);
    setReceiptVisible(false);
  };

  const saveInvoicePdf = async () => {
    if (!activeReceipt) return;
    try {
      await printingService.savePdf(activeReceipt);
    } catch (pdfError) {
      Alert.alert("PDF failed", pdfError instanceof Error ? pdfError.message : "Unable to save invoice PDF.");
    }
  };

  const shareInvoiceWhatsApp = async () => {
    if (!activeReceipt) return;
    try {
      await printingService.sharePdfToWhatsApp(activeReceipt);
    } catch (shareError) {
      Alert.alert("Share failed", shareError instanceof Error ? shareError.message : "Unable to share invoice PDF.");
    }
  };

  if (loading && !response) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Customer Credit" onBack={() => navigation.goBack()} />
        <LoadingState label="Loading customer credit history" />
      </View>
    );
  }

  if (error || !response) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Customer Credit" onBack={() => navigation.goBack()} />
        <ErrorState onRetry={() => void loadCustomerCredit()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Customer Credit" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator
        persistentScrollbar
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
      >
        <Card style={styles.customerCard}>
          <Text style={styles.customerName}>{response.customer.name}</Text>
          <View style={styles.contactRow}>
            <Phone size={14} color={colors.textMuted} />
            <Text style={styles.meta}>{response.customer.phone || "No phone number"}</Text>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Financial Summary</Text>
        <View style={styles.stats}>
          <Card style={styles.stat}><Text style={styles.statValue}>{calculatedSummary.totalCreditSales}</Text><Text style={styles.statLabel}>Credit Sales</Text></Card>
          <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(calculatedSummary.totalAmount)}</Text><Text style={styles.statLabel}>Total Amount</Text></Card>
        </View>
        <View style={styles.stats}>
          <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(calculatedSummary.totalPaid)}</Text><Text style={styles.statLabel}>Total Paid</Text></Card>
          <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(calculatedSummary.totalOutstanding)}</Text><Text style={styles.statLabel}>Balance</Text></Card>
        </View>

        <Text style={styles.sectionTitle}>Credit Transactions</Text>
        {transactions.length === 0 ? (
          <EmptyState icon={<FileText size={28} color={colors.textPlaceholder} />} title="No credit transactions found" />
        ) : transactions.map((creditSale) => {
          const totals = invoiceTotals(creditSale);
          return (
            <View
              key={creditSale.id}
              style={styles.transactionCard}
            >
              <Pressable
                onPress={() => openTransaction(creditSale)}
                style={({ pressed }) => [styles.detailTouchArea, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Open invoice ${creditSale.sale.saleNumber}`}
              >
                <View style={styles.invoiceHead}>
                  <View style={styles.body}>
                    <Text style={styles.title}>{creditSale.sale.saleNumber}</Text>
                    <Text style={styles.meta}>{formatDate(creditSale.sale.saleDate)} | {creditSale.sale.items.length} products | {creditSale.sale.salesperson.name || creditSale.sale.salesperson.username}</Text>
                  </View>
                  <Badge label={totals.balance <= 0 ? "PAID" : creditSale.status} variant={totals.balance <= 0 ? "success" : creditSale.status === "PARTIALLY_PAID" ? "warning" : "error"} />
                </View>
                <Text style={styles.itemsText}>{creditSale.sale.items.map((item) => item.productName).join(", ")}</Text>
                <View style={styles.balanceRow}><Text style={styles.meta}>Total</Text><Text style={styles.amount}>{formatCurrency(totals.total)}</Text></View>
                <View style={styles.balanceRow}><Text style={styles.meta}>Paid</Text><Text style={styles.amount}>{formatCurrency(totals.paid)}</Text></View>
                <View style={styles.balanceRow}><Text style={styles.meta}>Balance</Text><Text style={styles.amount}>{formatCurrency(totals.balance)}</Text></View>
              </Pressable>
              <View style={styles.actions}>
                <Button label="Print Invoice" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void openInvoice(creditSale)} />
                <Button label="Return Product" variant="ghost" icon={<RotateCcw size={16} color={colors.primary} />} onPress={() => void openReturnForCreditSale(creditSale)} />
                {totals.balance > 0 ? <Button label="Record Payment" variant="success" onPress={() => openPayment(creditSale)} /> : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={detailVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modal}>
          <Pressable style={styles.backdrop} onPress={() => setDetailVisible(false)} accessibilityRole="button" accessibilityLabel="Close transaction details" />
          <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 10) + 8, paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Invoice Details</Text>
              <Pressable onPress={() => setDetailVisible(false)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close transaction details">
                <X size={15} color={colors.textMuted} />
              </Pressable>
            </View>
            {selectedCredit ? (
              <ScrollView
                contentContainerStyle={[styles.sheetContent, { paddingBottom: modalBottomPadding }]}
                showsVerticalScrollIndicator
                persistentScrollbar
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
              >
                {(() => {
                  const totals = invoiceTotals(selectedCredit);
                  return (
                    <>
                      <Card style={styles.summaryCard}>
                        <Text style={styles.title}>{selectedCredit.sale.saleNumber}</Text>
                        <Text style={styles.meta}>{formatDate(selectedCredit.sale.saleDate)} | {selectedCredit.sale.salesperson.name || selectedCredit.sale.salesperson.username}</Text>
                        <View style={styles.balanceRow}><Text style={styles.meta}>Original Total</Text><Text style={styles.amount}>{formatCurrency(totals.total)}</Text></View>
                        <View style={styles.balanceRow}><Text style={styles.meta}>Total Paid</Text><Text style={styles.amount}>{formatCurrency(totals.paid)}</Text></View>
                        <View style={styles.balanceRow}><Text style={styles.meta}>Balance Due</Text><Text style={styles.amount}>{formatCurrency(totals.balance)}</Text></View>
                      </Card>

                      <Text style={styles.sectionTitle}>Products</Text>
                      {selectedCredit.sale.items.map((item) => (
                        <Card key={item.id} style={styles.lineRow}>
                          <View style={styles.body}>
                            <Text style={styles.title}>{item.productName}</Text>
                            <Text style={styles.meta}>{item.quantity} x {formatCurrency(money(item.unitPrice))}</Text>
                          </View>
                          <View style={styles.productReturnActions}>
                            <Text style={styles.amount}>{formatCurrency(lineTotal(item))}</Text>
                            <Pressable
                              onPress={() => openReturnForm(item)}
                              style={styles.iconButton}
                              accessibilityRole="button"
                              accessibilityLabel={`Return ${item.productName}`}
                            >
                              <RotateCcw size={14} color={colors.primary} />
                            </Pressable>
                          </View>
                        </Card>
                      ))}

                      <Text style={styles.sectionTitle}>Payments</Text>
                      {(selectedCredit.sale.payments ?? []).filter((payment) => payment.paymentMethod !== "CREDIT").length === 0 && selectedCredit.payments.length === 0 ? (
                        <Card><Text style={styles.meta}>No payments collected yet.</Text></Card>
                      ) : (
                        <>
                          {(selectedCredit.sale.payments ?? []).filter((payment) => payment.paymentMethod !== "CREDIT").map((payment) => (
                            <Card key={payment.id} style={styles.lineRow}>
                              <View style={styles.body}>
                                <Text style={styles.title}>{payment.paymentMethod}</Text>
                                <Text style={styles.meta}>{formatDate(payment.paymentDate)}</Text>
                                {payment.referenceNumber ? <Text style={styles.meta}>{payment.referenceNumber}</Text> : null}
                              </View>
                              <Text style={styles.amount}>{formatCurrency(money(payment.amount))}</Text>
                            </Card>
                          ))}
                          {selectedCredit.payments.map((payment) => (
                            <Card key={payment.id} style={styles.lineRow}>
                              <View style={styles.body}>
                                <Text style={styles.title}>{payment.paymentMethod}</Text>
                                <Text style={styles.meta}>{formatDate(payment.paymentDate)} | {payment.employee?.name ?? "Employee"}</Text>
                                {payment.referenceNumber ? <Text style={styles.meta}>{payment.referenceNumber}</Text> : null}
                              </View>
                              <Text style={styles.amount}>{formatCurrency(money(payment.amount))}</Text>
                            </Card>
                          ))}
                        </>
                      )}

                      <View style={styles.actions}>
                        <Button label="Print Invoice" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void openInvoice(selectedCredit)} />
                        {totals.balance > 0 ? <Button label="Record Payment" variant="success" onPress={() => openPayment(selectedCredit)} /> : null}
                      </View>
                    </>
                  );
                })()}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(returnItem)} transparent animationType="slide" statusBarTranslucent onRequestClose={closeReturnForm}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={closeReturnForm} accessibilityRole="button" accessibilityLabel="Close product return" />
          <View style={[
            styles.returnSheet,
            {
              paddingBottom: Math.max(insets.bottom, 24),
              marginBottom: Platform.OS === "android" ? returnKeyboardOffset : 0
            }
          ]}>
            <View style={styles.returnHeader}>
              <View style={styles.body}>
                <Text style={styles.sheetTitle}>Return Product</Text>
                <Text style={styles.meta}>{returnItem?.productName ?? ""}</Text>
                <Text style={styles.meta}>{selectedCredit ? `${selectedCredit.sale.saleNumber} | ${customerName}` : ""}</Text>
              </View>
              <Pressable onPress={closeReturnForm} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close product return">
                <X size={15} color={colors.textMuted} />
              </Pressable>
            </View>
            <TextInput
              value={returnQuantity}
              onChangeText={setReturnQuantity}
              keyboardType="number-pad"
              style={styles.amountInput}
              placeholder="Quantity"
              placeholderTextColor={colors.textPlaceholder}
              accessibilityLabel="Return quantity"
            />
            <TextInput
              value={returnRemarks}
              onChangeText={setReturnRemarks}
              style={[styles.amountInput, styles.remarksInput]}
              placeholder="Reason or condition"
              placeholderTextColor={colors.textPlaceholder}
              multiline
              accessibilityLabel="Return reason"
            />
            <Button label="Submit Return" loading={returnSubmitting} onPress={() => void submitReturnRequest()} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={paymentVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setPaymentVisible(false)}>
        <View style={styles.modal}>
          <Pressable style={styles.backdrop} onPress={() => setPaymentVisible(false)} accessibilityRole="button" accessibilityLabel="Close payment form" />
          <View style={[styles.paymentSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Record Payment</Text>
            {selectedCredit ? (
              <ScrollView
                contentContainerStyle={[styles.sheetContent, { paddingBottom: modalBottomPadding }]}
                showsVerticalScrollIndicator
                persistentScrollbar
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
              >
                <Card style={styles.summaryCard}>
                  <Text style={styles.meta}>{selectedCredit.sale.saleNumber}</Text>
                  <Text style={styles.largeAmount}>{formatCurrency(invoiceTotals(selectedCredit).balance)}</Text>
                  <Text style={styles.meta}>Remaining balance</Text>
                </Card>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amountInput} accessibilityLabel="Credit payment amount" />
                <TextInput value={reference} onChangeText={setReference} style={styles.amountInput} accessibilityLabel="Payment reference" />
                <View style={styles.methodGrid}>
                  {paymentMethods.map((item) => (
                    <Pressable
                      key={item.value}
                      onPress={() => {
                        console.log("CREDIT_CUSTOMER_PAYMENT_METHOD_PRESSED", item.value);
                        setMethod(item.value);
                      }}
                      style={[styles.methodChip, method === item.value && styles.methodChipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay by ${item.label}`}
                    >
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
                    console.log("CREDIT_CUSTOMER_CONFIRM_PAYMENT_PRESSED", selectedCredit.id);
                    void collectPayment();
                  }}
                />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={receiptVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setReceiptVisible(false)}>
        <View style={styles.modal}>
          <Pressable style={styles.backdrop} onPress={() => setReceiptVisible(false)} accessibilityRole="button" accessibilityLabel="Close invoice preview" />
          <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 10) + 8, paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Invoice Preview</Text>
              <View style={styles.receiptActions}>
                <Button label="PDF" variant="ghost" icon={<FileDown size={16} color={colors.primary} />} onPress={() => void saveInvoicePdf()} style={styles.printButton} />
                <Button label="WhatsApp" variant="ghost" icon={<Send size={16} color={colors.primary} />} onPress={() => void shareInvoiceWhatsApp()} style={styles.printButton} />
                <Button label="Print" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printInvoice()} style={styles.printButton} />
              </View>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingBottom: modalBottomPadding }}
              showsVerticalScrollIndicator
              persistentScrollbar
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
            >
              {activeReceipt ? <ReceiptTicket receipt={activeReceipt} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, gap: 12 },
  customerCard: { gap: 8 },
  customerName: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { color: colors.textSecondary, fontSize: 14, fontWeight: "900" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", padding: 10 },
  statValue: { color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: "center" },
  statLabel: { color: colors.textPlaceholder, fontSize: 10, textAlign: "center" },
  transactionCard: {
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.card,
    padding: spacing.cardPadding,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
    ...shadows.card
  },
  detailTouchArea: { gap: 10 },
  pressed: { opacity: 0.84 },
  invoiceHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  body: { flex: 1 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "900" },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  itemsText: { color: colors.textTertiary, fontSize: 12 },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.borderLighter, paddingTop: 8 },
  amount: { color: colors.foreground, fontSize: 13, fontWeight: "900" },
  actions: { gap: 8 },
  modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  sheet: { height: "94%", backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, gap: 12, elevation: 100, zIndex: 1 },
  paymentSheet: { height: "78%", backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 16, paddingHorizontal: 16, gap: 12, elevation: 100, zIndex: 1 },
  returnSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12, elevation: 100, zIndex: 1 },
  returnHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  handle: { alignSelf: "center", width: 34, height: 4, borderRadius: 999, backgroundColor: colors.borderLight },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  sheetContent: { gap: 12 },
  summaryCard: { gap: 10 },
  lineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  productReturnActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  receiptActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, flexShrink: 1 },
  printButton: { minHeight: 44, paddingHorizontal: 14 },
  largeAmount: { color: colors.primary, fontSize: 28, fontWeight: "900", marginTop: 4 },
  amountInput: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground, fontSize: 18, fontWeight: "900" },
  remarksInput: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: { minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface },
  methodChipActive: { backgroundColor: colors.secondaryBg, borderColor: colors.primary },
  methodText: { color: colors.textSecondary, fontSize: 12, fontWeight: "800" },
  methodTextActive: { color: colors.primary }
});
