import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { Plus, Truck } from "lucide-react-native";
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { suppliersService } from "@/services/suppliers.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiSupplier } from "@/types/supplier";
import { canAccess } from "@/utils/permissions";
import { formatCurrency } from "@/utils/format";

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

export function SuppliedScreen({ navigation }: { navigation: any }) {
  const user = useAuthStore((state) => state.user);
  const role = user?.roleName ? (user.roleName === "Owner" ? "owner" : "employee") : user?.role ?? "owner";
  const canCreateSupplier = canAccess(role, "SupplierForm");
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSuppliers = useCallback(async (search = query, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const response = search.trim()
        ? await suppliersService.search(search.trim(), { limit: 50 })
        : await suppliersService.list({ limit: 50 });
      setSuppliers(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load suppliers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSuppliers(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, loadSuppliers]);

  useFocusEffect(
    useCallback(() => {
      void loadSuppliers(query);
    }, [loadSuppliers, query])
  );

  const totalCredit = useMemo(() => suppliers.reduce((sum, supplier) => sum + money(supplier.outstandingBalance), 0), [suppliers]);

  const refresh = () => {
    setRefreshing(true);
    void loadSuppliers(query, false);
  };

  if (loading && suppliers.length === 0) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Suppliers" right={canCreateSupplier ? <Pressable onPress={() => navigation.navigate("SupplierForm")}><Plus size={20} color={colors.primary} /></Pressable> : undefined} />
        <LoadingState label="Loading suppliers" />
      </View>
    );
  }

  if (error && suppliers.length === 0) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Suppliers" right={canCreateSupplier ? <Pressable onPress={() => navigation.navigate("SupplierForm")}><Plus size={20} color={colors.primary} /></Pressable> : undefined} />
        <ErrorState onRetry={() => void loadSuppliers()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Suppliers" right={canCreateSupplier ? <Pressable onPress={() => navigation.navigate("SupplierForm")}><Plus size={20} color={colors.primary} /></Pressable> : undefined} />
      <FlatList
        data={suppliers}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search suppliers" />
            <View style={styles.stats}>
              <Card style={styles.stat}><Text style={styles.statValue}>{suppliers.length}</Text><Text style={styles.statLabel}>Total</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{suppliers.filter((item) => money(item.outstandingBalance) > 0).length}</Text><Text style={styles.statLabel}>With credit</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(totalCredit)}</Text><Text style={styles.statLabel}>Supplier credit</Text></Card>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("SupplierDetail", { supplierId: item.id })} accessibilityLabel={`Open ${item.companyName}`}>
            <Card style={styles.row}>
              <View style={styles.icon}><Truck size={18} color={colors.primary} /></View>
              <View style={styles.body}>
                <Text style={styles.title}>{item.companyName}</Text>
                <Text style={styles.meta}>{item.phone} | {item.contactPerson ?? "No contact"}</Text>
              </View>
              {money(item.outstandingBalance) > 0 ? <Badge label={formatCurrency(money(item.outstandingBalance))} variant="warning" /> : <Badge label={item.status} variant="success" />}
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState icon={<Truck size={28} color={colors.textPlaceholder} />} title="No suppliers yet" />}
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
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondaryBg },
  body: { flex: 1 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 }
});
