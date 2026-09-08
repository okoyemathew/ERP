import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { Check, RotateCcw, Search, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar, statusVariant } from "@/components/common";
import { productsService } from "@/services/products.service";
import { colors, spacing } from "@/theme";
import type { ProductReturnRequest, ProductReturnRequestStatus } from "@/types/product";
import { canReviewProductReturns } from "@/utils/permissions";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/utils/format";

const filters = ["All", "Pending", "Approved", "Rejected"] as const;
type ReturnFilter = (typeof filters)[number];

function requesterName(request: ProductReturnRequest) {
  if (!request.requestedBy) return "Employee";
  return [request.requestedBy.firstName, request.requestedBy.lastName].filter(Boolean).join(" ") || request.requestedBy.username;
}

function sellerName(request: ProductReturnRequest) {
  if (!request.originalSeller) return requesterName(request);
  return [request.originalSeller.firstName, request.originalSeller.lastName].filter(Boolean).join(" ") || request.originalSeller.username;
}

function customerName(request: ProductReturnRequest) {
  if (!request.customer) return "Walk-in Customer";
  return request.customer.companyName || [request.customer.firstName, request.customer.lastName].filter(Boolean).join(" ") || request.customer.phone || "Customer";
}

function compactDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString();
}

function filterToStatus(filter: ReturnFilter): ProductReturnRequestStatus | undefined {
  if (filter === "All") return undefined;
  return filter.toUpperCase() as ProductReturnRequestStatus;
}

export function ReturnedProductsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const canReviewReturns = canReviewProductReturns(user);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReturnFilter>("Pending");
  const [requests, setRequests] = useState<ProductReturnRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(false);
    try {
      const response = await productsService.returnRequests({
        status: filterToStatus(filter),
        limit: 100
      });
      setRequests(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const visibleRequests = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return requests;
    return requests.filter((request) =>
      [
        request.product?.name,
        request.product?.sku,
        request.product?.barcode,
        request.referenceNumber,
        request.remarks,
        request.sale?.saleNumber,
        customerName(request),
        requesterName(request),
        sellerName(request)
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [query, requests]);

  const refresh = () => {
    setRefreshing(true);
    void load(false);
  };

  const decideRequest = (request: ProductReturnRequest, approved: boolean) => {
    Alert.alert(
      approved ? "Approve return?" : "Reject return?",
      `${request.product?.name ?? "Product"} return from ${customerName(request)}. Seller: ${sellerName(request)}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: approved ? "Approve" : "Reject",
          style: approved ? "default" : "destructive",
          onPress: async () => {
            setProcessingId(request.id);
            try {
              if (approved) await productsService.approveReturnRequest(request.id);
              else await productsService.rejectReturnRequest(request.id);
              await load(false);
            } catch (decisionError) {
              const message = decisionError instanceof Error ? decisionError.message : "Unable to update return request.";
              Alert.alert("Return request failed", message);
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Returned Products" onBack={() => navigation.goBack()} />
        <LoadingState label="Loading returned products" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Returned Products" onBack={() => navigation.goBack()} />
        <ErrorState onRetry={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Returned Products" onBack={() => navigation.goBack()} />
      <FlatList
        data={visibleRequests}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search returned products" />
            <View style={styles.filters}>
              {filters.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => setFilter(chip)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter ${chip} returns`}
                >
                  <Text style={[styles.chip, filter === chip && styles.chipActive]}>{chip}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.icon}>
              <RotateCcw size={17} color={colors.primary} />
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>{item.product?.name ?? "Product"}</Text>
                <Badge label={item.status.toLowerCase()} variant={statusVariant(item.status.toLowerCase())} />
              </View>
              <Text style={styles.meta}>Qty {item.quantity} | {customerName(item)} | {compactDate(item.requestedAt)}</Text>
              <Text style={styles.meta}>Seller {sellerName(item)} | Initiated by {requesterName(item)}</Text>
              <Text style={styles.meta}>Sale {item.sale?.saleNumber ?? item.referenceNumber ?? "--"} | Sold {compactDate(item.sale?.saleDate)}</Text>
              {item.creditSale ? <Text style={styles.meta}>Credit balance {formatCurrency(Number(item.creditSale.balance))}</Text> : null}
              {item.unitCost !== null && item.unitCost !== undefined ? <Text style={styles.meta}>Unit cost {formatCurrency(Number(item.unitCost))}</Text> : null}
              {item.remarks ? <Text style={styles.meta} numberOfLines={2}>{item.remarks}</Text> : null}
            </View>
            {canReviewReturns && item.status === "PENDING" ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => decideRequest(item, true)}
                  disabled={processingId === item.id}
                  style={[styles.actionButton, styles.approveButton, processingId === item.id && styles.disabledAction]}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve return for ${item.product?.name ?? "product"}`}
                >
                  <Check size={15} color={colors.successDark} />
                </Pressable>
                <Pressable
                  onPress={() => decideRequest(item, false)}
                  disabled={processingId === item.id}
                  style={[styles.actionButton, styles.rejectButton, processingId === item.id && styles.disabledAction]}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject return for ${item.product?.name ?? "product"}`}
                >
                  <X size={15} color={colors.error} />
                </Pressable>
              </View>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No returned products found" />}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
        showsVerticalScrollIndicator
        persistentScrollbar
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenHorizontal, gap: 10 },
  headerContent: { gap: 12, marginBottom: 2 },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { color: colors.primary, backgroundColor: colors.secondaryBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontSize: 11, fontWeight: "700" },
  chipActive: { color: colors.surface, backgroundColor: colors.primary },
  card: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, textTransform: "capitalize" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  approveButton: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  rejectButton: { backgroundColor: colors.errorBg, borderColor: colors.errorBorder },
  disabledAction: { opacity: 0.55 }
});
