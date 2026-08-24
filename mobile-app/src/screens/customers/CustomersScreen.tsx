import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { Plus, Users } from "lucide-react-native";
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { customersService } from "@/services/customers.service";
import { colors, spacing } from "@/theme";
import type { ApiCustomer } from "@/types/customer";
import { customerDisplayName } from "@/types/customer";
import { formatCurrency } from "@/utils/format";

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function lastPurchase(customer: ApiCustomer): string {
  const latest = customer.sales?.[0]?.saleDate;
  if (!latest) return "No purchases yet";
  return new Date(latest).toLocaleDateString();
}

export function CustomersScreen({ navigation }: { navigation: any }) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(async (search = query, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const response = search.trim()
        ? await customersService.search(search.trim(), { limit: 50 })
        : await customersService.list({ limit: 50 });
      setCustomers(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load customers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCustomers(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, loadCustomers]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomers(query);
    }, [loadCustomers, query])
  );

  const stats = useMemo(() => {
    const totalOwed = customers.reduce((sum, customer) => sum + money(customer.outstandingBalance), 0);
    return {
      total: customers.length,
      withBalance: customers.filter((customer) => money(customer.outstandingBalance) > 0).length,
      totalOwed
    };
  }, [customers]);

  const refresh = () => {
    setRefreshing(true);
    void loadCustomers(query, false);
  };

  if (loading && customers.length === 0) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Customers" right={<Pressable onPress={() => navigation.navigate("CustomerForm")}><Plus size={20} color={colors.primary} /></Pressable>} />
        <LoadingState label="Loading customers" />
      </View>
    );
  }

  if (error && customers.length === 0) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Customers" right={<Pressable onPress={() => navigation.navigate("CustomerForm")}><Plus size={20} color={colors.primary} /></Pressable>} />
        <ErrorState onRetry={() => void loadCustomers()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Customers" right={<Pressable onPress={() => navigation.navigate("CustomerForm")}><Plus size={20} color={colors.primary} /></Pressable>} />
      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search customers" />
            <View style={styles.stats}>
              <Card style={styles.stat}><Text style={styles.statValue}>{stats.total}</Text><Text style={styles.statLabel}>Total</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{stats.withBalance}</Text><Text style={styles.statLabel}>With balance</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(stats.totalOwed)}</Text><Text style={styles.statLabel}>Total owed</Text></Card>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const name = customerDisplayName(item);
          const outstanding = money(item.outstandingBalance);
          return (
            <Pressable onPress={() => navigation.navigate("CustomerDetail", { customerId: item.id })} accessibilityLabel={`Open ${name}`}>
              <Card style={styles.row}>
                <Avatar name={name} />
                <View style={styles.body}>
                  <Text style={styles.title}>{name}</Text>
                  <Text style={styles.meta}>{item.phone} | {lastPurchase(item)}</Text>
                </View>
                {outstanding > 0 ? <Badge label={formatCurrency(outstanding)} variant="error" /> : null}
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon={<Users size={28} color={colors.textPlaceholder} />} title="No customers yet" />}
        contentContainerStyle={styles.list}
      />
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
  body: { flex: 1 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  empty: { alignItems: "center", padding: 40, gap: 8 }
});
