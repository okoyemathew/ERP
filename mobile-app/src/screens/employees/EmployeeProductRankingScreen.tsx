import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Medal, Package } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Card, ErrorState, LoadingState } from "@/components/common";
import { Text } from "@/i18n";
import { employeesService } from "@/services/employees.service";
import { ScrollScreen } from "@/screens/shared/ScreenKit";
import { colors } from "@/theme";
import type { EmployeeProfileResponse } from "@/types/employee";
import { formatCurrency } from "@/utils/format";

type EmployeeProduct = NonNullable<EmployeeProfileResponse["profileActivity"]>["stock"][number];
type RankedEmployeeProduct = EmployeeProduct & {
  netQuantitySold: number;
  netSalesValue: number;
  estimatedProfit: number;
};

function renderRows(rows: RankedEmployeeProduct[], ranking: "sold" | "profit") {
  if (!rows.length) {
    return <Card style={styles.empty}><Package size={24} color={colors.textPlaceholder} /><Text style={styles.muted}>No product sales recorded for this employee yet.</Text></Card>;
  }

  return rows.slice(0, 10).map((product, index) => (
    <Card key={`${ranking}-${product.productId}`} style={styles.row}>
      <View style={[styles.rank, index === 0 && styles.topRank]}>
        {index === 0 ? <Medal size={15} color={colors.surface} /> : <Text style={styles.rankText}>{index + 1}</Text>}
      </View>
      <View style={styles.product}>
        <Text style={styles.name} numberOfLines={1}>{product.productName}</Text>
        <Text style={styles.muted}>{product.sku ?? product.barcode ?? product.productId.slice(0, 8)}</Text>
      </View>
      <View style={styles.values}>
        <Text style={styles.sold}>{ranking === "sold" ? `${product.netQuantitySold} sold` : formatCurrency(product.estimatedProfit)}</Text>
        <Text style={styles.muted}>{ranking === "sold" ? `${product.quantityInHand} in hand` : `${product.netQuantitySold} sold`}</Text>
      </View>
    </Card>
  ));
}

export function EmployeeProductRankingScreen({ route, navigation }: { route: any; navigation: any }) {
  const employeeId = route.params?.employeeId as string | undefined;
  const employeeName = route.params?.employeeName as string | undefined;
  const [products, setProducts] = useState<EmployeeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const stock = await employeesService.productStock(employeeId);
      setProducts(stock);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const rankings = useMemo(() => {
    const ranked: RankedEmployeeProduct[] = products.map((product) => {
      const originalQuantity = Math.max(0, Number(product.quantitySold || 0));
      const netQuantitySold = Math.max(0, originalQuantity - Number(product.quantityReturned || 0));
      const originalSalesValue = Math.max(0, Number(product.totalSoldValue || 0));
      const netSalesValue = originalQuantity > 0
        ? originalSalesValue * (netQuantitySold / originalQuantity)
        : 0;
      const estimatedProfit = netSalesValue - netQuantitySold * Number(product.unitValue || 0);
      return { ...product, netQuantitySold, netSalesValue, estimatedProfit };
    }).filter((product) => product.netQuantitySold > 0);

    return {
      bestSold: [...ranked].sort((left, right) => right.netQuantitySold - left.netQuantitySold),
      highestProfit: [...ranked].sort((left, right) => right.estimatedProfit - left.estimatedProfit)
    };
  }, [products]);

  if (loading) {
    return <ScrollScreen title="Product Ranking" onBack={() => navigation.goBack()}><LoadingState label="Loading product ranking" /></ScrollScreen>;
  }

  if (error) {
    return <ScrollScreen title="Product Ranking" onBack={() => navigation.goBack()}><ErrorState onRetry={() => void load()} /></ScrollScreen>;
  }

  return (
    <ScrollScreen title="Product Ranking" onBack={() => navigation.goBack()}>
      <Text style={styles.subtitle}>{employeeName ? `Ranked from ${employeeName}'s sales` : "Ranked from this employee's sales"}</Text>
      <Text style={styles.sectionTitle}>Best Sold</Text>
      {renderRows(rankings.bestSold, "sold")}
      <Text style={styles.sectionTitle}>Highest Profit</Text>
      <Text style={styles.profitNote}>Estimated using current product cost and net sales value.</Text>
      {renderRows(rankings.highestProfit, "profit")}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "800", marginTop: 4 },
  profitNote: { color: colors.textMuted, fontSize: 10, marginTop: -8 },
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  topRank: { backgroundColor: colors.primary },
  rankText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  product: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  muted: { color: colors.textMuted, fontSize: 10 },
  values: { alignItems: "flex-end", gap: 3 },
  sold: { color: colors.foreground, fontSize: 12, fontWeight: "800" },
  empty: { alignItems: "center", gap: 9 }
});
