import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { ClipboardList, Search } from "lucide-react-native";
import { Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from "@/components/common";
import { creditSalesService } from "@/services/credit-sales.service";
import { colors, spacing } from "@/theme";
import type { ApiCreditSale } from "@/types/creditSale";
import { formatCurrency } from "@/utils/format";

export function PendingPaymentsScreen() {
  const [items, setItems] = useState<ApiCreditSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await creditSalesService.outstanding({ limit: 50 });
      setItems(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Pending Payments" />
      <View style={styles.content}>
        {loading ? <LoadingState label="Loading pending payments" /> : null}
        {error ? <ErrorState onRetry={() => void load()} /> : null}
        {!loading && !error && items.length === 0 ? <EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No pending payments" /> : null}
        {!loading && !error && items.map((payment) => (
          <Card key={payment.id} style={styles.card}>
            <View style={styles.row}>
              <ClipboardList size={18} color={colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{payment.customer.name}</Text>
                <Text style={styles.meta}>{payment.sale.saleNumber} | {payment.sale.salesperson.name || payment.sale.salesperson.username}</Text>
              </View>
              <Text style={styles.amount}>{formatCurrency(Number(payment.balance))}</Text>
            </View>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, gap: 12 },
  card: { gap: 12 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  amount: { color: colors.foreground, fontSize: 14, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10 },
  button: { flex: 1, minHeight: 44 }
});
