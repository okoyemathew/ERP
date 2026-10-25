import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Archive, FileDown, Printer, Search, Send } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet, Button, Card, EmptyState, ErrorState, LoadingState, SearchBar } from "@/components/common";
import { SimpleRow, ListScreen } from "@/screens/shared/ScreenKit";
import { goodsDisbursementService } from "@/services/goods-disbursement.service";
import { printingService } from "@/services/printing.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiGoodsDisbursement } from "@/types/goodsDisbursement";
import { formatCurrency } from "@/utils/format";
import {
  buildDisbursementInvoiceText,
  disbursementEmployeeName,
  itemUnitPrice,
} from "@/utils/disbursementInvoice";

function matchesSearch(disbursement: ApiGoodsDisbursement, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const employeeName = disbursementEmployeeName(disbursement);
  const values: Array<string | number | null | undefined> = [
    disbursement.disbursementNumber,
    disbursement.destination,
    disbursement.remarks,
    employeeName,
    disbursement.employee?.employeeCode,
    disbursement.employee?.user?.username,
    ...disbursement.items.flatMap((item) => [
      item.product?.name,
      item.product?.sku,
      item.product?.barcode,
      item.productId,
      item.quantity
    ])
  ];

  return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

export function DisbursedScreen() {
  const insets = useSafeAreaInsets();
  const business = useAuthStore((state) => state.business);
  const [items, setItems] = useState<ApiGoodsDisbursement[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ApiGoodsDisbursement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await goodsDisbursementService.list({
        limit: 50,
        search: query.trim() || undefined
      });
      setItems(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const openDetails = (item: ApiGoodsDisbursement) => {
    setSelected(item);
  };

  const closeDetails = () => {
    setSelected(null);
  };

  const selectedInvoice = () => {
    if (!selected) return null;
    const title = `Disbursement ${selected.disbursementNumber}`;
    return {
      title,
      text: buildDisbursementInvoiceText(selected, {}, business?.name)
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
  const visibleItems = useMemo(
    () => items.filter((item) => matchesSearch(item, query)),
    [items, query]
  );

  return (
    <>
      <ListScreen
        title="Disbursed"
        ListHeaderComponent={<SearchBar value={query} onChangeText={setQuery} placeholder="Search disbursements" />}
        data={loading || error ? [] : visibleItems}
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
            onPress={() => openDetails(item)}
          />
        )}
      />

      {selected ? (
        <AppBottomSheet snapPoints={["84%"]} initialIndex={0} onClose={closeDetails}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Disbursement Details</Text>
            <BottomSheetScrollView
              style={styles.sheetScroller}
              contentContainerStyle={styles.sheetScroll}
              showsVerticalScrollIndicator
              persistentScrollbar
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {selected.items.map((item) => {
                const quantity = item.quantity;
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
});
