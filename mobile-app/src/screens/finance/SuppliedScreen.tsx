import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Archive, FileDown, Printer, RotateCcw, Send, Truck, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet, Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { SimpleRow } from "@/screens/shared/ScreenKit";
import { StockReportExportControl, type StockReportLine } from "@/components/common/StockReportExportControl";
import { employeesService } from "@/services/employees.service";
import { goodsDisbursementService } from "@/services/goods-disbursement.service";
import { productsService } from "@/services/products.service";
import { printingService } from "@/services/printing.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiGoodsDisbursement } from "@/types/goodsDisbursement";
import type { ProductAddedBy, StockInHistoryRecord } from "@/types/product";
import { buildDisbursementInvoiceText, itemUnitPrice } from "@/utils/disbursementInvoice";
import { formatCurrency } from "@/utils/format";

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

type EmployeeSuppliedProduct = {
  productId: string;
  productName: string;
  sku?: string | null;
  barcode?: string | null;
  quantityInHand: number;
  suppliedQuantity: number;
  unitValue: string | number;
  sellingPrice?: string | number;
  lastActivityAt: string;
};
type SuppliedListItem = ApiGoodsDisbursement | StockInHistoryRecord;

function userName(user?: ProductAddedBy | null) {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

export function SuppliedScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const business = useAuthStore((state) => state.business);
  const branch = useAuthStore((state) => state.branch);
  const normalizedRoleName = user?.roleName?.trim().toLowerCase();
  const isBusinessOwner = normalizedRoleName ? normalizedRoleName === "owner" : user?.role === "owner" && !user?.employeeId;
  const isEmployeeView = !isBusinessOwner;
  const [query, setQuery] = useState("");
  const [stockHistory, setStockHistory] = useState<StockInHistoryRecord[]>([]);
  const [employeeProducts, setEmployeeProducts] = useState<EmployeeSuppliedProduct[]>([]);
  const [allEmployeeProducts, setAllEmployeeProducts] = useState<EmployeeSuppliedProduct[]>([]);
  const [employeeStockSummary, setEmployeeStockSummary] = useState<{ totalSuppliedQuantity: number; stockValue: number } | null>(null);
  const [employeeDisbursements, setEmployeeDisbursements] = useState<ApiGoodsDisbursement[]>([]);
  const [disbursementHasMore, setDisbursementHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [disbursementTotal, setDisbursementTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnProduct, setReturnProduct] = useState<EmployeeSuppliedProduct | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnKeyboardOffset, setReturnKeyboardOffset] = useState(0);
  const [selectedDisbursement, setSelectedDisbursement] = useState<ApiGoodsDisbursement | null>(null);
  const requestIdRef = useRef(0);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const queryRef = useRef(query);
  const queryDebounceReadyRef = useRef(false);

  useEffect(() => { queryRef.current = query; }, [query]);

  const loadSupplied = useCallback(async (search = "", showSpinner = true) => {
    const requestId = ++requestIdRef.current;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      if (isEmployeeView) {
        const [stockResponse, firstPage] = await Promise.all([
          employeesService.myProductStock({ page: 1, limit: 100, search: search.trim() || undefined }),
          goodsDisbursementService.mine({ search: search.trim() || undefined, page: 1, limit: 30 })
        ]);
        if (requestId !== requestIdRef.current) return;
        const stock = Array.isArray(stockResponse) ? stockResponse : stockResponse.data;
        const products = stock.map((product) => ({
          productId: product.productId,
          productName: product.productName,
          sku: product.sku,
          barcode: product.barcode,
          quantityInHand: product.quantityInHand,
          suppliedQuantity: product.suppliedQuantity,
          unitValue: product.unitValue,
          sellingPrice: product.sellingPrice ?? product.baseSellingPrice,
          lastActivityAt: product.lastActivityAt,
        })) ?? [];
        setAllEmployeeProducts(products);
        setEmployeeStockSummary(Array.isArray(stockResponse) ? null : {
          totalSuppliedQuantity: stockResponse.summary.totalSuppliedQuantity,
          stockValue: stockResponse.summary.stockValue,
        });
        const normalizedSearch = search.trim().toLowerCase();
        setEmployeeProducts(
          normalizedSearch
            ? products.filter((product) =>
                [product.productName, product.sku, product.barcode]
                  .filter(Boolean)
                  .some((value) => String(value).toLowerCase().includes(normalizedSearch))
              )
            : products
        );
        setEmployeeDisbursements(firstPage.data);
        setDisbursementTotal(firstPage.meta.total);
        pageRef.current = 1;
        setDisbursementHasMore(firstPage.meta.page < firstPage.meta.totalPages);
        return;
      }

      const response = await productsService.stockInHistory({ search: search.trim() || undefined, limit: 50 });
      if (requestId !== requestIdRef.current) return;
      setStockHistory(response.data);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load supplied products.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isEmployeeView]);

  useEffect(() => {
    if (!queryDebounceReadyRef.current) {
      queryDebounceReadyRef.current = true;
      return undefined;
    }
    const timer = setTimeout(() => {
      void loadSupplied(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, loadSupplied]);

  useFocusEffect(
    useCallback(() => {
      void loadSupplied(queryRef.current);
    }, [loadSupplied])
  );

  const loadMoreDisbursements = useCallback(async () => {
    if (!isEmployeeView || !disbursementHasMore || loadingMoreRef.current) return;
    const requestId = requestIdRef.current;
    const page = pageRef.current + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const response = await goodsDisbursementService.mine({ search: queryRef.current.trim() || undefined, page, limit: 30 });
      if (requestId !== requestIdRef.current) return;
      setEmployeeDisbursements((current) => {
        const ids = new Set(current.map((row) => row.id));
        return [...current, ...response.data.filter((row) => !ids.has(row.id))];
      });
      pageRef.current = page;
      setDisbursementHasMore(response.meta.page < response.meta.totalPages);
    } catch {
      // Keep loaded disbursements available if another page cannot be fetched.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [disbursementHasMore, isEmployeeView]);

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

  const totalAdded = useMemo(() => stockHistory.reduce((sum, item) => sum + item.quantity, 0), [stockHistory]);
  const totalAddedValue = useMemo(() => stockHistory.reduce((sum, item) => sum + money(item.unitCost) * item.quantity, 0), [stockHistory]);
  const totalSupplied = employeeStockSummary?.totalSuppliedQuantity ?? employeeProducts.reduce((sum, product) => sum + product.suppliedQuantity, 0);
  const totalStockValue = employeeStockSummary?.stockValue ?? employeeProducts.reduce((sum, product) => sum + money(product.unitValue) * product.quantityInHand, 0);
  const dataIsEmpty = isEmployeeView ? employeeDisbursements.length === 0 : stockHistory.length === 0;
  const headerTitle = "Supplied Products";

  const loadStockForReport = async (): Promise<StockReportLine[]> => {
    if (isEmployeeView) {
      const stockResponse = await employeesService.myProductStock();
      const allStock = Array.isArray(stockResponse) ? stockResponse : stockResponse.data;
      return allStock.map((product) => ({
        name: product.productName,
        sku: product.sku ?? product.barcode,
        quantity: product.quantityInHand,
        buyingPrice: money(product.unitValue),
        sellingPrice: money(product.sellingPrice),
      }));
    }

    const search = query.trim() || undefined;
    const firstPage = await productsService.list({ page: 1, limit: 100, search, sortBy: "createdAt", sortOrder: "desc" });
    const allProducts = [...firstPage.data];
    for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
      const response = await productsService.list({ page, limit: 100, search, sortBy: "createdAt", sortOrder: "desc" });
      allProducts.push(...response.data);
    }
    return allProducts.map((product) => ({
      name: product.name,
      sku: product.sku,
      quantity: product.inventory?.quantityAvailable ?? 0,
      buyingPrice: money(product.purchasePrice),
      sellingPrice: money(product.sellingPrice),
    }));
  };

  const refresh = () => {
    setRefreshing(true);
    void loadSupplied(query, false);
  };
  const bottomPadding = spacing.bottomNavHeight + Math.max(insets.bottom, 24) + 48;

  const openReturnSheet = (product: EmployeeSuppliedProduct) => {
    setReturnProduct(product);
    setReturnQuantity(product.quantityInHand > 0 ? "1" : "0");
    setReturnRemarks("");
  };

  const closeReturnSheet = () => {
    if (returnSubmitting) return;
    setReturnProduct(null);
    setReturnQuantity("1");
    setReturnRemarks("");
  };

  const submitReturnRequest = async () => {
    if (!returnProduct || returnSubmitting) return;

    const quantity = Number.parseInt(returnQuantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      Alert.alert("Invalid quantity", "Enter a quantity of at least 1.");
      return;
    }

    if (quantity > returnProduct.quantityInHand) {
      Alert.alert("Invalid quantity", `You only have ${returnProduct.quantityInHand} unit(s) in hand.`);
      return;
    }

    setReturnSubmitting(true);
    try {
      await productsService.createReturnRequest({
        productId: returnProduct.productId,
        quantity,
        remarks: returnRemarks.trim() || undefined
      });
      const returnedName = returnProduct.productName;
      setReturnProduct(null);
      setReturnQuantity("1");
      setReturnRemarks("");
      await loadSupplied(query, false);
      Alert.alert("Return submitted", `${returnedName} is now waiting for owner approval.`);
    } catch (returnError) {
      const message = returnError instanceof Error ? returnError.message : "Unable to submit return request.";
      Alert.alert("Return failed", message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  const closeSupplyInvoice = () => setSelectedDisbursement(null);

  const printSupplyInvoice = async () => {
    if (!selectedDisbursement) return;
    const title = `Disbursement ${selectedDisbursement.disbursementNumber}`;
    try {
      await printingService.printText(buildDisbursementInvoiceText(selectedDisbursement, {}, business?.name), title);
    } catch (printError) {
      Alert.alert("Print failed", printError instanceof Error ? printError.message : "Unable to print disbursement invoice.");
    }
  };

  const saveSupplyInvoicePdf = async () => {
    if (!selectedDisbursement) return;
    const title = `Disbursement ${selectedDisbursement.disbursementNumber}`;
    try {
      await printingService.saveTextPdf(buildDisbursementInvoiceText(selectedDisbursement, {}, business?.name), title);
    } catch (pdfError) {
      Alert.alert("PDF failed", pdfError instanceof Error ? pdfError.message : "Unable to save disbursement invoice PDF.");
    }
  };

  const shareSupplyInvoiceWhatsApp = async () => {
    if (!selectedDisbursement) return;
    const title = `Disbursement ${selectedDisbursement.disbursementNumber}`;
    try {
      await printingService.shareTextPdfToWhatsApp(buildDisbursementInvoiceText(selectedDisbursement, {}, business?.name), title);
    } catch (shareError) {
      Alert.alert("Share failed", shareError instanceof Error ? shareError.message : "Unable to share disbursement invoice.");
    }
  };

  if (loading && dataIsEmpty) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={headerTitle} />
        <LoadingState label="Loading supplied products" />
      </View>
    );
  }

  if (error && dataIsEmpty) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={headerTitle} />
        <ErrorState onRetry={() => void loadSupplied()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={headerTitle}
        right={(
          <StockReportExportControl
            title={isEmployeeView ? "Employee Stock Report" : "Warehouse Inventory Report"}
            businessName={business?.name ?? "Business"}
            branchName={branch?.name}
            subjectLabel="Employee"
            subjectName={isEmployeeView ? [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username : undefined}
            loadItems={loadStockForReport}
            accessibilityLabel={isEmployeeView ? "Download my supplied stock report" : "Download warehouse inventory report"}
          />
        )}
      />
      <FlatList<SuppliedListItem>
        data={isEmployeeView ? employeeDisbursements : stockHistory}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        onEndReached={loadMoreDisbursements}
        onEndReachedThreshold={0.45}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search supplied products" />
            <View style={styles.stats}>
              <Card style={styles.stat}><Text style={styles.statValue}>{isEmployeeView ? disbursementTotal : stockHistory.length}</Text><Text style={styles.statLabel}>{isEmployeeView ? "Transactions" : "Total"}</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{isEmployeeView ? totalSupplied : totalAdded}</Text><Text style={styles.statLabel}>{isEmployeeView ? "Supplied" : "Units Added"}</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(isEmployeeView ? totalStockValue : totalAddedValue)}</Text><Text style={styles.statLabel}>{isEmployeeView ? "Stock value" : "Added value"}</Text></Card>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          "disbursementNumber" in item ? (
            <SimpleRow
              title={item.disbursementNumber}
              subtitle={`${item.destination ?? "No destination"} | ${new Date(item.disbursementDate).toLocaleDateString()}`}
              amount={`${item.items.reduce((sum, row) => sum + row.quantity, 0)} items`}
              icon={<Archive size={17} color={colors.primary} />}
              onPress={() => setSelectedDisbursement(item)}
            />
          ) : (
            <Card style={styles.row}>
              <View style={styles.icon}><Truck size={18} color={colors.primary} /></View>
              <View style={styles.body}>
                <Text style={styles.title}>{item.product.name}</Text>
                <Text style={styles.meta}>+{item.quantity} units | Purchase Price: {formatCurrency(money(item.unitCost))}</Text>
                <Text style={styles.meta}>Added by: {userName(item.addedBy)}</Text>
                <Text style={styles.meta}>{new Date(item.transactionDate).toLocaleString()}</Text>
              </View>
              <Badge label={`${item.quantityBefore} → ${item.quantityAfter}`} variant="success" />
            </Card>
          )
        )}
        ListEmptyComponent={<EmptyState icon={<Truck size={28} color={colors.textPlaceholder} />} title="No supplied products yet" />}
        ListFooterComponent={loadingMore ? <Text style={styles.meta}>Loading more...</Text> : null}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator
        persistentScrollbar
      />
      <Modal
        visible={Boolean(returnProduct)}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeReturnSheet}
      >
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.backdrop} onPress={closeReturnSheet} accessibilityRole="button" accessibilityLabel="Close return request" />
          <View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 24),
                marginBottom: Platform.OS === "android" ? returnKeyboardOffset : 0
              }
            ]}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetTitle}>Return Product</Text>
                <Text style={styles.meta}>{returnProduct?.productName ?? ""}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeReturnSheet} accessibilityRole="button" accessibilityLabel="Close return request">
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
              placeholder="Remarks"
              placeholderTextColor={colors.textPlaceholder}
              multiline
              accessibilityLabel="Return remarks"
            />
            <Button label="Submit Return" loading={returnSubmitting} onPress={() => void submitReturnRequest()} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {selectedDisbursement ? (
        <AppBottomSheet snapPoints={["84%"]} initialIndex={0} onClose={closeSupplyInvoice} useDirectContent>
          <BottomSheetScrollView
            style={styles.invoiceSheet}
            contentContainerStyle={[styles.invoiceSheetContent, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
            showsVerticalScrollIndicator
            persistentScrollbar
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <Text style={styles.invoiceTitle}>Disbursement Details</Text>
            {selectedDisbursement.items.map((item) => {
              const unitPrice = itemUnitPrice(item);
              const employeeProduct = allEmployeeProducts.find((product) => product.productId === item.productId);
              return (
                <Card key={item.id} style={styles.invoiceItemCard}>
                  <View style={styles.invoiceItemHead}>
                    <View style={styles.icon}><Archive size={16} color={colors.primary} /></View>
                    <View style={styles.body}>
                      <Text style={styles.title}>{item.product?.name ?? "Product"}</Text>
                      <Text style={styles.meta}>{item.product?.sku ?? item.product?.barcode ?? item.productId.slice(0, 8)}</Text>
                      <Text style={styles.meta}>Qty {item.quantity} x {formatCurrency(unitPrice)} = {formatCurrency(item.quantity * unitPrice)}</Text>
                    </View>
                    {isEmployeeView && employeeProduct ? (
                      <Pressable
                        onPress={() => openReturnSheet(employeeProduct)}
                        disabled={employeeProduct.quantityInHand <= 0}
                        style={[styles.returnButton, employeeProduct.quantityInHand <= 0 && styles.disabledAction]}
                        accessibilityRole="button"
                        accessibilityLabel={`Return ${employeeProduct.productName}`}
                      >
                        <RotateCcw size={16} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              );
            })}
            <View style={styles.invoiceActions}>
              <Button label="Print Invoice" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printSupplyInvoice()} style={styles.invoiceButton} />
              <Button label="PDF" variant="ghost" icon={<FileDown size={16} color={colors.primary} />} onPress={() => void saveSupplyInvoicePdf()} style={styles.invoiceButton} />
              <Button label="WhatsApp" variant="ghost" icon={<Send size={16} color={colors.primary} />} onPress={() => void shareSupplyInvoiceWhatsApp()} style={styles.invoiceButton} />
            </View>
          </BottomSheetScrollView>
        </AppBottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 10 },
  headerContent: { gap: 12 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", padding: 10 },
  statValue: { color: colors.foreground, fontSize: 15, fontWeight: "800" },
  statLabel: { color: colors.textPlaceholder, fontSize: 10, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  body: { flex: 1 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  productActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  returnButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  disabledAction: { opacity: 0.5 },
  invoiceSheet: { flex: 1 },
  invoiceSheetContent: { flexGrow: 1, paddingTop: 16, paddingHorizontal: 16, gap: 12 },
  invoiceTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  invoiceItemCard: { gap: 10 },
  invoiceItemHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  invoiceActions: { flexDirection: "row", gap: 8 },
  invoiceButton: { flex: 1, minHeight: 44 },
  modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sheetTitleBlock: { flex: 1 },
  sheetTitle: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  closeButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.inputBg },
  remarksInput: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" }
});
