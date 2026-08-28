import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Package, Plus, Search, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar, statusVariant } from "@/components/common";
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

const RECENT_PRODUCT_DAYS = 30;

function productAddedAt(product: ApiProduct) {
  return product.addedAt ?? product.createdAt;
}

function isRecentlyAdded(product: ApiProduct) {
  const addedAt = productAddedAt(product);
  if (!addedAt) return false;
  return Date.now() - new Date(addedAt).getTime() <= RECENT_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
}

function addedByName(product: ApiProduct) {
  if (!product.addedBy) return "Unknown";
  return [product.addedBy.firstName, product.addedBy.lastName].filter(Boolean).join(" ") || product.addedBy.username;
}

export function InventoryScreen({ navigation }: { navigation: any }) {
  const canManage = useAuthStore((state) => state.can("products.manage"));
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const hasLoadedRef = useRef(false);
  const queryRef = useRef(query);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const load = useCallback(async (searchValue = queryRef.current, showSpinner = true) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    if (showSpinner) setLoading(true);
    else setSearching(true);
    setError(false);
    try {
      const response = await productsService.list({
        limit: 100,
        search: searchValue.trim() || undefined,
        sortBy: "createdAt",
        sortOrder: "desc"
      });
      if (requestId !== latestRequestRef.current) return;
      setProducts(response.data);
    } catch {
      if (requestId !== latestRequestRef.current) return;
      setError(true);
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
        setSearching(false);
        hasLoadedRef.current = true;
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      void load(queryRef.current);
    });
    void load();
    return unsubscribe;
  }, [load, navigation]);

  useEffect(() => {
    if (!hasLoadedRef.current) return undefined;
    const timer = setTimeout(() => {
      void load(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [load, query]);

  const stats = useMemo(() => {
    const totalValue = products.reduce((sum, product) => sum + Number(product.sellingPrice) * (product.inventory?.quantityAvailable ?? 0), 0);
    const totalUnits = products.reduce((sum, product) => sum + (product.inventory?.quantityAvailable ?? 0), 0);
    const lowStock = products.filter((p) => (p.inventory?.quantityAvailable ?? 0) > 0 && (p.inventory?.quantityAvailable ?? 0) <= p.minimumStock).length;
    const outOfStock = products.filter((p) => (p.inventory?.quantityAvailable ?? 0) === 0).length;
    return { totalValue, totalUnits, lowStock, outOfStock };
  }, [products]);

  const refresh = () => {
    setRefreshing(true);
    void load(queryRef.current, false);
  };

  if (loading) return <LoadingState label="Loading products" />;
  if (error) return <ErrorState onRetry={() => void load()} />;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Inventory"
        right={canManage ? <Pressable onPress={() => navigation.navigate("ProductForm")} accessibilityRole="button" accessibilityLabel="Create product"><Plus size={20} color={colors.primary} /></Pressable> : undefined}
      />
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.searchRow}>
              <View style={styles.searchInput}>
                <SearchBar value={query} onChangeText={setQuery} placeholder="Search products, SKU, barcode" />
              </View>
              {query ? (
                <Pressable onPress={() => setQuery("")} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Clear product search">
                  <X size={18} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.banner}>
              <Text style={styles.bannerLabel}>Total Stock Value</Text>
              <Text style={styles.bannerValue}>{formatCurrency(stats.totalValue)}</Text>
              <Text style={styles.unitChip}>{stats.totalUnits} units</Text>
            </LinearGradient>
            <View style={styles.stats}>
              {["Total SKUs", "Low Stock", "Out of Stock"].map((label, index) => (
                <Card key={label} style={styles.stat}>
                  <Text style={styles.statValue}>{index === 0 ? products.length : index === 1 ? stats.lowStock : stats.outOfStock}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </Card>
              ))}
            </View>
            {searching ? <Text style={styles.searching}>Searching products...</Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          const stock = item.inventory?.quantityAvailable ?? 0;
          const maxStock = item.maximumStock ?? 100;
          const status = stockStatus(stock);
          const addedAt = productAddedAt(item);
          return (
            <Pressable onPress={() => navigation.navigate("ProductDetail", { productId: item.id })} accessibilityRole="button" accessibilityLabel={`View ${item.name}`}>
            <Card style={styles.row}>
              <View style={[styles.icon, { backgroundColor: item.isActive ? colors.primary : colors.textPlaceholder }]}>
                <Package size={17} color={colors.surface} />
              </View>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
                  {isRecentlyAdded(item) ? <Badge label="New" variant="primary" /> : null}
                </View>
                <Text style={styles.meta}>{item.category.name} | {item.sku}</Text>
                <Text style={styles.meta}>{addedAt ? `Added ${new Date(addedAt).toLocaleDateString()} by ${addedByName(item)}` : "Added date unavailable"}</Text>
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
        ListEmptyComponent={<EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title={query.trim() ? "No products found" : "No products yet"} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 10 },
  headerContent: { gap: 12, marginBottom: 2 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1 },
  clearButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11 },
  searching: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  progress: { height: 5, borderRadius: 99, backgroundColor: colors.borderLighter, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99 },
  right: { alignItems: "flex-end", gap: 6 },
  stock: { color: colors.foreground, fontSize: 15, fontWeight: "800" }
});
