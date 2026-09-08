import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { Banknote, CreditCard, FileDown, Pencil, Printer, RotateCcw, Send, Smartphone, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReceiptTicket } from "@/components/receipt";
import { AppBottomSheet, Avatar, Badge, Button, Card, ErrorState, LoadingState, ScreenHeader } from "@/components/common";
import { creditSalesService } from "@/services/credit-sales.service";
import { customersService } from "@/services/customers.service";
import { productsService } from "@/services/products.service";
import { printingService } from "@/services/printing.service";
import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/theme";
import type { ReceiptDocument, SaleItem } from "@/types/domain.types";
import type { CustomerCreditSale, CustomerPaymentMethod, CustomerPaymentHistoryItem, CustomerProfileResponse, CustomerSale } from "@/types/customer";
import { customerDisplayName } from "@/types/customer";
import type { ApiCreditSale } from "@/types/creditSale";
import { formatCurrency } from "@/utils/format";

type CustomerSaleItem = NonNullable<CustomerSale["items"]>[number];

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

function mapCreditSaleToCustomerCreditSale(creditSale: ApiCreditSale): CustomerCreditSale {
  return {
    id: creditSale.id,
    totalCredit: creditSale.totalCredit,
    amountPaid: creditSale.amountPaid,
    balance: creditSale.balance,
    status: creditSale.status,
    createdAt: creditSale.createdAt,
    sale: {
      id: creditSale.sale.id,
      saleNumber: creditSale.sale.saleNumber,
      saleDate: creditSale.sale.saleDate,
      totalAmount: creditSale.sale.totalAmount,
      amountPaid: creditSale.sale.amountPaid,
      balanceDue: creditSale.sale.balanceDue,
      paymentStatus: creditSale.sale.paymentStatus,
      items: creditSale.sale.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalAmount,
        product: {
          id: item.productId,
          name: item.productName,
          sku: item.sku
        }
      }))
    },
    payments: creditSale.payments?.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      paymentDate: payment.paymentDate,
      referenceNumber: payment.referenceNumber
    })) ?? []
  };
}

export function CustomerDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const customerId = route.params?.customerId as string;
  const user = useAuth((state) => state.user);
  const roleName = user?.roleName?.trim();
  const canUseFinancialCredit = Boolean(user?.permissions?.includes("credit-sales.manage") || roleName === "Owner" || roleName === "Admin" || (!roleName && user?.role === "owner"));
  const [profile, setProfile] = useState<CustomerProfileResponse | null>(null);
  const [purchases, setPurchases] = useState<CustomerSale[]>([]);
  const [payments, setPayments] = useState<CustomerPaymentHistoryItem[]>([]);
  const [credits, setCredits] = useState<CustomerCreditSale[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<CustomerCreditSale | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptDocument | null>(null);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [receiptSheetVisible, setReceiptSheetVisible] = useState(false);
  const [returnPickerVisible, setReturnPickerVisible] = useState(false);
  const [returnCredit, setReturnCredit] = useState<CustomerCreditSale | null>(null);
  const [returnItem, setReturnItem] = useState<CustomerSaleItem | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnKeyboardOffset, setReturnKeyboardOffset] = useState(0);
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
      const loadCreditHistory = async () => {
        const loader = canUseFinancialCredit ? creditSalesService.customerCredit : creditSalesService.posCustomerCredit;
        const response = await loader(customerId, { limit: 10 });
        return {
          data: response.data.map(mapCreditSaleToCustomerCreditSale),
          meta: response.meta
        };
      };
      const [profileResponse, purchaseResponse, paymentResponse, creditResponse] = await Promise.all([
        customersService.profile(customerId),
        customersService.purchaseHistory(customerId, { limit: 10 }),
        customersService.paymentHistory(customerId, { limit: 10 }),
        loadCreditHistory()
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
  }, [canUseFinancialCredit, customerId]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomer();
    }, [loadCustomer])
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

  const customer = profile?.customer;
  const summary = profile?.summary;
  const name = customer ? customerDisplayName(customer) : "";

  const openPayment = (credit: CustomerCreditSale) => {
    setSelectedCredit(credit);
    setAmount(String(money(credit.balance)));
    setPaymentSheetVisible(true);
  };

  const openReturnOptions = (credit: CustomerCreditSale) => {
    const items = credit.sale?.items ?? [];
    if (items.length === 0) {
      Alert.alert("Return unavailable", "No products were found on this credit invoice.");
      return;
    }

    setReturnCredit(credit);
    if (items.length === 1) {
      setReturnItem(items[0]);
      setReturnQuantity(Number(items[0].quantity) > 0 ? "1" : "0");
      setReturnRemarks("");
      return;
    }

    setReturnPickerVisible(true);
  };

  const openReturnForm = (credit: CustomerCreditSale, item: CustomerSaleItem) => {
    setReturnCredit(credit);
    setReturnItem(item);
    setReturnQuantity(Number(item.quantity) > 0 ? "1" : "0");
    setReturnRemarks("");
    setReturnPickerVisible(false);
  };

  const closeReturnForm = () => {
    if (returnSubmitting) return;
    setReturnCredit(null);
    setReturnItem(null);
    setReturnQuantity("1");
    setReturnRemarks("");
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

  const submitReturnRequest = async () => {
    if (!returnCredit || !returnItem || returnSubmitting) return;

    const quantity = Number.parseInt(returnQuantity, 10);
    const soldQuantity = Number(returnItem.quantity);
    const productId = returnItem.product?.id;
    const productName = returnItem.product?.name ?? "Product";
    const saleNumber = returnCredit.sale?.saleNumber ?? returnCredit.id.slice(0, 8).toUpperCase();

    if (!productId) {
      Alert.alert("Return unavailable", "This invoice product is missing its product reference.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      Alert.alert("Invalid quantity", "Enter a quantity of at least 1.");
      return;
    }

    if (quantity > soldQuantity) {
      Alert.alert("Invalid quantity", `This credit sale only has ${soldQuantity} unit(s) of ${productName}.`);
      return;
    }

    setReturnSubmitting(true);
    try {
      await productsService.createReturnRequest({
        productId,
        saleItemId: returnItem.id,
        quantity,
        unitCost: money(returnItem.unitPrice),
        referenceNumber: saleNumber,
        remarks: returnRemarks.trim() || `Customer return from credit sale ${saleNumber}`
      });
      setReturnCredit(null);
      setReturnItem(null);
      setReturnQuantity("1");
      setReturnRemarks("");
      await loadCustomer();
      Alert.alert("Return submitted", `${productName} is now waiting for owner approval.`);
    } catch (returnError) {
      const message = returnError instanceof Error ? returnError.message : "Unable to submit return request.";
      Alert.alert("Return failed", message);
    } finally {
      setReturnSubmitting(false);
    }
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
    setActiveReceipt(null);
    setReceiptSheetVisible(false);
  };

  const handleSaveInvoicePdf = async () => {
    if (!activeReceipt) return;
    try {
      await printingService.savePdf(activeReceipt);
    } catch (pdfError) {
      Alert.alert("PDF failed", pdfError instanceof Error ? pdfError.message : "Unable to save invoice PDF.");
    }
  };

  const handleShareInvoiceWhatsApp = async () => {
    if (!activeReceipt) return;
    try {
      await printingService.sharePdfToWhatsApp(activeReceipt);
    } catch (shareError) {
      Alert.alert("Share failed", shareError instanceof Error ? shareError.message : "Unable to share invoice PDF.");
    }
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
            {credit.sale?.items?.length ? (
              <Text style={styles.meta}>{credit.sale.items.map((item) => item.product?.name ?? "Product").join(", ")}</Text>
            ) : null}
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
            <Button
              label="Return Product"
              variant="ghost"
              icon={<RotateCcw size={16} color={colors.primary} />}
              onPress={() => {
                console.log("CUSTOMER_DETAIL_RETURN_PRODUCT_PRESSED", credit.id);
                openReturnOptions(credit);
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
            <View style={styles.receiptActions}>
              <Button label="PDF" variant="ghost" icon={<FileDown size={16} color={colors.primary} />} onPress={() => void handleSaveInvoicePdf()} style={styles.printButton} />
              <Button label="WhatsApp" variant="ghost" icon={<Send size={16} color={colors.primary} />} onPress={() => void handleShareInvoiceWhatsApp()} style={styles.printButton} />
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
      {returnPickerVisible ? <AppBottomSheet snapPoints={["50%"]} initialIndex={0} onClose={() => {
        setReturnPickerVisible(false);
        setReturnCredit(null);
      }}>
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
          showsVerticalScrollIndicator
          persistentScrollbar
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
        >
          <Text style={styles.sheetTitle}>Return Product</Text>
          {returnCredit?.sale?.items?.map((item) => (
            <Card key={item.id} style={styles.returnProductRow}>
              <View style={styles.returnProductBody}>
                <Text style={styles.title}>{item.product?.name ?? "Product"}</Text>
                <Text style={styles.meta}>{Number(item.quantity)} x {formatCurrency(money(item.unitPrice))}</Text>
              </View>
              <Pressable
                onPress={() => openReturnForm(returnCredit, item)}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={`Return ${item.product?.name ?? "product"}`}
              >
                <RotateCcw size={14} color={colors.primary} />
              </Pressable>
            </Card>
          ))}
        </BottomSheetScrollView>
      </AppBottomSheet> : null}
      <Modal visible={Boolean(returnItem)} transparent animationType="slide" statusBarTranslucent onRequestClose={closeReturnForm}>
        <KeyboardAvoidingView style={styles.returnModal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={closeReturnForm} accessibilityRole="button" accessibilityLabel="Close product return" />
          <View style={[
            styles.returnSheet,
            {
              paddingBottom: Math.max(insets.bottom, 24),
              marginBottom: Platform.OS === "android" ? returnKeyboardOffset : 0
            }
          ]}>
            <View style={styles.returnHeader}>
              <View style={styles.returnProductBody}>
                <Text style={styles.sheetTitle}>Return Product</Text>
                <Text style={styles.meta}>{returnItem?.product?.name ?? ""}</Text>
                <Text style={styles.meta}>{returnCredit?.sale?.saleNumber ?? ""}</Text>
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
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Return quantity"
            />
            <TextInput
              value={returnRemarks}
              onChangeText={setReturnRemarks}
              style={[styles.amountInput, styles.remarksInput]}
              placeholder="Reason or condition"
              placeholderTextColor={colors.textMuted}
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
  returnModal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  returnSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  returnHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  returnProductRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  returnProductBody: { flex: 1 },
  receiptHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  receiptActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, flexShrink: 1 },
  printButton: { minHeight: 44, paddingHorizontal: 14 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "900" },
  totalCard: { alignItems: "center" },
  largeAmount: { color: colors.primary, fontSize: 28, fontWeight: "900", marginTop: 4 },
  amountInput: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground, fontSize: 20, fontWeight: "900" },
  remarksInput: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  methodRow: { flexDirection: "row", gap: 8 },
  methodChip: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", gap: 4 },
  methodChipActive: { borderColor: colors.primary, backgroundColor: colors.secondaryBg },
  methodText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  methodTextActive: { color: colors.primary }
});
