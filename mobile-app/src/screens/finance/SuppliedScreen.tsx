import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { RotateCcw, Truck, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { employeesService } from "@/services/employees.service";
import { productsService } from "@/services/products.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ProductAddedBy, StockInHistoryRecord } from "@/types/product";
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
  lastActivityAt: string;
};
type SuppliedListItem = EmployeeSuppliedProduct | StockInHistoryRecord;

function userName(user?: ProductAddedBy | null) {
  if (!user) return "Unknown";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

export function SuppliedScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const normalizedRoleName = user?.roleName?.trim().toLowerCase();
  const isBusinessOwner = normalizedRoleName ? normalizedRoleName === "owner" : user?.role === "owner" && !user?.employeeId;
  const isEmployeeView = !isBusinessOwner;
  const [query, setQuery] = useState("");
  const [stockHistory, setStockHistory] = useState<StockInHistoryRecord[]>([]);
  const [employeeProducts, setEmployeeProducts] = useState<EmployeeSuppliedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnProduct, setReturnProduct] = useState<EmployeeSuppliedProduct | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnKeyboardOffset, setReturnKeyboardOffset] = useState(0);

  const loadSupplied = useCallback(async (search = query, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      if (isEmployeeView) {
        const response = await employeesService.myProfile();
        const products = response.profileActivity?.stock.map((product) => ({
          productId: product.productId,
          productName: product.productName,
          sku: product.sku,
          barcode: product.barcode,
          quantityInHand: product.quantityInHand,
          suppliedQuantity: product.suppliedQuantity,
          unitValue: product.unitValue,
          lastActivityAt: product.lastActivityAt,
        })) ?? [];
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
        return;
      }

      const response = await productsService.stockInHistory({ search: search.trim() || undefined, limit: 50 });
      setStockHistory(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load supplied products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isEmployeeView, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSupplied(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, loadSupplied]);

  useFocusEffect(
    useCallback(() => {
      void loadSupplied(query);
    }, [loadSupplied, query])
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

  const totalAdded = useMemo(() => stockHistory.reduce((sum, item) => sum + item.quantity, 0), [stockHistory]);
  const totalAddedValue = useMemo(() => stockHistory.reduce((sum, item) => sum + money(item.unitCost) * item.quantity, 0), [stockHistory]);
  const totalSupplied = employeeProducts.reduce((sum, product) => sum + product.suppliedQuantity, 0);
  const totalStockValue = employeeProducts.reduce((sum, product) => sum + money(product.unitValue) * product.quantityInHand, 0);
  const dataIsEmpty = isEmployeeView ? employeeProducts.length === 0 : stockHistory.length === 0;
  const headerTitle = "Supplied Products";

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
      <ScreenHeader title={headerTitle} />
      <FlatList<SuppliedListItem>
        data={isEmployeeView ? employeeProducts : stockHistory}
        keyExtractor={(item) => ("productName" in item ? item.productId : item.id)}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search supplied products" />
            <View style={styles.stats}>
              <Card style={styles.stat}><Text style={styles.statValue}>{isEmployeeView ? employeeProducts.length : stockHistory.length}</Text><Text style={styles.statLabel}>Total</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{isEmployeeView ? totalSupplied : totalAdded}</Text><Text style={styles.statLabel}>{isEmployeeView ? "Supplied" : "Units Added"}</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(isEmployeeView ? totalStockValue : totalAddedValue)}</Text><Text style={styles.statLabel}>{isEmployeeView ? "Stock value" : "Added value"}</Text></Card>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          "productName" in item ? (
            <Card style={styles.row}>
              <View style={styles.icon}><Truck size={18} color={colors.primary} /></View>
              <View style={styles.body}>
                <Text style={styles.title}>{item.productName}</Text>
                <Text style={styles.meta}>{item.sku ?? item.barcode ?? "No SKU"} | In hand: {item.quantityInHand}</Text>
              </View>
              <View style={styles.productActions}>
                <Badge label={String(item.suppliedQuantity)} variant={item.quantityInHand > 0 ? "success" : "neutral"} />
                <Pressable
                  onPress={() => openReturnSheet(item)}
                  disabled={item.quantityInHand <= 0}
                  style={[styles.returnButton, item.quantityInHand <= 0 && styles.disabledAction]}
                  accessibilityRole="button"
                  accessibilityLabel={`Return ${item.productName}`}
                >
                  <RotateCcw size={16} color={colors.primary} />
                </Pressable>
              </View>
            </Card>
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
