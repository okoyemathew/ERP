import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Award, Medal, TrendingUp } from "lucide-react-native";
import { Card, ErrorState, LoadingState } from "@/components/common";
import { ScrollScreen } from "@/screens/shared/ScreenKit";
import { productsService } from "@/services/products.service";
import { salesService } from "@/services/sales.service";
import { colors } from "@/theme";
import type { ApiProduct } from "@/types/product";
import type { ApiSale } from "@/types/sales";
import { formatCurrency } from "@/utils/format";
import { Text } from "@/i18n";
import { StyleSheet, View } from "react-native";

type RankedProduct = { id: string; name: string; sku: string; quantity: number; revenue: number; profit: number };
const numeric = (value: unknown) => Number(value ?? 0) || 0;

export function ProductRankingScreen() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [sales, setSales] = useState<ApiSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [firstProducts, firstSales] = await Promise.all([
        productsService.list({ page: 1, limit: 100 }),
        salesService.list({ page: 1, limit: 100, status: "COMPLETED" })
      ]);
      const productsPages = await Promise.all(Array.from({ length: Math.max(0, firstProducts.meta.totalPages - 1) }, (_, index) =>
        productsService.list({ page: index + 2, limit: 100 })
      ));
      const salesPages = await Promise.all(Array.from({ length: Math.max(0, Number(firstSales.meta?.totalPages ?? 1) - 1) }, (_, index) =>
        salesService.list({ page: index + 2, limit: 100, status: "COMPLETED" })
      ));
      setProducts([...firstProducts.data, ...productsPages.flatMap((page) => page.data)]);
      setSales([...firstSales.data, ...salesPages.flatMap((page) => page.data)]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const ranked = useMemo(() => {
    const catalog = new Map(products.map((product) => [product.id, product]));
    const totals = new Map<string, RankedProduct>();
    sales.forEach((sale) => sale.items.forEach((item) => {
      const product = catalog.get(item.productId);
      const qty = Math.max(0, numeric(item.quantity));
      const revenue = Math.max(0, numeric(item.totalAmount));
      const row = totals.get(item.productId) ?? { id: item.productId, name: item.product?.name ?? product?.name ?? "Product", sku: item.product?.sku ?? product?.sku ?? "", quantity: 0, revenue: 0, profit: 0 };
      row.quantity += qty;
      row.revenue += revenue;
      const originalQuantity = numeric(item.originalQuantity ?? (qty + numeric(item.returnedQuantity)));
      const originalRevenue = numeric(item.originalTotalAmount ?? (revenue + numeric(item.returnedValue)));
      const returnedQuantity = Math.max(0, originalQuantity - qty);
      const estimatedCost = numeric(product?.inventory?.averageCost ?? product?.purchasePrice);
      row.profit += originalRevenue - numeric(item.returnedValue) - originalQuantity * estimatedCost + returnedQuantity * estimatedCost;
      totals.set(item.productId, row);
    }));
    const values = [...totals.values()];
    return {
      bestSold: [...values].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue),
      mostProfitable: [...values].sort((a, b) => b.profit - a.profit || b.revenue - a.revenue)
    };
  }, [products, sales]);

  if (loading) return <ScrollScreen title="Product Ranking"><LoadingState label="Loading product rankings" /></ScrollScreen>;
  if (error) return <ScrollScreen title="Product Ranking"><ErrorState onRetry={() => void load()} /></ScrollScreen>;

  const section = (title: string, rows: RankedProduct[], mode: "quantity" | "profit", Icon: typeof Award) => (
    <View style={styles.section}>
      <View style={styles.heading}><Icon size={19} color={colors.primary} /><Text style={styles.sectionTitle}>{title}</Text></View>
      {!rows.length ? <Card><Text style={styles.muted}>No completed product sales yet.</Text></Card> : rows.slice(0, 10).map((row, index) => (
        <Card key={`${mode}-${row.id}`} style={styles.row}>
          <View style={[styles.rank, index === 0 && styles.topRank]}><Text style={[styles.rankText, index === 0 && styles.topRankText]}>{index + 1}</Text></View>
          <View style={styles.product}>
            <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
            {row.sku ? <Text style={styles.muted}>SKU {row.sku}</Text> : null}
          </View>
          <View style={styles.values}>
            <Text style={styles.primaryValue}>{mode === "quantity" ? `${row.quantity} sold` : formatCurrency(row.profit)}</Text>
            <Text style={styles.muted}>{mode === "quantity" ? formatCurrency(row.revenue) : `${row.quantity} sold`}</Text>
          </View>
        </Card>
      ))}
    </View>
  );

  return (
    <ScrollScreen title="Product Ranking">
      <Card style={styles.note}><TrendingUp size={17} color={colors.primary} /><Text style={styles.noteText}>Profit is estimated from current average stock cost and net of approved returns.</Text></Card>
      {section("Best Sold", ranked.bestSold, "quantity", Award)}
      {section("Highest Profit", ranked.mostProfitable, "profit", Medal)}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "800" },
  note: { flexDirection: "row", alignItems: "center", gap: 9 },
  noteText: { flex: 1, color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  topRank: { backgroundColor: colors.primary },
  rankText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  topRankText: { color: colors.surface },
  product: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 10 },
  values: { alignItems: "flex-end", gap: 3 },
  primaryValue: { color: colors.foreground, fontSize: 12, fontWeight: "800" }
});
