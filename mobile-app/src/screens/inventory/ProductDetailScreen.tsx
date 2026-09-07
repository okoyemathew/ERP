import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { Package, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, ErrorState, LoadingState, ScreenHeader } from "@/components/common";
import { productsService } from "@/services/products.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { ApiProduct } from "@/types/product";
import { formatCurrency } from "@/utils/format";

function addedByName(product: ApiProduct) {
  if (!product.addedBy) return "Unknown";
  return [product.addedBy.firstName, product.addedBy.lastName].filter(Boolean).join(" ") || product.addedBy.username;
}

export function ProductDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const productId = route.params?.productId as string;
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const canManage = useAuthStore((state) => state.can("products.manage"));
  const isOwner = user?.role === "owner" || user?.roleName === "Owner";
  const canRequestReturn = Boolean(user);
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [returnVisible, setReturnVisible] = useState(false);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setProduct(await productsService.detail(productId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteProduct = async () => {
    if (!product) return;
    Alert.alert("Delete product?", `${product.name} will be removed from inventory.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await productsService.deactivate(product.id);
            navigation.goBack();
          } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : "Unable to delete product.";
            Alert.alert("Unable to delete", message);
          }
        }
      }
    ]);
  };

  const submitReturnRequest = async () => {
    if (!product || returnSubmitting) return;
    const quantity = Number.parseInt(returnQuantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      Alert.alert("Invalid quantity", "Enter a quantity of at least 1.");
      return;
    }

    setReturnSubmitting(true);
    try {
      await productsService.createReturnRequest({
        productId: product.id,
        quantity,
        remarks: returnRemarks.trim() || undefined
      });
      setReturnVisible(false);
      setReturnQuantity("1");
      setReturnRemarks("");
      Alert.alert("Return submitted", "The business owner can now approve this returned product.");
    } catch (returnError) {
      const message = returnError instanceof Error ? returnError.message : "Unable to submit return request.";
      Alert.alert("Return failed", message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading product" />;
  if (error || !product) return <ErrorState onRetry={load} />;

  const primaryImage = product.imageUrl ?? product.images?.find((image) => image.isPrimary)?.imageUrl;
  const stock = product.inventory?.quantityAvailable ?? 0;
  const addedAt = product.addedAt ?? product.createdAt;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Product Details" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        <Card style={styles.hero}>
          {primaryImage ? <Image source={{ uri: primaryImage }} style={styles.image} /> : <View style={styles.icon}><Package size={34} color={colors.primary} /></View>}
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.meta}>{product.category.name} | {product.sku}</Text>
        </Card>
        <View style={styles.grid}>
          <Card style={styles.stat}><Text style={styles.value}>{formatCurrency(Number(product.sellingPrice))}</Text><Text style={styles.label}>Selling</Text></Card>
          <Card style={styles.stat}><Text style={styles.value}>{stock}</Text><Text style={styles.label}>Available</Text></Card>
        </View>
        <Card style={styles.info}>
          <Info label="Barcode" value={product.barcode ?? product.barcodes?.[0]?.barcode ?? "Not set"} />
          <Info label="Brand" value={product.brand?.name ?? "Not set"} />
          <Info label="Unit" value={`${product.unit.name} (${product.unit.symbol})`} />
          <Info label="Supplier" value={product.supplier?.companyName ?? "Not set"} />
          <Info label="Purchase Price" value={formatCurrency(Number(product.purchasePrice))} />
          {isOwner && product.baseSellingPrice !== undefined ? <Info label="Base Selling Price" value={formatCurrency(Number(product.baseSellingPrice))} /> : null}
          <Info label="Wholesale Price" value={product.wholesalePrice ? formatCurrency(Number(product.wholesalePrice)) : "Not set"} />
          <Info label="Minimum Stock" value={String(product.minimumStock)} />
          <Info label="Maximum Stock" value={product.maximumStock === null || product.maximumStock === undefined ? "Not set" : String(product.maximumStock)} />
          <Info label="Status" value={product.isActive ? "Active" : "Inactive"} />
        </Card>
        <Card style={styles.info}>
          <Info label="Added" value={addedAt ? new Date(addedAt).toLocaleDateString() : "Not recorded"} />
          <Info label="Added By" value={addedByName(product)} />
          <Info label="Initial Stock" value={String(product.initialStockQuantity ?? 0)} />
        </Card>
        {canManage || canRequestReturn ? (
          <View style={styles.actions}>
            {canRequestReturn ? <Button label="Request Return" variant="ghost" onPress={() => setReturnVisible(true)} /> : null}
            {canManage ? <Button label="Edit Product" onPress={() => navigation.navigate("ProductForm", { productId: product.id })} /> : null}
            {canManage && isOwner ? <Button label="Delete Product" variant="danger" onPress={deleteProduct} /> : null}
          </View>
        ) : null}
      </ScrollView>
      <Modal
        visible={returnVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setReturnVisible(false)}
      >
        <View style={styles.modal}>
          <Pressable style={styles.backdrop} onPress={() => setReturnVisible(false)} accessibilityRole="button" accessibilityLabel="Close return request" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Request Return</Text>
                <Text style={styles.meta}>{product.name}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setReturnVisible(false)} accessibilityRole="button" accessibilityLabel="Close return request">
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
        </View>
      </Modal>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.item}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  hero: { alignItems: "center", gap: 8 },
  icon: { width: 74, height: 74, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  image: { width: 86, height: 86, borderRadius: 18 },
  name: { ...typography.cardTitle, color: colors.foreground, textAlign: "center" },
  meta: { ...typography.caption, color: colors.textPlaceholder },
  grid: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, alignItems: "center" },
  value: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
  label: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  info: { gap: 12 },
  infoRow: { gap: 3 },
  item: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  actions: { gap: 10 },
  modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sheetTitle: { ...typography.cardTitle, color: colors.foreground },
  closeButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.inputBg },
  remarksInput: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" }
});
