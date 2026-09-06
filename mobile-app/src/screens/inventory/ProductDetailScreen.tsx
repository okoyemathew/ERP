import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Package } from "lucide-react-native";
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
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
        {canManage ? (
          <View style={styles.actions}>
            <Button label="Edit Product" onPress={() => navigation.navigate("ProductForm", { productId: product.id })} />
            {isOwner ? <Button label="Delete Product" variant="danger" onPress={deleteProduct} /> : null}
          </View>
        ) : null}
      </ScrollView>
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
  actions: { gap: 10 }
});
