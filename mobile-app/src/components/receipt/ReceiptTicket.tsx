import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import Svg, { Path } from "react-native-svg";
import type { ReceiptDocument, SaleItem } from "@/types/domain.types";
import { colors, typography } from "@/theme";
import { formatCurrency } from "@/utils/format";

const zigzagPath = (width: number) => {
  const notchWidth = 12;
  const notchHeight = 6;
  let path = "M0 6";
  for (let x = 0; x < width; x += notchWidth) {
    path += ` L${x + notchWidth / 2} 0 L${x + notchWidth} 6`;
  }
  return `${path} L${width} 6 L${width} 8 L0 8 Z`;
};

type ReceiptTicketProps = {
  receipt?: ReceiptDocument;
  receiptId?: string;
  items?: SaleItem[];
  method?: string;
};

export function ReceiptTicket({ receipt, receiptId, items = [], method = "cash" }: ReceiptTicketProps) {
  const subtotal = receipt?.subtotal ?? items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const tax = receipt?.tax ?? subtotal * 0.08;
  const total = receipt?.total ?? subtotal + tax;
  const paid = receipt?.paid ?? total;
  const balance = receipt?.balance ?? 0;
  const ticketItems = receipt?.items ?? items;
  const ticketMethod = receipt?.method ?? method;
  return (
    <View style={styles.wrap}>
      <Svg height={8} width="100%" viewBox="0 0 320 8">
        <Path d={zigzagPath(320)} fill={colors.surface} />
      </Svg>
      <View style={styles.ticket}>
        <Text style={styles.store}>NexPOS Store</Text>
        <Text style={styles.address}>{receipt?.title ?? "Sales Receipt"}</Text>
        <View style={styles.dashed} />
        <View style={styles.meta}>
          <Text style={styles.caption}>Receipt #</Text>
          <Text style={styles.value}>{receipt?.id ?? receiptId}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.caption}>Customer</Text>
          <Text style={styles.value}>{receipt?.customerName ?? "Walk-in Customer"}</Text>
        </View>
        {receipt?.employeeName ? (
          <View style={styles.meta}>
            <Text style={styles.caption}>Employee</Text>
            <Text style={styles.value}>{receipt.employeeName}</Text>
          </View>
        ) : null}
        {ticketItems.map((item) => (
          <View key={`${item.productId}-${item.name}`} style={styles.row}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.caption}>
              {item.qty} x {formatCurrency(item.price)}
            </Text>
            <Text style={styles.itemTotal}>{formatCurrency(item.qty * item.price)}</Text>
          </View>
        ))}
        <View style={styles.dashed} />
        <View style={styles.totalRow}>
          <Text style={styles.caption}>Subtotal</Text>
          <Text style={styles.value}>{formatCurrency(subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.caption}>Tax</Text>
          <Text style={styles.value}>{formatCurrency(tax)}</Text>
        </View>
        <View style={styles.highlight}>
          <Text style={styles.highlightText}>Total</Text>
          <Text style={styles.highlightText}>{formatCurrency(total)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.caption}>Paid</Text>
          <Text style={styles.value}>{formatCurrency(paid)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.caption}>Balance</Text>
          <Text style={styles.value}>{formatCurrency(balance)}</Text>
        </View>
        <View style={[styles.method, ticketMethod === "credit" && styles.credit]}>
          <Text style={[styles.methodText, ticketMethod === "credit" && styles.creditText]}>{ticketMethod}</Text>
        </View>
        {receipt?.printed ? <Text style={styles.printed}>Printed</Text> : null}
        <View style={styles.barcode}>
          {Array.from({ length: 28 }).map((_, i) => (
            <View key={i} style={[styles.bar, { height: 24 + ((i * 7) % 28), width: i % 3 === 0 ? 3 : 1 }]} />
          ))}
        </View>
      </View>
      <Svg height={8} width="100%" viewBox="0 0 320 8">
        <Path d={zigzagPath(320)} fill={colors.surface} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    margin: 16
  },
  ticket: {
    backgroundColor: colors.surface,
    padding: 18
  },
  store: {
    ...typography.cardTitle,
    textAlign: "center",
    color: colors.foreground,
    fontWeight: "800"
  },
  address: {
    ...typography.caption,
    textAlign: "center",
    color: colors.textMuted,
    marginTop: 3
  },
  dashed: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderLight,
    marginVertical: 14
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6
  },
  row: {
    paddingVertical: 8
  },
  itemName: {
    ...typography.subtitle,
    color: colors.textSecondary
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted
  },
  value: {
    ...typography.caption,
    color: colors.foreground,
    fontWeight: "700"
  },
  itemTotal: {
    ...typography.subtitle,
    color: colors.foreground,
    alignSelf: "flex-end"
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  highlight: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.secondaryBg,
    borderRadius: 12,
    padding: 12
  },
  highlightText: {
    ...typography.subtitle,
    color: colors.primary,
    fontWeight: "800"
  },
  method: {
    marginTop: 12,
    backgroundColor: colors.successBg,
    borderRadius: 12,
    padding: 10,
    alignItems: "center"
  },
  credit: {
    backgroundColor: colors.errorBg
  },
  methodText: {
    ...typography.badge,
    color: colors.successDark,
    textTransform: "uppercase"
  },
  creditText: {
    color: colors.error
  },
  printed: {
    ...typography.caption,
    color: colors.successDark,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "800"
  },
  barcode: {
    marginTop: 16,
    height: 60,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 3
  },
  bar: {
    backgroundColor: colors.foreground,
    opacity: 0.75
  }
});
