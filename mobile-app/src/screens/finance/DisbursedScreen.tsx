import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Archive, FileDown, Printer, Search, Send } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet, Button, Card, EmptyState, ErrorState, LoadingState } from "@/components/common";
import { SimpleRow, ListScreen } from "@/screens/shared/ScreenKit";
import { goodsDisbursementService } from "@/services/goods-disbursement.service";
import { printingService } from "@/services/printing.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiGoodsDisbursement, ApiGoodsDisbursementItem } from "@/types/goodsDisbursement";
import { formatCurrency } from "@/utils/format";

const invoiceLineWidth = 36;
const invoiceDivider = "-".repeat(invoiceLineWidth);

const invoiceCenter = (text: string) => {
  const trimmed = text.slice(0, invoiceLineWidth);
  const pad = Math.max(0, Math.floor((invoiceLineWidth - trimmed.length) / 2));
  return `${" ".repeat(pad)}${trimmed}`;
};

const invoiceRow = (left: string, right: string) => {
  const cleanLeft = left.slice(0, invoiceLineWidth - 1);
  const cleanRight = right.slice(0, invoiceLineWidth - 1);
  const spaces = Math.max(1, invoiceLineWidth - cleanLeft.length - cleanRight.length);
  return `${cleanLeft}${" ".repeat(spaces)}${cleanRight}`;
};

function disbursementEmployeeName(disbursement: ApiGoodsDisbursement) {
  const employee = disbursement.employee;
  if (!employee) return undefined;
  return `${employee.firstName} ${employee.lastName}`.trim() || employee.user?.username || employee.employeeCode;
}

function itemUnitPrice(item: ApiGoodsDisbursementItem) {
  return Number(item.product?.sellingPrice ?? 0);
}

function visibleQuantity(item: ApiGoodsDisbursementItem, quantities: Record<string, string>) {
  const quantity = Number.parseInt(quantities[item.id] ?? String(item.quantity), 10);
  return Number.isFinite(quantity) ? quantity : 0;
}

function buildDisbursementInvoiceText(disbursement: ApiGoodsDisbursement, quantities: Record<string, string>, businessName?: string | null) {
  const employeeName = disbursementEmployeeName(disbursement);
  const rows = disbursement.items.map((item) => {
    const quantity = visibleQuantity(item, quantities);
    const unitPrice = itemUnitPrice(item);
    return {
      name: item.product?.name ?? "Product",
      code: item.product?.sku ?? item.product?.barcode ?? item.productId.slice(0, 8),
      quantity,
      unitPrice,
      total: quantity * unitPrice
    };
  });
  const totalQuantity = rows.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = rows.reduce((sum, item) => sum + item.total, 0);

  return [
    invoiceCenter(businessName ?? "Business"),
    invoiceCenter("Disbursement Invoice"),
    invoiceDivider,
    invoiceRow("Invoice", disbursement.disbursementNumber),
    invoiceRow("Date", new Date(disbursement.disbursementDate).toLocaleDateString()),
    invoiceRow("Destination", disbursement.destination ?? employeeName ?? "No destination"),
    ...(employeeName ? [invoiceRow("Employee", employeeName)] : []),
    invoiceDivider,
    ...rows.flatMap((item) => [
      item.name,
      item.code,
      invoiceRow(`${item.quantity} x ${formatCurrency(item.unitPrice)}`, formatCurrency(item.total))
    ]),
    invoiceDivider,
    invoiceRow("Total Qty", String(totalQuantity)),
    invoiceRow("Total Value", formatCurrency(totalValue)),
    ...(disbursement.remarks ? [invoiceDivider, disbursement.remarks] : [])
  ].join("\n");
}

export function DisbursedScreen() {
  const insets = useSafeAreaInsets();
  const business = useAuthStore((state) => state.business);
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

  const selectedInvoice = () => {
    if (!selected) return null;
    const title = `Disbursement ${selected.disbursementNumber}`;
    return {
      title,
      text: buildDisbursementInvoiceText(selected, quantities, business?.name)
    };
  };

  const printInvoice = async () => {
    const invoice = selectedInvoice();
    if (!invoice) return;
    try {
      await printingService.printText(invoice.text, invoice.title);
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print disbursement invoice.";
      Alert.alert("Print failed", message);
    }
  };

  const saveInvoicePdf = async () => {
    const invoice = selectedInvoice();
    if (!invoice) return;
    try {
      await printingService.saveTextPdf(invoice.text, invoice.title);
    } catch (pdfError) {
      const message = pdfError instanceof Error ? pdfError.message : "Unable to save disbursement invoice PDF.";
      Alert.alert("PDF failed", message);
    }
  };

  const shareInvoiceWhatsApp = async () => {
    const invoice = selectedInvoice();
    if (!invoice) return;
    try {
      await printingService.shareTextPdfToWhatsApp(invoice.text, invoice.title);
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : "Unable to share disbursement invoice.";
      Alert.alert("Share failed", message);
    }
  };

  const sheetBottomPadding = Math.max(insets.bottom, 24) + 48;

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
            <BottomSheetScrollView
              style={styles.sheetScroller}
              contentContainerStyle={styles.sheetScroll}
              showsVerticalScrollIndicator
              persistentScrollbar
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {selected.items.map((item) => {
                const quantity = visibleQuantity(item, quantities);
                const unitPrice = itemUnitPrice(item);
                const totalValue = quantity * unitPrice;
                return (
                  <Card key={item.id} style={styles.itemCard}>
                    <View style={styles.itemHead}>
                      <View style={styles.icon}>
                        <Archive size={16} color={colors.primary} />
                      </View>
                      <View style={styles.itemBody}>
                        <Text style={styles.itemTitle}>{item.product?.name ?? "Product"}</Text>
                        <Text style={styles.itemMeta}>{item.product?.sku ?? item.product?.barcode ?? item.productId.slice(0, 8)}</Text>
                        <Text style={styles.itemMeta}>Qty {quantity} x {formatCurrency(unitPrice)} = {formatCurrency(totalValue)}</Text>
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
                );
              })}
            </BottomSheetScrollView>
            <View style={[styles.sheetFooter, { paddingBottom: sheetBottomPadding }]}>
              <View style={styles.invoiceActions}>
                <Button label="Print Invoice" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printInvoice()} style={styles.invoiceButton} />
                <Button label="PDF" variant="ghost" icon={<FileDown size={16} color={colors.primary} />} onPress={() => void saveInvoicePdf()} style={styles.invoiceButton} />
                <Button label="WhatsApp" variant="ghost" icon={<Send size={16} color={colors.primary} />} onPress={() => void shareInvoiceWhatsApp()} style={styles.invoiceButton} />
              </View>
              <Button label="Save Changes" loading={saving} onPress={() => void saveEdit()} />
            </View>
          </View>
        </AppBottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingTop: 16, paddingHorizontal: 16, gap: 12 },
  sheetScroller: { flex: 1 },
  sheetFooter: { paddingTop: 2, gap: 10 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  sheetScroll: { gap: 12, paddingBottom: spacing.sectionGap },
  invoiceActions: { flexDirection: "row", gap: 8 },
  invoiceButton: { flex: 1, minHeight: 44 },
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
