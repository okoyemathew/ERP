import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { Plus, Truck } from "lucide-react-native";
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar } from "@/components/common";
import { goodsDisbursementService } from "@/services/goods-disbursement.service";
import { suppliersService } from "@/services/suppliers.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiGoodsDisbursement } from "@/types/goodsDisbursement";
import type { ApiSupplier } from "@/types/supplier";
import { canAccess } from "@/utils/permissions";
import { formatCurrency } from "@/utils/format";

function money(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

type EmployeeSuppliedProduct = {
  productId: string;
  productName: string;
  sku?: string | null;
  barcode?: string | null;
  quantityInHand: number;
  suppliedQuantity: number;
  unitValue: string | number;
  lastActivityAt: string;
};
type SuppliedListItem = EmployeeSuppliedProduct | ApiSupplier;

function aggregateEmployeeProducts(disbursements: ApiGoodsDisbursement[]) {
  const byProduct = new Map<string, EmployeeSuppliedProduct>();

  for (const run of disbursements) {
    for (const item of run.items) {
      if (!item.product) continue;
      if (item.product.isActive === false) continue;

      const current = byProduct.get(item.productId);
      const nextQuantity = (current?.suppliedQuantity ?? 0) + item.quantity;
      byProduct.set(item.productId, {
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        quantityInHand: nextQuantity,
        suppliedQuantity: nextQuantity,
        unitValue: item.product.sellingPrice ?? current?.unitValue ?? 0,
        lastActivityAt: run.disbursementDate ?? run.createdAt,
      });
    }
  }

  return Array.from(byProduct.values()).sort(
    (left, right) => new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime()
  );
}

export function SuppliedScreen({ navigation }: { navigation: any }) {
  const user = useAuthStore((state) => state.user);
  const normalizedRoleName = user?.roleName?.trim().toLowerCase();
  const isBusinessOwner = normalizedRoleName ? normalizedRoleName === "owner" : user?.role === "owner" && !user?.employeeId;
  const role = isBusinessOwner ? "owner" : "employee";
  const isEmployeeView = !isBusinessOwner;
  const canCreateSupplier = canAccess(role, "SupplierForm");
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [employeeProducts, setEmployeeProducts] = useState<EmployeeSuppliedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateStack = (route: string, params?: Record<string, string>) => {
    const parent = navigation.getParent?.();
    if (parent) parent.navigate(route as never, params as never);
    else navigation.navigate(route, params);
  };

  const loadSupplied = useCallback(async (search = query, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      if (isEmployeeView) {
        const response = await goodsDisbursementService.mine({ limit: 100 });
        const products = aggregateEmployeeProducts(response.data);
        const normalizedSearch = search.trim().toLowerCase();
        setEmployeeProducts(
          normalizedSearch
            ? products.filter((product) =>
                [product.productName, product.sku, product.barcode]
                  .filter(Boolean)
                  .some((value) => String(value).toLowerCase().includes(normalizedSearch))
              )
            : products
        );
        return;
      }

      const response = search.trim()
        ? await suppliersService.search(search.trim(), { limit: 50 })
        : await suppliersService.list({ limit: 50 });
      setSuppliers(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load supplied products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isEmployeeView, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSupplied(query, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, loadSupplied]);

  useFocusEffect(
    useCallback(() => {
      void loadSupplied(query);
    }, [loadSupplied, query])
  );

  const totalCredit = useMemo(() => suppliers.reduce((sum, supplier) => sum + money(supplier.outstandingBalance), 0), [suppliers]);
  const totalSupplied = employeeProducts.reduce((sum, product) => sum + product.suppliedQuantity, 0);
  const totalStockValue = employeeProducts.reduce((sum, product) => sum + money(product.unitValue) * product.quantityInHand, 0);
  const dataIsEmpty = isEmployeeView ? employeeProducts.length === 0 : suppliers.length === 0;
  const headerTitle = isEmployeeView ? "Supplied Products" : "Suppliers";
  const rightAction = !isEmployeeView && canCreateSupplier ? <Pressable onPress={() => navigateStack("SupplierForm")}><Plus size={20} color={colors.primary} /></Pressable> : undefined;

  const refresh = () => {
    setRefreshing(true);
    void loadSupplied(query, false);
  };

  if (loading && dataIsEmpty) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={headerTitle} right={rightAction} />
        <LoadingState label={isEmployeeView ? "Loading supplied products" : "Loading suppliers"} />
      </View>
    );
  }

  if (error && dataIsEmpty) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={headerTitle} right={rightAction} />
        <ErrorState onRetry={() => void loadSupplied()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={headerTitle} right={rightAction} />
      <FlatList<SuppliedListItem>
        data={isEmployeeView ? employeeProducts : suppliers}
        keyExtractor={(item) => ("productName" in item ? item.productId : item.id)}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={isEmployeeView ? "Search supplied products" : "Search suppliers"} />
            <View style={styles.stats}>
              <Card style={styles.stat}><Text style={styles.statValue}>{isEmployeeView ? employeeProducts.length : suppliers.length}</Text><Text style={styles.statLabel}>Total</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{isEmployeeView ? totalSupplied : suppliers.filter((item) => money(item.outstandingBalance) > 0).length}</Text><Text style={styles.statLabel}>{isEmployeeView ? "Supplied" : "With credit"}</Text></Card>
              <Card style={styles.stat}><Text style={styles.statValue}>{formatCurrency(isEmployeeView ? totalStockValue : totalCredit)}</Text><Text style={styles.statLabel}>{isEmployeeView ? "Stock value" : "Supplier credit"}</Text></Card>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          "productName" in item ? (
            <Card style={styles.row}>
              <View style={styles.icon}><Truck size={18} color={colors.primary} /></View>
              <View style={styles.body}>
                <Text style={styles.title}>{item.productName}</Text>
                <Text style={styles.meta}>{item.sku ?? item.barcode ?? "No SKU"} | In hand: {item.quantityInHand}</Text>
              </View>
              <Badge label={String(item.suppliedQuantity)} variant={item.quantityInHand > 0 ? "success" : "neutral"} />
            </Card>
          ) : (
            <Pressable onPress={() => navigateStack("SupplierDetail", { supplierId: item.id })} accessibilityLabel={`Open ${item.companyName}`}>
              <Card style={styles.row}>
                <View style={styles.icon}><Truck size={18} color={colors.primary} /></View>
                <View style={styles.body}>
                  <Text style={styles.title}>{item.companyName}</Text>
                  <Text style={styles.meta}>{item.phone} | {item.contactPerson ?? "No contact"}</Text>
                </View>
                {money(item.outstandingBalance) > 0 ? <Badge label={formatCurrency(money(item.outstandingBalance))} variant="warning" /> : <Badge label={item.status} variant="success" />}
              </Card>
            </Pressable>
          )
        )}
        ListEmptyComponent={<EmptyState icon={<Truck size={28} color={colors.textPlaceholder} />} title={isEmployeeView ? "No supplied products yet" : "No suppliers yet"} />}
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
