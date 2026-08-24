import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Package, Plus } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Badge, Card, ErrorState, LoadingState, ScreenHeader, statusVariant } from "@/components/common";
import { productsService } from "@/services/products.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiProduct } from "@/types/product";
import { formatCurrency } from "@/utils/format";

const stockStatus = (stock: number) => {
  if (stock === 0) return "Out";
  if (stock <= 5) return "Critical";
  if (stock <= 15) return "Low";
  return "In Stock";
};

export function InventoryScreen({ navigation }: { navigation: any }) {
  const canManage = useAuthStore((state) => state.can("products.manage"));
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await productsService.list({ limit: 100 });
      setProducts(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      void load();
    });
    void load();
    return unsubscribe;
  }, [load, navigation]);

  if (loading) return <LoadingState label="Loading products" />;
  if (error) return <ErrorState onRetry={load} />;

  const totalValue = products.reduce((sum, product) => sum + Number(product.sellingPrice) * (product.inventory?.quantityAvailable ?? 0), 0);
  const totalUnits = products.reduce((sum, product) => sum + (product.inventory?.quantityAvailable ?? 0), 0);
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Inventory"
        right={canManage ? <Pressable onPress={() => navigation.navigate("ProductForm")} accessibilityRole="button" accessibilityLabel="Create product"><Plus size={20} color={colors.primary} /></Pressable> : undefined}
      />
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        refreshing={false}
        onRefresh={() => undefined}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.banner}>
              <Text style={styles.bannerLabel}>Total Stock Value</Text>
              <Text style={styles.bannerValue}>{formatCurrency(totalValue)}</Text>
              <Text style={styles.unitChip}>{totalUnits} units</Text>
            </LinearGradient>
            <View style={styles.stats}>
              {["Total SKUs", "Low Stock", "Out of Stock"].map((label, index) => (
                <Card key={label} style={styles.stat}>
                  <Text style={styles.statValue}>{index === 0 ? products.length : index === 1 ? products.filter((p) => (p.inventory?.quantityAvailable ?? 0) > 0 && (p.inventory?.quantityAvailable ?? 0) <= p.minimumStock).length : products.filter((p) => (p.inventory?.quantityAvailable ?? 0) === 0).length}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </Card>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const stock = item.inventory?.quantityAvailable ?? 0;
          const maxStock = item.maximumStock ?? 100;
          const status = stockStatus(stock);
          return (
            <Pressable onPress={() => navigation.navigate("ProductDetail", { productId: item.id })} accessibilityRole="button" accessibilityLabel={`View ${item.name}`}>
            <Card style={styles.row}>
              <View style={[styles.icon, { backgroundColor: item.isActive ? colors.primary : colors.textPlaceholder }]}>
                <Package size={17} color={colors.surface} />
              </View>
              <View style={styles.body}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.meta}>{item.category.name} | {item.sku}</Text>
                <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.min((stock / Math.max(maxStock, 1)) * 100, 100)}%`, backgroundColor: stock <= item.minimumStock ? colors.error : colors.success }]} /></View>
              </View>
              <View style={styles.right}>
                <Text style={styles.stock}>{stock}</Text>
                <Badge label={status} variant={statusVariant(status)} />
              </View>
            </Card>
            </Pressable>
          );
        }}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 10 },
  headerContent: { gap: 12, marginBottom: 2 },
  banner: { borderRadius: 20, padding: 18 },
  bannerLabel: { color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: "700" },
  bannerValue: { color: colors.surface, fontSize: 30, fontWeight: "800", marginTop: 4 },
  unitChip: { alignSelf: "flex-start", color: colors.surface, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginTop: 12, overflow: "hidden" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  statLabel: { color: colors.textPlaceholder, fontSize: 10, marginTop: 2, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 4 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11 },
  progress: { height: 5, borderRadius: 99, backgroundColor: colors.borderLighter, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99 },
  right: { alignItems: "flex-end", gap: 6 },
  stock: { color: colors.foreground, fontSize: 15, fontWeight: "800" }
});
