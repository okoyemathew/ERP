import { Alert, Platform, Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildPdfHtml = (text: string, title = "Receipt") => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: auto;
        margin: 6mm;
      }
      * { box-sizing: border-box; }
      html {
        width: 100%;
      }
      body {
        width: 100%;
        max-width: 100%;
        margin: 0;
        color: #111827;
        background: #ffffff;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      pre {
        display: block;
        width: 100%;
        max-width: 100%;
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        font-size: 10pt;
        line-height: 1.35;
      }
      @media screen and (max-width: 420px) {
        pre {
          font-size: 9pt;
          line-height: 1.3;
        }
      }
    </style>
  </head>
  <body>
    <pre>${escapeHtml(text)}</pre>
  </body>
</html>`;

export const printingService = {
  buildReceiptText(receipt: ReceiptDocument) {
    const lines = [
      center(receipt.businessName ?? "EST JP MOTORS"),
      center(receipt.title),
      divider,
      row("Receipt", receipt.id),
      row("Order", receipt.orderNumber),
      row("Date", new Date(receipt.createdAt).toLocaleDateString()),
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
      ...(receipt.paymentLines?.length
        ? [
            divider,
            "Payments",
            ...receipt.paymentLines.map((payment) =>
              row(
                new Date(payment.date).toLocaleDateString(),
                formatCurrency(payment.amount),
              ),
            ),
          ]
        : []),
      divider,
      center("Thank you")
    ];

    return lines.join("\n");
  },

  async print(receipt: ReceiptDocument) {
    const text = this.buildReceiptText(receipt);
    return this.printText(text, receipt.title);
  },

  async createPdf(receipt: ReceiptDocument) {
    const text = this.buildReceiptText(receipt);
    const file = await Print.printToFileAsync({
      html: buildPdfHtml(text, receipt.title)
    });
    return { ...file, text };
  },

  async savePdf(receipt: ReceiptDocument) {
    const file = await this.createPdf(receipt);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        dialogTitle: "Save or open PDF",
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf"
      });
      return { ok: true, uri: file.uri, text: file.text };
    }

    await Share.share(
      {
        title: receipt.title,
        message: file.text
      },
      Platform.OS === "android"
        ? {
            dialogTitle: "Save or share receipt"
          }
        : undefined
    );
    return { ok: true, uri: file.uri, text: file.text };
  },

  async sharePdfToWhatsApp(receipt: ReceiptDocument) {
    const file = await this.createPdf(receipt);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        dialogTitle: "Share to WhatsApp",
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf"
      });
      return { ok: true, uri: file.uri, text: file.text };
    }

    await Share.share(
      {
        title: receipt.title,
        message: file.text
      },
      Platform.OS === "android"
        ? {
            dialogTitle: "Share to WhatsApp"
          }
        : undefined
    );
    return { ok: true, uri: file.uri, text: file.text };
  },

  async printText(text: string, title = "Receipt") {
    const html = buildPdfHtml(text, title);

    try {
      await Print.printAsync({ html });
      return { ok: true, text };
    } catch {
      try {
        const file = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            dialogTitle: "Share PDF",
            mimeType: "application/pdf",
            UTI: "com.adobe.pdf"
          });
          return { ok: true, text, uri: file.uri };
        }
      } catch {
        // Fall back to the old text share path below.
      }

      try {
        const result = await Share.share(
          {
            title,
            message: text
          },
          Platform.OS === "android"
            ? {
                dialogTitle: title
              }
            : undefined
        );

        return {
          ok: result.action !== Share.dismissedAction,
          text
        };
      } catch {
        Alert.alert("Receipt ready", text);
        return { ok: false, text };
      }
    }
  }
};
