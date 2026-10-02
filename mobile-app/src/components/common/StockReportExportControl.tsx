import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import { Printer } from "lucide-react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "@stackline/xlsx";
import { colors } from "@/theme";

export interface StockReportLine {
  name: string;
  sku?: string | null;
  quantity: number;
  buyingPrice: number;
  sellingPrice: number;
}

interface Props {
  title: string;
  businessName: string;
  branchName?: string | null;
  subjectLabel?: string;
  subjectName?: string;
  loadItems: () => Promise<StockReportLine[]>;
  accessibilityLabel: string;
}

const DEFAULT_ROWS_PER_PAGE = 25;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function createPageGroups(items: StockReportLine[], pageCount: number) {
  const groups: StockReportLine[][] = [];
  let offset = 0;
  for (let page = 0; page < pageCount; page += 1) {
    const remainingItems = items.length - offset;
    const remainingPages = pageCount - page;
    const groupSize = Math.ceil(remainingItems / remainingPages);
    groups.push(items.slice(offset, offset + groupSize));
    offset += groupSize;
  }
  return groups;
}

function buildStockReportHtml({ title, businessName, branchName, subjectLabel, subjectName, items, pageCount }: {
  title: string;
  businessName: string;
  branchName?: string | null;
  subjectLabel?: string;
  subjectName?: string;
  items: StockReportLine[];
  pageCount: number;
}) {
  const generatedAt = new Date().toLocaleString();
  const pages = createPageGroups(items, pageCount);
  let rowNumber = 0;
  const pageHtml = pages.map((pageItems, pageIndex) => {
    const rows = pageItems.map((item) => {
      rowNumber += 1;
      const buying = Number(item.buyingPrice) || 0;
      const selling = Number(item.sellingPrice) || 0;
      const quantity = Number(item.quantity) || 0;
      const sku = item.sku ? `<small>${escapeHtml(item.sku)}</small>` : "";
      return `<tr><td class="number">${rowNumber}</td><td class="item">${escapeHtml(item.name)}${sku}</td><td class="number">${quantity}</td><td class="money">${money(buying)}</td><td class="money">${money(selling)}</td><td class="money">${money(buying * quantity)}</td></tr>`;
    }).join("");

    return `<section class="page">
      <header class="report-header">
        <div><h1>${escapeHtml(title)}</h1><p><strong>Pages:</strong> ${String(pageCount).padStart(2, "0")} &nbsp; <strong>Paper Size:</strong> Letter</p></div>
        <div class="metadata"><p><strong>Generated On:</strong> ${escapeHtml(generatedAt)}</p><p><strong>Business:</strong> ${escapeHtml(businessName || "Business")}</p><p><strong>Branch:</strong> ${escapeHtml(branchName || "Main Branch")}</p>${subjectName ? `<p><strong>${escapeHtml(subjectLabel || "Employee")}:</strong> ${escapeHtml(subjectName)}</p>` : ""}</div>
      </header>
      <div class="section-title">${escapeHtml(title.toUpperCase())}</div>
      <table><thead><tr><th>No.</th><th>Item Name</th><th>Qty</th><th>Buying Price</th><th>Selling Price</th><th>Total Value</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">No stock items available</td></tr>'}</tbody></table>
      <footer>Page ${pageIndex + 1} of ${pageCount}</footer>
    </section>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: letter portrait; margin: 0.32in; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .page { position: relative; min-height: 10.35in; page-break-after: always; padding-bottom: 0.34in; }
    .page:last-child { page-break-after: auto; }
    .report-header { min-height: 0.92in; display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #222; padding: 0 2px 10px; margin-bottom: 12px; }
    h1 { margin: 0 0 10px; font-size: 21px; }
    .report-header p { margin: 3px 0; font-size: 10px; }
    .metadata { min-width: 2.7in; padding-top: 2px; }
    .section-title { background: #dce7f5; text-align: center; font-weight: 700; font-size: 13px; padding: 7px; border: 1px solid #222; border-bottom: 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
    th, td { border: 1px solid #222; padding: 5px 6px; vertical-align: middle; }
    th { background: #e8eef7; font-size: 9px; text-align: center; }
    th:nth-child(1) { width: 7%; } th:nth-child(2) { width: 33%; } th:nth-child(3) { width: 10%; } th:nth-child(4), th:nth-child(5), th:nth-child(6) { width: 16.66%; }
    td.number { text-align: center; } td.money { text-align: right; white-space: nowrap; } td.item { overflow-wrap: anywhere; }
    small { display: block; margin-top: 2px; color: #555; font-size: 7px; }
    .empty { text-align: center; padding: 18px; }
    footer { position: absolute; bottom: 0; right: 2px; font-size: 9px; }
  </style></head><body>${pageHtml}</body></html>`;
}

function buildStockWorkbook({ title, businessName, branchName, subjectLabel, subjectName, items, pageCount }: {
  title: string;
  businessName: string;
  branchName?: string | null;
  subjectLabel?: string;
  subjectName?: string;
  items: StockReportLine[];
  pageCount: number;
}) {
  const generatedAt = new Date().toLocaleString();
  const rows: Array<Array<string | number>> = [
    [title],
    [`Pages: ${String(pageCount).padStart(2, "0")}`, "", "Paper Size: Letter"],
    ["Generated On:", generatedAt, "", "Business:", businessName || "Business"],
    ["Branch:", branchName || "Main Branch", "", ...(subjectName ? [subjectLabel || "Employee", subjectName] : [])],
    [],
  ];
  const sectionRow = rows.length;
  rows.push([title.toUpperCase()]);
  const columnHeaderRow = rows.length;
  rows.push(["No.", "Item Name", "Qty", "Buying Price", "Selling Price", "Total Value"]);
  items.forEach((item, index) => {
    rows.push([
      index + 1,
      item.sku ? `${item.name} (${item.sku})` : item.name,
      Number(item.quantity) || 0,
      Number(item.buyingPrice) || 0,
      Number(item.sellingPrice) || 0,
      (Number(item.quantity) || 0) * (Number(item.buyingPrice) || 0),
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 7 }, { wch: 38 }, { wch: 10 }, { wch: 17 }, { wch: 17 }, { wch: 18 }];
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: sectionRow, c: 0 }, e: { r: sectionRow, c: 5 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } },
    { s: { r: 2, c: 4 }, e: { r: 2, c: 5 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
    ...(subjectName ? [{ s: { r: 3, c: 4 }, e: { r: 3, c: 5 } }] : []),
  ];
  worksheet["!margins"] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  worksheet["!autofilter"] = { ref: `A${columnHeaderRow + 1}:F${columnHeaderRow + Math.max(items.length, 1) + 1}` };
  for (let row = columnHeaderRow + 1; row <= columnHeaderRow + items.length; row += 1) {
    for (const column of [3, 4, 5]) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = "#,##0.00";
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Report");
  return workbook;
}

export function StockReportExportControl({ title, businessName, branchName, subjectLabel, subjectName, loadItems, accessibilityLabel }: Props) {
  const [loading, setLoading] = useState(false);

  const exportReport = async (format: "pdf" | "excel") => {
    setLoading(true);
    try {
      const items = await loadItems();
      const pageCount = Math.max(1, Math.ceil(items.length / DEFAULT_ROWS_PER_PAGE));
      if (format === "pdf") {
        const html = buildStockReportHtml({ title, businessName, branchName, subjectLabel, subjectName, items, pageCount });
        await Print.printAsync({ html });
        return;
      }

      const safeName = title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stock-report";
      const fileName = `${safeName}-${Date.now()}.xlsx`;
      const base64 = XLSX.write(
        buildStockWorkbook({ title, businessName, branchName, subjectLabel, subjectName, items, pageCount }),
        { type: "base64", bookType: "xlsx" },
      );

      if (Platform.OS === "android") {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        Alert.alert("Excel downloaded", "The stock report was saved to the folder you selected.");
        return;
      }

      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("File storage is unavailable on this device.");
      if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
      const fileUri = `${cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(fileUri, {
        dialogTitle: `Export ${title} to Excel`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unable to export the stock report as ${format === "pdf" ? "PDF" : "Excel"}.`;
      Alert.alert("Stock export failed", message);
    } finally {
      setLoading(false);
    }
  };

  const showExportOptions = () => Alert.alert("Export stock", "Choose how you want to download the stock report.", [
    { text: "Cancel", style: "cancel" },
    { text: "Download PDF", onPress: () => void exportReport("pdf") },
    { text: "Download Excel", onPress: () => void exportReport("excel") },
  ]);

  return (
    <Pressable onPress={showExportOptions} disabled={loading} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Printer size={19} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
});
