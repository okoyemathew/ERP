import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Clock, CreditCard, Search, ShoppingBag } from "lucide-react-native";
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar, statusVariant } from "@/components/common";
import { salesService } from "@/services/sales.service";
import { colors, spacing } from "@/theme";
import type { ApiSale } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

function customerName(sale: ApiSale) {
  return sale.customer
    ? sale.customer.companyName ||
        [sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(" ")
    : "Walk-in Customer";
}

function paymentMethod(sale: ApiSale) {
  return sale.payments[0]?.paymentMethod ?? (Number(sale.balanceDue) > 0 ? "CREDIT" : "UNPAID");
}

export function SalesRecordsScreen() {
  const [query, setQuery] = useState("");
  const [sales, setSales] = useState<ApiSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const loadSales = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(false);
    try {
      const response = await salesService.list({ limit: 50, search: query.trim() });
      setSales(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSales(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [loadSales]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Sales Records" />
      <FlatList
        data={loading || error ? [] : sales}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void loadSales(false);
        }}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search sales" />
            <View style={styles.filters}>{["All", "Completed", "Pending", "Refunded"].map((chip) => <Text key={chip} style={styles.chip}>{chip}</Text>)}</View>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.icon}><ShoppingBag size={16} color={colors.primary} /></View>
            <View style={styles.body}>
              <Text style={styles.title}>{customerName(item)}</Text>
              <Text style={styles.meta}>{item.saleNumber} | {item.items.length} items</Text>
              <View style={styles.row}>
                <Clock size={12} color={colors.textPlaceholder} />
                <Text style={styles.meta}>{new Date(item.saleDate).toLocaleDateString()}</Text>
                <CreditCard size={12} color={colors.textPlaceholder} />
                <Text style={styles.meta}>{paymentMethod(item)}</Text>
              </View>
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>{formatCurrency(Number(item.totalAmount))}</Text>
              <Badge label={item.status} variant={statusVariant(item.status)} />
            </View>
          </Card>
        )}
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading sales" />
          ) : error ? (
            <ErrorState onRetry={() => void loadSales()} />
          ) : (
            <EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No sales found" />
          )
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenHorizontal, paddingBottom: 110, gap: 10 },
  headerContent: { gap: 12, marginBottom: 2 },
  filters: { flexDirection: "row", gap: 8 },
  chip: { color: colors.primary, backgroundColor: colors.secondaryBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontSize: 11, fontWeight: "700" },
  card: { flexDirection: "row", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, textTransform: "capitalize" },
  row: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 6 },
  amount: { color: colors.foreground, fontSize: 13, fontWeight: "800" }
});
