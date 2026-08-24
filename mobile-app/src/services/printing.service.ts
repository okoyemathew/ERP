import { Alert } from "react-native";
import type { ReceiptDocument } from "@/types/domain.types";
import { formatCurrency } from "@/utils/format";

const lineWidth = 32;
const divider = "-".repeat(lineWidth);

const center = (text: string) => {
  const trimmed = text.slice(0, lineWidth);
  const pad = Math.max(0, Math.floor((lineWidth - trimmed.length) / 2));
  return `${" ".repeat(pad)}${trimmed}`;
};

const row = (left: string, right: string) => {
  const cleanLeft = left.slice(0, lineWidth - 1);
  const cleanRight = right.slice(0, lineWidth - 1);
  const spaces = Math.max(1, lineWidth - cleanLeft.length - cleanRight.length);
  return `${cleanLeft}${" ".repeat(spaces)}${cleanRight}`;
};

export const printingService = {
  buildReceiptText(receipt: ReceiptDocument) {
    const lines = [
      center("NexPOS Store"),
      center(receipt.title),
      divider,
      row("Receipt", receipt.id),
      row("Order", receipt.orderNumber),
      row("Customer", receipt.customerName),
      ...(receipt.employeeName ? [row("Employee", receipt.employeeName)] : []),
      row("Method", receipt.method.toUpperCase()),
      divider,
      ...receipt.items.flatMap((item) => [item.name, row(`${item.qty} x ${formatCurrency(item.price)}`, formatCurrency(item.qty * item.price))]),
      divider,
      row("Subtotal", formatCurrency(receipt.subtotal)),
      row("Tax", formatCurrency(receipt.tax)),
      row("Total", formatCurrency(receipt.total)),
      row("Paid", formatCurrency(receipt.paid)),
      row("Balance", formatCurrency(receipt.balance)),
      divider,
      center("Thank you")
    ];

    return lines.join("\n");
  },

  async print(receipt: ReceiptDocument) {
    const text = this.buildReceiptText(receipt);
    Alert.alert("Receipt ready", text);
    return { ok: true, text };
  },

  async printText(text: string) {
    Alert.alert("Receipt ready", text);
    return { ok: true, text };
  }
};
