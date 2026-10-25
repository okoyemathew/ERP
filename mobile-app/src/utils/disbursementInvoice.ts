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

export function disbursementEmployeeName(disbursement: ApiGoodsDisbursement) {
  const employee = disbursement.employee;
  if (!employee) return undefined;
  return `${employee.firstName} ${employee.lastName}`.trim() || employee.user?.username || employee.employeeCode;
}

export function itemUnitPrice(item: ApiGoodsDisbursementItem) {
  return Number(item.product?.purchasePrice ?? 0);
}

export function visibleQuantity(item: ApiGoodsDisbursementItem, quantities: Record<string, string>) {
  const quantity = Number.parseInt(quantities[item.id] ?? String(item.quantity), 10);
  return Number.isFinite(quantity) ? quantity : 0;
}

export function buildDisbursementInvoiceText(
  disbursement: ApiGoodsDisbursement,
  quantities: Record<string, string> = {},
  businessName?: string | null,
) {
  const employeeName = disbursementEmployeeName(disbursement);
  const rows = disbursement.items.map((item) => {
    const quantity = visibleQuantity(item, quantities);
    const unitPrice = itemUnitPrice(item);
    return {
      name: item.product?.name ?? "Product",
      code: item.product?.sku ?? item.product?.barcode ?? item.productId.slice(0, 8),
      quantity,
      unitPrice,
      total: quantity * unitPrice,
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
      invoiceRow(`${item.quantity} x ${formatCurrency(item.unitPrice)}`, formatCurrency(item.total)),
    ]),
    invoiceDivider,
    invoiceRow("Total Qty", String(totalQuantity)),
    invoiceRow("Total Value", formatCurrency(totalValue)),
    ...(disbursement.remarks ? [invoiceDivider, disbursement.remarks] : []),
  ].join("\n");
}
