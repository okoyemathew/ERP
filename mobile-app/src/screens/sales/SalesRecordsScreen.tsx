import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Text } from "@/i18n";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Clock, CreditCard, FileDown, Printer, RotateCcw, Search, Send, ShoppingBag, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet, Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar, statusVariant } from "@/components/common";
import { offlineSyncService } from "@/services/offline-sync.service";
import { printingService } from "@/services/printing.service";
import { productsService } from "@/services/products.service";
import { salesService } from "@/services/sales.service";
import { colors, spacing } from "@/theme";
import type { ApiSale, CreatePaymentPayload, PosPaymentMethod } from "@/types/sales";
import { mapReceiptToDocument, toApiPaymentMethod } from "@/types/sales";
import { dashboardEvents } from "@/utils/dashboardEvents";
import { formatCurrency } from "@/utils/format";

const filters = ["All", "Today", "Completed", "Pending", "Refunded"] as const;
const paymentMethods: Array<{ label: string; value: PosPaymentMethod }> = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
  { label: "Mobile", value: "mobile" },
  { label: "Credit", value: "credit" }
];
type SaleFilter = (typeof filters)[number];
type SaleLineItem = ApiSale["items"][number];

function customerName(sale: ApiSale) {
  return sale.customer
    ? sale.customer.companyName ||
        [sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(" ")
    : "Walk-in Customer";
}

function paymentMethod(sale: ApiSale) {
  return sale.payments[0]?.paymentMethod ?? (Number(sale.balanceDue) > 0 ? "CREDIT" : "UNPAID");
}

function compactDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString();
}

function saleMatchesSearch(sale: ApiSale, search: string) {
  if (!search) return true;
  const normalized = search.toLowerCase();
  return [
    sale.saleNumber,
    customerName(sale),
    sale.user?.username,
    sale.user?.firstName,
    sale.user?.lastName,
    ...sale.items.map((item) => item.product.name)
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function todaySaleRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
}

export function SalesRecordsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SaleFilter>("All");
  const [sales, setSales] = useState<ApiSale[]>([]);
  const [selectedSale, setSelectedSale] = useState<ApiSale | null>(null);
  const [returnItem, setReturnItem] = useState<SaleLineItem | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnKeyboardOffset, setReturnKeyboardOffset] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<PosPaymentMethod>("cash");
  const [pendingPaidInput, setPendingPaidInput] = useState("");
  const [pendingReferenceInput, setPendingReferenceInput] = useState("");
  const [completingPending, setCompletingPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const loadSales = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(false);
    try {
      const params: Record<string, string | number> = { limit: 50 };
      const search = query.trim();
      if (search) params.search = search;
      if (filter === "Today") {
        Object.assign(params, todaySaleRange());
      }
      if (filter === "Refunded") {
        const [salesResponse, returnsResponse] = await Promise.all([
          salesService.list({ ...params, status: "REFUNDED" }),
          productsService.returnRequests({ status: "APPROVED", limit: 100 })
        ]);
        const salesById = new Map<string, ApiSale>();
        salesResponse.data.forEach((sale) => salesById.set(sale.id, sale));

        const saleIds = Array.from(new Set(
          returnsResponse.data
            .map((request) => request.saleId ?? request.sale?.id)
            .filter((saleId): saleId is string => Boolean(saleId))
        ));
        const missingSaleIds = saleIds.filter((saleId) => !salesById.has(saleId));
        const fetchedSales = await Promise.allSettled(missingSaleIds.map((saleId) => salesService.detail(saleId)));

        fetchedSales.forEach((result) => {
          if (result.status === "fulfilled") {
            salesById.set(result.value.id, result.value);
          }
        });

        const refundedSales = Array.from(salesById.values())
          .filter((sale) => saleMatchesSearch(sale, search))
          .sort((left, right) => new Date(right.saleDate).getTime() - new Date(left.saleDate).getTime())
          .slice(0, 50);
        setSales(refundedSales);
        return;
      }

      if (filter !== "All" && filter !== "Today") params.status = filter.toUpperCase();
      const response = await salesService.list(params);
      setSales(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSales(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [loadSales]);

  useFocusEffect(
    useCallback(() => {
      void loadSales(false);
    }, [loadSales])
  );

  useEffect(() => dashboardEvents.subscribe(() => {
    void loadSales(false);
  }), [loadSales]);

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

  const bottomPadding = spacing.bottomNavHeight + Math.max(insets.bottom, 24) + 48;

  const openSale = (sale: ApiSale) => {
    console.log("SALES_RECORD_CARD_PRESSED", sale.id, sale.saleNumber);
    setSelectedSale(sale);
    setPendingPaymentMethod("cash");
    setPendingPaidInput("");
    setPendingReferenceInput("");
  };

  const closeSale = () => {
    if (completingPending || returnSubmitting || printing) return;
    setSelectedSale(null);
    setPendingPaymentMethod("cash");
    setPendingPaidInput("");
    setPendingReferenceInput("");
  };

  const printSelectedReceipt = async () => {
    if (!selectedSale || selectedSale.status === "PENDING" || selectedSale.localSyncStatus) return;
    setPrinting(true);
    try {
      if (selectedSale.receipt?.id) {
        const response = await salesService.printReceipt(selectedSale.receipt.id);
        await printingService.printText(response.text);
      } else {
        const receipt = await salesService.receipt(selectedSale.id);
        await printingService.print(mapReceiptToDocument(receipt));
      }
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print receipt.";
      Alert.alert("Unable to print", message);
    } finally {
      setPrinting(false);
    }
  };

  const selectedReceiptDocument = async () => {
    if (!selectedSale || selectedSale.status === "PENDING" || selectedSale.localSyncStatus) return null;
    const receipt = await salesService.receipt(selectedSale.id);
    return mapReceiptToDocument(receipt);
  };

  const saveSelectedReceiptPdf = async () => {
    try {
      const receipt = await selectedReceiptDocument();
      if (!receipt) return;
      await printingService.savePdf(receipt);
    } catch (pdfError) {
      Alert.alert("PDF failed", pdfError instanceof Error ? pdfError.message : "Unable to save receipt PDF.");
    }
  };

  const shareSelectedReceiptWhatsApp = async () => {
    try {
      const receipt = await selectedReceiptDocument();
      if (!receipt) return;
      await printingService.sharePdfToWhatsApp(receipt);
    } catch (shareError) {
      Alert.alert("Share failed", shareError instanceof Error ? shareError.message : "Unable to share receipt PDF.");
    }
  };

  const openReturnForm = (item: SaleLineItem) => {
    if (selectedSale?.status === "PENDING" || selectedSale?.localSyncStatus) return;
    setReturnItem(item);
    setReturnQuantity(item.quantity > 0 ? "1" : "0");
    setReturnRemarks("");
  };

  const completePendingSale = async () => {
    if (!selectedSale || selectedSale.status !== "PENDING" || selectedSale.localSyncStatus || completingPending) return;

    const totalAmount = Number(selectedSale.totalAmount);
    const paidAmount = pendingPaidInput.trim() === "" ? totalAmount : Math.max(0, Number(pendingPaidInput || 0));
    if (Number.isNaN(paidAmount)) {
      Alert.alert("Payment amount", "Paid amount must be a valid number.");
      return;
    }
    if (pendingPaymentMethod !== "credit" && paidAmount <= 0) {
      Alert.alert("Payment amount", "Paid amount must be greater than zero.");
      return;
    }
    const creditBalance = pendingPaymentMethod === "credit" ? totalAmount : Math.max(0, totalAmount - paidAmount);
    if (creditBalance > 0 && !selectedSale.customerId) {
      Alert.alert("Credit customer", "This pending sale needs a customer before it can be completed on credit.");
      return;
    }

    const payments: CreatePaymentPayload[] = [];
    if (pendingPaymentMethod !== "credit") {
      payments.push({
        paymentMethod: toApiPaymentMethod(pendingPaymentMethod),
        amount: paidAmount,
        referenceNumber: pendingReferenceInput.trim() || undefined,
        allowChange: paidAmount > totalAmount
      });
    }
    if (creditBalance > 0) {
      payments.push({
        paymentMethod: toApiPaymentMethod("credit"),
        amount: Number(creditBalance.toFixed(2))
      });
    }

    setCompletingPending(true);
    try {
      if (!(await offlineSyncService.isOnline())) {
        Alert.alert("Pending sale", "Connect to the internet before completing a pending sale.");
        return;
      }

      const completedSale = await salesService.complete(selectedSale.id, payments);
      const receipt = await salesService.receipt(completedSale.id);
      dashboardEvents.notifySaleChanged();
      setSelectedSale(completedSale);
      setPendingPaidInput("");
      setPendingReferenceInput("");
      await loadSales(false);
      Alert.alert(
        pendingPaymentMethod === "credit" ? "Invoice ready" : "Sale completed",
        pendingPaymentMethod === "credit" ? "The pending sale was completed as credit. You can print the invoice now." : "The pending sale was completed. You can print the receipt now.",
        [
          { text: "Close", style: "cancel" },
          {
            text: pendingPaymentMethod === "credit" ? "Print Invoice" : "Print Receipt",
            onPress: () => {
              void printingService.print(mapReceiptToDocument(receipt));
            }
          }
        ]
      );
    } catch (completeError) {
      const message = completeError instanceof Error ? completeError.message : "Unable to complete pending sale.";
      Alert.alert("Pending sale failed", message);
    } finally {
      setCompletingPending(false);
    }
  };

  const closeReturnForm = () => {
    if (returnSubmitting) return;
    setReturnItem(null);
    setReturnQuantity("1");
    setReturnRemarks("");
  };

  const submitReturnRequest = async () => {
    if (!selectedSale || !returnItem || returnSubmitting) return;

    const quantity = Number.parseInt(returnQuantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      Alert.alert("Invalid quantity", "Enter a quantity of at least 1.");
      return;
    }

    if (quantity > returnItem.quantity) {
      Alert.alert("Invalid quantity", `This sale only has ${returnItem.quantity} unit(s) of ${returnItem.product.name}.`);
      return;
    }

    setReturnSubmitting(true);
    try {
      await productsService.createReturnRequest({
        productId: returnItem.productId,
        saleItemId: returnItem.id,
        quantity,
        unitCost: Number(returnItem.unitPrice),
        referenceNumber: selectedSale.saleNumber,
        remarks: returnRemarks.trim() || `Customer return from sale ${selectedSale.saleNumber}`
      });
      const productName = returnItem.product.name;
      setReturnItem(null);
      setReturnQuantity("1");
      setReturnRemarks("");
      Alert.alert("Return submitted", `${productName} is now waiting for owner approval.`);
    } catch (returnError) {
      const message = returnError instanceof Error ? returnError.message : "Unable to submit return request.";
      Alert.alert("Return failed", message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Sales Records" />
      <FlatList
        data={loading || error ? [] : sales}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void loadSales(false);
        }}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search sales" />
            <View style={styles.filters}>
              {filters.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => {
                    console.log("SALES_RECORD_FILTER_PRESSED", chip);
                    setFilter(chip);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter ${chip} sales`}
                >
                  <Text style={[styles.chip, filter === chip && styles.chipActive]}>{chip}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openSale(item)} accessibilityRole="button" accessibilityLabel={`Open ${item.saleNumber}`}>
            <Card style={styles.card}>
              <View style={styles.icon}><ShoppingBag size={16} color={colors.primary} /></View>
              <View style={styles.body}>
                <Text style={styles.title}>{customerName(item)}</Text>
                <Text style={styles.meta}>{item.saleNumber} | {item.items.length} items</Text>
                <View style={styles.row}>
                  <Clock size={12} color={colors.textPlaceholder} />
                  <Text style={styles.meta}>{compactDate(item.saleDate)}</Text>
                  <CreditCard size={12} color={colors.textPlaceholder} />
                  <Text style={styles.meta}>{paymentMethod(item)}</Text>
                </View>
              </View>
              <View style={styles.right}>
                <Text style={styles.amount}>{formatCurrency(Number(item.totalAmount))}</Text>
                <Badge label={item.status} variant={statusVariant(item.status)} />
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading sales" />
          ) : error ? (
            <ErrorState onRetry={() => void loadSales()} />
          ) : (
            <EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No sales found" />
          )
        }
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator
        persistentScrollbar
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      {selectedSale ? (
        <AppBottomSheet snapPoints={["86%"]} initialIndex={0} onClose={closeSale}>
          <BottomSheetScrollView
            contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
            showsVerticalScrollIndicator
            persistentScrollbar
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <View style={styles.body}>
                <Text style={styles.sheetTitle}>{selectedSale.saleNumber}</Text>
                <Text style={styles.meta}>{new Date(selectedSale.saleDate).toLocaleString()}</Text>
              </View>
              {selectedSale.status !== "PENDING" && !selectedSale.localSyncStatus ? (
                <View style={styles.receiptActions}>
                  <Button label="PDF" variant="ghost" icon={<FileDown size={16} color={colors.primary} />} onPress={() => void saveSelectedReceiptPdf()} style={styles.receiptButton} />
                  <Button label="WhatsApp" variant="ghost" icon={<Send size={16} color={colors.primary} />} onPress={() => void shareSelectedReceiptWhatsApp()} style={styles.receiptButton} />
                  <Button
                    label="Receipt"
                    variant="ghost"
                    loading={printing}
                    icon={<Printer size={16} color={colors.primary} />}
                    onPress={() => void printSelectedReceipt()}
                    style={styles.receiptButton}
                  />
                </View>
              ) : null}
            </View>
            <Card style={styles.detailCard}>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Customer</Text><Text style={styles.detailValue}>{customerName(selectedSale)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Payment</Text><Text style={styles.detailValue}>{paymentMethod(selectedSale)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Status</Text><Text style={styles.detailValue}>{selectedSale.status} / {selectedSale.paymentStatus}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Subtotal</Text><Text style={styles.detailValue}>{formatCurrency(Number(selectedSale.subtotal))}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Discount</Text><Text style={styles.detailValue}>{formatCurrency(Number(selectedSale.discountAmount))}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Tax</Text><Text style={styles.detailValue}>{formatCurrency(Number(selectedSale.taxAmount))}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Total</Text><Text style={styles.detailTotal}>{formatCurrency(Number(selectedSale.totalAmount))}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Paid</Text><Text style={styles.detailValue}>{formatCurrency(Number(selectedSale.amountPaid))}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Balance</Text><Text style={styles.detailValue}>{formatCurrency(Number(selectedSale.balanceDue))}</Text></View>
            </Card>
            {selectedSale.status === "PENDING" && !selectedSale.localSyncStatus ? (
              <Card style={styles.detailCard}>
                <Text style={styles.sectionTitle}>Complete pending sale</Text>
                <View style={styles.methodGrid}>
                  {paymentMethods.map((method) => (
                    <Pressable
                      key={method.value}
                      onPress={() => setPendingPaymentMethod(method.value)}
                      style={[styles.methodChip, pendingPaymentMethod === method.value && styles.methodChipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay by ${method.label}`}
                    >
                      <Text style={[styles.methodChipText, pendingPaymentMethod === method.value && styles.methodChipTextActive]}>{method.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={pendingPaidInput}
                  onChangeText={setPendingPaidInput}
                  keyboardType="decimal-pad"
                  placeholder={pendingPaymentMethod === "credit" ? formatCurrency(0) : formatCurrency(Number(selectedSale.totalAmount))}
                  placeholderTextColor={colors.textPlaceholder}
                  style={styles.input}
                  accessibilityLabel="Pending sale paid amount"
                  editable={pendingPaymentMethod !== "credit"}
                />
                {pendingPaymentMethod !== "credit" ? (
                  <TextInput
                    value={pendingReferenceInput}
                    onChangeText={setPendingReferenceInput}
                    placeholder="Payment reference"
                    placeholderTextColor={colors.textPlaceholder}
                    style={styles.input}
                    accessibilityLabel="Pending sale payment reference"
                  />
                ) : null}
                <Button
                  label={pendingPaymentMethod === "credit" ? "Complete Credit Sale" : "Complete Payment"}
                  loading={completingPending}
                  onPress={() => void completePendingSale()}
                />
              </Card>
            ) : null}
            <Card style={styles.detailCard}>
              <Text style={styles.sectionTitle}>Products</Text>
              {selectedSale.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.body}>
                    <Text style={styles.itemTitle}>{item.product.name}</Text>
                    <Text style={styles.meta}>Qty {item.quantity} x {formatCurrency(Number(item.unitPrice))}</Text>
                  </View>
                  <View style={styles.itemActions}>
                    <Text style={styles.amount}>{formatCurrency(Number(item.totalAmount))}</Text>
                    {selectedSale.status !== "PENDING" && !selectedSale.localSyncStatus ? (
                      <Pressable
                        onPress={() => openReturnForm(item)}
                        disabled={item.quantity <= 0}
                        style={[styles.returnButton, item.quantity <= 0 && styles.disabledAction]}
                        accessibilityRole="button"
                        accessibilityLabel={`Return ${item.product.name}`}
                      >
                        <RotateCcw size={14} color={colors.primary} />
                        <Text style={styles.returnText}>Return</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
            <Card style={styles.detailCard}>
              <Text style={styles.sectionTitle}>Payments</Text>
              {selectedSale.payments.length ? selectedSale.payments.map((payment) => (
                <View key={payment.id} style={styles.itemRow}>
                  <View style={styles.body}>
                    <Text style={styles.itemTitle}>{payment.paymentMethod}</Text>
                    <Text style={styles.meta}>{compactDate(payment.paymentDate)}</Text>
                  </View>
                  <Text style={styles.amount}>{formatCurrency(Number(payment.amount))}</Text>
                </View>
              )) : <Text style={styles.meta}>No payments recorded</Text>}
            </Card>
          </BottomSheetScrollView>
        </AppBottomSheet>
      ) : null}
      <Modal
        visible={Boolean(returnItem)}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeReturnForm}
      >
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
                <Text style={styles.returnTitle}>Return Product</Text>
                <Text style={styles.meta}>{returnItem?.product.name ?? ""}</Text>
                <Text style={styles.meta}>{selectedSale ? `${selectedSale.saleNumber} | ${customerName(selectedSale)}` : ""}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeReturnForm} accessibilityRole="button" accessibilityLabel="Close product return">
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>
            <TextInput
              value={returnQuantity}
              onChangeText={setReturnQuantity}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="Quantity"
              placeholderTextColor={colors.textPlaceholder}
              accessibilityLabel="Return quantity"
            />
            <TextInput
              value={returnRemarks}
              onChangeText={setReturnRemarks}
              style={[styles.input, styles.remarksInput]}
              placeholder="Reason or condition"
              placeholderTextColor={colors.textPlaceholder}
              multiline
              accessibilityLabel="Return reason"
            />
            <Button label="Submit Return" loading={returnSubmitting} onPress={() => void submitReturnRequest()} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 10 },
  headerContent: { gap: 12, marginBottom: 2 },
  filters: { flexDirection: "row", gap: 8 },
  chip: { color: colors.primary, backgroundColor: colors.secondaryBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontSize: 11, fontWeight: "700" },
  chipActive: { color: colors.surface, backgroundColor: colors.primary },
  card: { flexDirection: "row", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, textTransform: "capitalize" },
  row: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 6 },
  amount: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  sheetContent: { padding: spacing.screenHorizontal, gap: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sheetTitle: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  receiptActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, flexShrink: 1 },
  receiptButton: { minHeight: 38, paddingHorizontal: 10 },
  detailCard: { gap: 10 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { color: colors.textPlaceholder, fontSize: 12 },
  detailValue: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  detailTotal: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  sectionTitle: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: { minHeight: 40, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodChipText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  methodChipTextActive: { color: colors.surface },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" },
  itemTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  itemActions: { alignItems: "flex-end", gap: 8 },
  returnButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, paddingHorizontal: 10, backgroundColor: colors.secondaryBg },
  returnText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  disabledAction: { opacity: 0.5 },
  modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  returnSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  returnHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  returnTitle: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  closeButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.inputBg },
  remarksInput: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" }
});
