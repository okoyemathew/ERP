import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Check, CreditCard, Edit3, HandCoins, Printer, Search, Trash2, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReceiptTicket } from "@/components/receipt";
import { AppBottomSheet, Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { creditSalesService } from "@/services/credit-sales.service";
import { printingService } from "@/services/printing.service";
import { useAuth } from "@/hooks/useAuth";
import { borderRadius, colors, shadows, spacing } from "@/theme";
import type { ReceiptDocument, SaleItem } from "@/types/domain.types";
import type { ApiCreditSale, CreditSaleActionRequest, CreditSaleEmployeeAction, CreditSaleListResponse } from "@/types/creditSale";
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

function activeActionRequest(creditSale: ApiCreditSale, action: CreditSaleEmployeeAction) {
  const now = Date.now();
  return creditSale.employeeActionRequests?.find((request) => {
    if (request.action !== action) return false;
    if (request.status !== "PENDING" && request.status !== "APPROVED") return false;
    return !request.expiresAt || new Date(request.expiresAt).getTime() > now;
  });
}

function pendingActionRequest(creditSale: ApiCreditSale) {
  const now = Date.now();
  return creditSale.employeeActionRequests?.find((request) => {
    if (request.status !== "PENDING") return false;
    return !request.expiresAt || new Date(request.expiresAt).getTime() > now;
  });
}

function actionText(action: CreditSaleEmployeeAction) {
  return action === "EDIT" ? "edit" : "delete";
}

export function CreditSalesScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuth((state) => state.user);
  const roleName = user?.roleName?.trim();
  const isBusinessOwner = Boolean(roleName === "Owner" || (!roleName && user?.role === "owner"));
  const canUseFinancialCredit = Boolean(user?.permissions?.includes("credit-sales.manage") || roleName === "Owner" || roleName === "Admin" || (!roleName && user?.role === "owner"));
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<CreditSaleListResponse | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<CreditSaleActionRequest[]>([]);
  const [selected, setSelected] = useState<ApiCreditSale | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ApiCreditSale | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptDocument | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [editing, setEditing] = useState<ApiCreditSale | null>(null);
  const [amount, setAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [method, setMethod] = useState<Exclude<PosPaymentMethod, "credit">>("cash");
  const [paymentDate, setPaymentDate] = useState(todayDate());
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [actionProcessing, setActionProcessing] = useState<string | null>(null);
  const [approvalProcessing, setApprovalProcessing] = useState<string | null>(null);
  const [editingProcessing, setEditingProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentRef = useRef<BottomSheet>(null);
  const editRef = useRef<BottomSheet>(null);

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

  const loadApprovalRequests = useCallback(async () => {
    if (!isBusinessOwner) {
      setApprovalRequests([]);
      return;
    }

    try {
      const data = await creditSalesService.actionRequests();
      setApprovalRequests(data.data);
    } catch {
      setApprovalRequests([]);
    }
  }, [isBusinessOwner]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCredits(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [loadCredits, query]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  useEffect(() => {
    void loadApprovalRequests();
  }, [loadApprovalRequests]);

  const rows = response?.data ?? [];
  const summary = response?.summary;

  const selectedPayments = useMemo(() => selected?.payments ?? [], [selected]);
  const bottomPadding = spacing.bottomNavHeight + Math.max(insets.bottom, 24) + 48;
  const sheetBottomPadding = Math.max(insets.bottom, 24) + 48;

  const refresh = () => {
    setRefreshing(true);
    void loadCredits(query, false);
  };

  const navigateStack = (route: string, params?: Record<string, string>) => {
    const routeNames = navigation.getState?.()?.routeNames as string[] | undefined;
    if (!routeNames || routeNames.includes(route)) {
      navigation.navigate(route, params);
      return;
    }

    const parent = navigation.getParent?.();
    if (parent) parent.navigate(route as never, params as never);
  };

  const openCustomerProfile = (customerId: string) => {
    setDetailVisible(false);
    navigateStack("CreditCustomerDetails", { customerId });
  };

  const openPayment = (creditSale: ApiCreditSale) => {
    setSelected(creditSale);
    setAmount(String(money(creditSale.balance)));
    setPaymentDate(todayDate());
    setReference(`CR-${Date.now()}`);
    setPaymentSheetVisible(true);
  };

  const buildCreditInvoiceReceipt = (creditSale: ApiCreditSale): ReceiptDocument => {
    const receiptItems: SaleItem[] = creditSale.sale.items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      qty: item.quantity,
      price: money(item.unitPrice)
    }));
    const invoiceTotal = money(creditSale.sale.totalAmount || creditSale.totalCredit);
    const amountPaid = money(creditSale.sale.amountPaid || creditSale.amountPaid);
    const remainingBalance = money(creditSale.sale.balanceDue || creditSale.balance);

    return {
      id: creditSale.sale.saleNumber,
      kind: remainingBalance > 0 ? "credit" : "sale",
      businessName: "EST JP MOTORS",
      title: "Credit Invoice",
      orderNumber: creditSale.sale.saleNumber,
      customerName: creditSale.customer.name,
      employeeName: creditSale.sale.salesperson.name || creditSale.sale.salesperson.username,
      items: receiptItems,
      subtotal: money(creditSale.sale.subtotal || invoiceTotal),
      tax: money(creditSale.sale.taxAmount),
      total: invoiceTotal,
      paid: amountPaid,
      balance: remainingBalance,
      method: remainingBalance > 0 ? "credit" : "cash",
      createdAt: creditSale.sale.saleDate || creditSale.createdAt,
      printed: false
    };
  };

  const openDetail = (creditSale: ApiCreditSale) => {
    setSelectedDetail(creditSale);
    setDetailVisible(true);
    void creditSalesService.detail(creditSale.id).then(setSelectedDetail).catch(() => undefined);
  };

  const openInvoicePreview = (creditSale: ApiCreditSale) => {
    setActiveReceipt(buildCreditInvoiceReceipt(creditSale));
    setReceiptVisible(true);
  };

  const requestApproval = (creditSale: ApiCreditSale, action: CreditSaleEmployeeAction) => {
    Alert.alert(
      `Request ${actionText(action)} approval?`,
      `The business owner must approve this before you can ${actionText(action)} ${creditSale.sale.saleNumber}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request",
          onPress: async () => {
            const key = `${creditSale.id}-${action}`;
            setActionProcessing(key);
            try {
              await creditSalesService.requestAction(creditSale.id, action);
              await loadCredits(query, false);
              Alert.alert("Request sent", "The business owner can now review your request.");
            } catch (approvalError) {
              Alert.alert("Request failed", approvalError instanceof Error ? approvalError.message : "Unable to request approval.");
            } finally {
              setActionProcessing(null);
            }
          }
        }
      ]
    );
  };

  const openEdit = (creditSale: ApiCreditSale) => {
    setEditing(creditSale);
    setEditDueDate(creditSale.dueDate ? creditSale.dueDate.slice(0, 10) : "");
    setEditRemarks(creditSale.sale.remarks ?? "");
    setEditSheetVisible(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const payload: { dueDate?: string; remarks?: string } = {};
    const currentDate = editing.dueDate ? editing.dueDate.slice(0, 10) : "";
    const nextDueDate = editDueDate.trim();
    const nextRemarks = editRemarks.trim();

    if (nextDueDate && nextDueDate !== currentDate) {
      payload.dueDate = new Date(nextDueDate).toISOString();
    }
    if (nextRemarks !== (editing.sale.remarks ?? "")) {
      payload.remarks = nextRemarks;
    }

    if (!payload.dueDate && payload.remarks === undefined) {
      Alert.alert("No changes", "Update the due date or remarks before saving.");
      return;
    }

    setEditingProcessing(true);
    try {
      await creditSalesService.employeeEdit(editing.id, payload);
      editRef.current?.close();
      await loadCredits(query, false);
      Alert.alert("Credit sale updated", "The approved edit was saved.");
    } catch (editError) {
      Alert.alert("Edit failed", editError instanceof Error ? editError.message : "Unable to edit credit sale.");
    } finally {
      setEditingProcessing(false);
    }
  };

  const removeCreditSale = (creditSale: ApiCreditSale) => {
    Alert.alert(
      "Delete credit sale?",
      `This will remove ${creditSale.sale.saleNumber} after owner approval and restore its stock/customer balance adjustments.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const key = `${creditSale.id}-DELETE`;
            setActionProcessing(key);
            try {
              await creditSalesService.employeeDelete(creditSale.id);
              await loadCredits(query, false);
              Alert.alert("Credit sale removed", "The approved credit sale was removed.");
            } catch (deleteError) {
              Alert.alert("Delete failed", deleteError instanceof Error ? deleteError.message : "Unable to remove credit sale.");
            } finally {
              setActionProcessing(null);
            }
          }
        }
      ]
    );
  };

  const decideApproval = async (request: CreditSaleActionRequest, approved: boolean) => {
    setApprovalProcessing(request.id);
    try {
      if (approved) {
        await creditSalesService.approveActionRequest(request.id);
      } else {
        await creditSalesService.rejectActionRequest(request.id);
      }
      await loadApprovalRequests();
      await loadCredits(query, false);
    } catch (decisionError) {
      Alert.alert("Approval failed", decisionError instanceof Error ? decisionError.message : "Unable to update approval request.");
    } finally {
      setApprovalProcessing(null);
    }
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

  const handlePrintInvoice = async () => {
    if (!activeReceipt) return;
    await printingService.print(activeReceipt);
    setActiveReceipt({ ...activeReceipt, printed: true });
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
            {isBusinessOwner && approvalRequests.length > 0 ? (
              <View style={styles.approvalQueue}>
                <Text style={styles.sectionTitle}>Employee Approval Requests</Text>
                {approvalRequests.map((request) => (
                  <Card key={request.id} style={styles.approvalCard}>
                    <View style={styles.body}>
                      <Text style={styles.title}>{request.saleNumber ?? "Credit sale"}</Text>
                      <Text style={styles.meta}>{request.requestedBy?.name ?? "Employee"} requested {actionText(request.action)} approval</Text>
                      {request.customer?.name ? <Text style={styles.meta}>{request.customer.name}</Text> : null}
                    </View>
                    <View style={styles.approvalActions}>
                      <Pressable
                        onPress={() => void decideApproval(request, true)}
                        disabled={approvalProcessing === request.id}
                        style={[styles.iconButton, styles.approveButton, approvalProcessing === request.id && styles.disabledAction]}
                        accessibilityRole="button"
                        accessibilityLabel={`Approve ${request.action.toLowerCase()} request`}
                      >
                        <Check size={15} color={colors.successDark} />
                      </Pressable>
                      <Pressable
                        onPress={() => void decideApproval(request, false)}
                        disabled={approvalProcessing === request.id}
                        style={[styles.iconButton, styles.rejectButton, approvalProcessing === request.id && styles.disabledAction]}
                        accessibilityRole="button"
                        accessibilityLabel={`Reject ${request.action.toLowerCase()} request`}
                      >
                        <X size={15} color={colors.error} />
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const pendingRequest = isBusinessOwner ? pendingActionRequest(item) : undefined;

          return (
            <View style={styles.rowCard}>
              <View style={styles.customerTouchArea}>
                <View style={styles.icon}><HandCoins size={17} color={colors.primary} /></View>
                <View style={styles.body}>
                  <Pressable
                    onPress={() => {
                      console.log("CREDIT_CUSTOMER_NAME_PRESSED", item.customer.id, item.customer.name);
                      openCustomerProfile(item.customer.id);
                    }}
                    hitSlop={8}
                    style={styles.customerNamePressable}
                    accessibilityRole="button"
                    accessibilityLabel={`Open customer credit history for ${item.customer.name}`}
                  >
                    <Text style={styles.customerLink}>{item.customer.name}</Text>
                  </Pressable>
                  <Text style={styles.meta}>{item.sale.saleNumber} | {item.sale.items.length} products | {item.sale.salesperson.name || item.sale.salesperson.username}</Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Pressable
                  onPress={() => {
                    console.log("CREDIT_SALE_DETAIL_PRESSED", item.id, item.sale.saleNumber);
                    openDetail(item);
                  }}
                  style={styles.balancePress}
                  accessibilityRole="button"
                  accessibilityLabel={`Open credit details for ${item.sale.saleNumber}`}
                >
                  <Text style={styles.amount}>{formatCurrency(money(item.balance))}</Text>
                  <Badge label={item.status} variant={item.status === "PAID" ? "success" : item.isOverdue ? "error" : "warning"} />
                </Pressable>
                {money(item.balance) > 0 ? (
                  <Pressable
                    onPress={() => {
                      console.log("CREDIT_PAYMENT_PRESSED", item.id, item.sale.saleNumber);
                      openPayment(item);
                    }}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Record payment for ${item.sale.saleNumber}`}
                  >
                    <CreditCard size={14} color={colors.primary} />
                  </Pressable>
                ) : null}
                {pendingRequest ? (
                  <View style={styles.employeeActions}>
                    <Pressable
                      onPress={() => {
                        console.log("CREDIT_APPROVE_REQUEST_PRESSED", pendingRequest.id, item.sale.saleNumber);
                        void decideApproval(pendingRequest, true);
                      }}
                      disabled={approvalProcessing === pendingRequest.id}
                      style={[styles.iconButton, styles.approveButton, approvalProcessing === pendingRequest.id && styles.disabledAction]}
                      accessibilityRole="button"
                      accessibilityLabel={`Approve ${pendingRequest.action.toLowerCase()} request for ${item.sale.saleNumber}`}
                    >
                      <Check size={15} color={colors.successDark} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        console.log("CREDIT_REJECT_REQUEST_PRESSED", pendingRequest.id, item.sale.saleNumber);
                        void decideApproval(pendingRequest, false);
                      }}
                      disabled={approvalProcessing === pendingRequest.id}
                      style={[styles.iconButton, styles.rejectButton, approvalProcessing === pendingRequest.id && styles.disabledAction]}
                      accessibilityRole="button"
                      accessibilityLabel={`Reject ${pendingRequest.action.toLowerCase()} request for ${item.sale.saleNumber}`}
                    >
                      <X size={15} color={colors.error} />
                    </Pressable>
                  </View>
                ) : !canUseFinancialCredit ? (
                  <View style={styles.employeeActions}>
                    {(["EDIT", "DELETE"] as CreditSaleEmployeeAction[]).map((action) => {
                      const request = activeActionRequest(item, action);
                      const processingKey = `${item.id}-${action}`;
                      const isApproved = request?.status === "APPROVED";
                      const isPending = request?.status === "PENDING";
                      const disabled = actionProcessing === processingKey || isPending;
                      return (
                        <Pressable
                          key={action}
                          onPress={() => {
                            console.log("CREDIT_EMPLOYEE_ACTION_PRESSED", item.id, action, item.sale.saleNumber);
                            if (isApproved && action === "EDIT") openEdit(item);
                            else if (isApproved && action === "DELETE") removeCreditSale(item);
                            else requestApproval(item, action);
                          }}
                          disabled={disabled}
                          style={[styles.iconButton, action === "DELETE" && styles.deleteButton, disabled && styles.disabledAction]}
                          accessibilityRole="button"
                          accessibilityLabel={`${isApproved ? actionText(action) : "Request " + actionText(action) + " approval"} for ${item.sale.saleNumber}`}
                        >
                          {action === "EDIT" ? <Edit3 size={14} color={colors.primary} /> : <Trash2 size={14} color={colors.error} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No credit sales found" />}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        persistentScrollbar
      />

      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.detailModal}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setDetailVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close credit details"
          />
          <View style={[styles.detailSheet, { paddingTop: Math.max(insets.top, 10) + 8, paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHandle} />
            <View style={styles.receiptHeader}>
              <Text style={styles.sheetTitle}>Credit Details</Text>
              <Pressable
                onPress={() => setDetailVisible(false)}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Close credit details"
              >
                <X size={15} color={colors.textMuted} />
              </Pressable>
            </View>
            {selectedDetail ? (
              <ScrollView
                style={styles.sheetScroller}
                contentContainerStyle={[styles.sheetScroll, { paddingBottom: sheetBottomPadding + 96 }]}
                showsVerticalScrollIndicator
                persistentScrollbar
                keyboardShouldPersistTaps="handled"
                overScrollMode="always"
              >
                <Card style={styles.detailSummary}>
                  <View style={styles.invoiceHead}>
                    <View style={styles.body}>
                      <Text style={styles.title}>{selectedDetail.customer.name}</Text>
                      <Text style={styles.meta}>{selectedDetail.sale.saleNumber}</Text>
                      <Text style={styles.meta}>{new Date(selectedDetail.sale.saleDate).toLocaleDateString()} | {selectedDetail.sale.salesperson.name || selectedDetail.sale.salesperson.username}</Text>
                    </View>
                    <Badge label={selectedDetail.status} variant={selectedDetail.status === "PAID" ? "success" : selectedDetail.isOverdue ? "error" : "warning"} />
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={styles.meta}>Invoice total</Text>
                    <Text style={styles.amount}>{formatCurrency(money(selectedDetail.sale.totalAmount || selectedDetail.totalCredit))}</Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={styles.meta}>Amount paid</Text>
                    <Text style={styles.amount}>{formatCurrency(money(selectedDetail.sale.amountPaid || selectedDetail.amountPaid))}</Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={styles.meta}>Remaining balance</Text>
                    <Text style={styles.amount}>{formatCurrency(money(selectedDetail.sale.balanceDue || selectedDetail.balance))}</Text>
                  </View>
                </Card>

                <Text style={styles.sectionTitle}>Products</Text>
                {selectedDetail.sale.items.length === 0 ? (
                  <Card><Text style={styles.meta}>No products found for this invoice.</Text></Card>
                ) : selectedDetail.sale.items.map((item) => (
                  <Card key={item.id} style={styles.paymentRow}>
                    <View style={styles.body}>
                      <Text style={styles.title}>{item.productName}</Text>
                      <Text style={styles.meta}>{item.quantity} x {formatCurrency(money(item.unitPrice))}</Text>
                    </View>
                    <Text style={styles.amount}>{formatCurrency(money(item.totalAmount))}</Text>
                  </Card>
                ))}

                <Text style={styles.sectionTitle}>Payment Transactions</Text>
                {selectedDetail.payments.length === 0 ? (
                  <Card><Text style={styles.meta}>No payments collected yet.</Text></Card>
                ) : selectedDetail.payments.map((payment) => (
                  <Card key={payment.id} style={styles.paymentRow}>
                    <View style={styles.body}>
                      <Text style={styles.title}>{payment.paymentMethod}</Text>
                      <Text style={styles.meta}>{new Date(payment.paymentDate).toLocaleDateString()} | {payment.employee?.name ?? "Employee"}</Text>
                      {payment.referenceNumber ? <Text style={styles.meta}>{payment.referenceNumber}</Text> : null}
                    </View>
                    <Text style={styles.amount}>{formatCurrency(money(payment.amount))}</Text>
                  </Card>
                ))}

                <View style={styles.detailActions}>
                  <Button label="Print Invoice" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => openInvoicePreview(selectedDetail)} />
                  {money(selectedDetail.balance) > 0 ? <Button label="Record Payment" variant="success" onPress={() => {
                    setDetailVisible(false);
                    openPayment(selectedDetail);
                  }} /> : null}
                  <Button label="Open Customer Credit History" variant="ghost" onPress={() => openCustomerProfile(selectedDetail.customer.id)} />
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {paymentSheetVisible ? <AppBottomSheet ref={paymentRef} snapPoints={["88%"]} initialIndex={0} onClose={() => {
        setPaymentSheetVisible(false);
        setSelected(null);
      }}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Credit Payment</Text>
          {selected ? (
            <>
              <BottomSheetScrollView
                style={styles.sheetScroller}
                contentContainerStyle={styles.sheetScroll}
                showsVerticalScrollIndicator
                persistentScrollbar
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
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
              </BottomSheetScrollView>
              <View style={[styles.sheetFooter, { paddingBottom: sheetBottomPadding }]}>
                <Button label="Record Payment" variant="success" loading={processing} onPress={() => void collectPayment()} />
              </View>
            </>
          ) : null}
        </View>
      </AppBottomSheet> : null}

      <Modal
        visible={receiptVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setReceiptVisible(false)}
      >
        <View style={styles.detailModal}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setReceiptVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close invoice preview"
          />
          <View style={[styles.detailSheet, { paddingTop: Math.max(insets.top, 10) + 8, paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHandle} />
            <View style={styles.receiptHeader}>
              <Text style={styles.sheetTitle}>Invoice Preview</Text>
              <Button label="Print" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void handlePrintInvoice()} style={styles.printButton} />
            </View>
            <ScrollView
              style={styles.sheetScroller}
              contentContainerStyle={{ paddingBottom: sheetBottomPadding + 96 }}
              showsVerticalScrollIndicator
              persistentScrollbar
              overScrollMode="always"
            >
              {activeReceipt ? <ReceiptTicket receipt={activeReceipt} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {editSheetVisible ? <AppBottomSheet ref={editRef} snapPoints={["55%"]} initialIndex={0} onClose={() => {
        setEditSheetVisible(false);
        setEditing(null);
      }}>
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheetFormContent, { paddingBottom: sheetBottomPadding }]}
          showsVerticalScrollIndicator
          persistentScrollbar
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <Text style={styles.sheetTitle}>Edit Credit Sale</Text>
          {editing ? (
            <>
              <Text style={styles.meta}>{editing.sale.saleNumber}</Text>
              <TextInput value={editDueDate} onChangeText={setEditDueDate} style={styles.amountInput} placeholder="Due date YYYY-MM-DD" accessibilityLabel="Credit sale due date" />
              <TextInput value={editRemarks} onChangeText={setEditRemarks} style={[styles.amountInput, styles.remarksInput]} placeholder="Remarks" multiline accessibilityLabel="Credit sale remarks" />
              <Button label="Save Approved Edit" loading={editingProcessing} onPress={() => void saveEdit()} />
            </>
          ) : null}
        </BottomSheetScrollView>
      </AppBottomSheet> : null}
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
  approvalQueue: { gap: 8 },
  approvalCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  approvalActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.card,
    padding: spacing.cardPadding,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
    ...shadows.card
  },
  customerTouchArea: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54, paddingVertical: 4 },
  balancePress: { alignItems: "flex-end", gap: 5, minHeight: 36, justifyContent: "center" },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  body: { flex: 1 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  customerNamePressable: { alignSelf: "flex-start" },
  customerLink: { color: colors.primary, fontSize: 13, fontWeight: "900", textDecorationLine: "underline" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  rowRight: { alignItems: "flex-end", gap: 5 },
  employeeActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  approveButton: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  rejectButton: { backgroundColor: colors.errorBg, borderColor: colors.errorBorder },
  deleteButton: { backgroundColor: colors.errorBg, borderColor: colors.errorBorder },
  disabledAction: { opacity: 0.55 },
  amount: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  detailModal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  detailSheet: {
    height: "94%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    gap: 12,
    elevation: 100,
    zIndex: 1
  },
  modalHandle: { alignSelf: "center", width: 34, height: 4, borderRadius: 999, backgroundColor: colors.borderLight },
  sheet: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  sheetScroller: { flex: 1 },
  sheetScroll: { gap: 12, paddingBottom: 16 },
  sheetFooter: { paddingTop: 2 },
  sheetFormContent: { padding: 16, gap: 12 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  detailSummary: { gap: 10 },
  invoiceHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.borderLighter, paddingTop: 10 },
  detailActions: { gap: 8 },
  receiptHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  printButton: { minHeight: 44, paddingHorizontal: 14 },
  totalCard: { alignItems: "center" },
  largeAmount: { color: colors.primary, fontSize: 28, fontWeight: "900", marginTop: 4 },
  amountInput: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground, fontSize: 16, fontWeight: "800" },
  remarksInput: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: { minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  methodTextActive: { color: colors.surface },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  paymentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }
});
