import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { Archive, Search } from "lucide-react-native";
import { AppBottomSheet, Button, Card, EmptyState, ErrorState, LoadingState } from "@/components/common";
import { SimpleRow, ListScreen } from "@/screens/shared/ScreenKit";
import { goodsDisbursementService } from "@/services/goods-disbursement.service";
import { colors, spacing } from "@/theme";
import type { ApiGoodsDisbursement } from "@/types/goodsDisbursement";

export function DisbursedScreen() {
  const [items, setItems] = useState<ApiGoodsDisbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ApiGoodsDisbursement | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await goodsDisbursementService.list({ limit: 50 });
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

  const openEdit = (item: ApiGoodsDisbursement) => {
    setSelected(item);
    setQuantities(Object.fromEntries(item.items.map((row) => [row.id, String(row.quantity)])));
  };

  const closeEdit = () => {
    if (saving) return;
    setSelected(null);
    setQuantities({});
  };

  const saveEdit = async () => {
    if (!selected || saving) return;

    const nextItems = selected.items.map((item) => {
      const quantity = Number.parseInt(quantities[item.id] ?? String(item.quantity), 10);
      return { source: item, quantity };
    });

    if (nextItems.some((item) => !Number.isFinite(item.quantity) || item.quantity < 1)) {
      Alert.alert("Invalid quantity", "Each supplied product quantity must be at least 1.");
      return;
    }

    setSaving(true);
    try {
      const updated = await goodsDisbursementService.update(selected.id, {
        employeeId: selected.employeeId ?? undefined,
        disbursementDate: selected.disbursementDate,
        destination: selected.destination ?? undefined,
        remarks: selected.remarks ?? undefined,
        items: nextItems.map(({ source, quantity }) => ({
          productId: source.productId,
          quantity,
          remarks: source.remarks ?? undefined
        }))
      });
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected(null);
      setQuantities({});
      Alert.alert("Disbursement updated", "Supplied products were updated.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to update disbursement.";
      Alert.alert("Update failed", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ListScreen
        title="Disbursed"
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        empty={
          loading ? (
            <LoadingState label="Loading disbursements" />
          ) : error ? (
            <ErrorState onRetry={() => void load()} />
          ) : (
            <EmptyState icon={<Search size={28} color={colors.textPlaceholder} />} title="No disbursements found" />
          )
        }
        renderItem={({ item }) => (
          <SimpleRow
            title={item.disbursementNumber}
            subtitle={`${item.destination ?? "No destination"} | ${new Date(item.disbursementDate).toLocaleDateString()}`}
            amount={`${item.items.reduce((sum, row) => sum + row.quantity, 0)} items`}
            icon={<Archive size={17} color={colors.primary} />}
            onPress={() => openEdit(item)}
          />
        )}
      />

      {selected ? (
        <AppBottomSheet snapPoints={["84%"]} initialIndex={0} onClose={closeEdit}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit Disbursement</Text>
            <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator>
              {selected.items.map((item) => (
                <Card key={item.id} style={styles.itemCard}>
                  <View style={styles.itemHead}>
                    <View style={styles.icon}>
                      <Archive size={16} color={colors.primary} />
                    </View>
                    <View style={styles.itemBody}>
                      <Text style={styles.itemTitle}>{item.product?.name ?? "Product"}</Text>
                      <Text style={styles.itemMeta}>{item.product?.sku ?? item.product?.barcode ?? item.productId.slice(0, 8)}</Text>
                    </View>
                  </View>
                  <TextInput
                    value={quantities[item.id] ?? String(item.quantity)}
                    onChangeText={(value) => {
                      if (value && !/^\d+$/.test(value)) {
                        Alert.alert("Quantity", "Enter a valid quantity.");
                        return;
                      }
                      setQuantities((current) => ({ ...current, [item.id]: value }));
                    }}
                    keyboardType="number-pad"
                    style={styles.quantityInput}
                    accessibilityLabel={`Quantity for ${item.product?.name ?? "product"}`}
                  />
                </Card>
              ))}
            </ScrollView>
            <Button label="Save Changes" loading={saving} onPress={() => void saveEdit()} />
          </View>
        </AppBottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: 16, gap: 12 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  sheetScroll: { gap: 12, paddingBottom: spacing.sectionGap },
  itemCard: { gap: 10 },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  itemBody: { flex: 1 },
  itemTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "900" },
  itemMeta: { color: colors.textPlaceholder, fontSize: 10, marginTop: 3 },
  quantityInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.foreground,
    backgroundColor: colors.inputBg
  }
});
