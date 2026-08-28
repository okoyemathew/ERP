import type { ReceiptDocument, SaleItem } from "./domain.types";

export type ApiPaymentMethod = "CASH" | "CREDIT" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD";
export type PosPaymentMethod = "cash" | "card" | "mobile" | "bank" | "credit";

export interface CreateSaleItemPayload {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
}

export interface CreatePaymentPayload {
  paymentMethod: ApiPaymentMethod;
  amount: number;
  referenceNumber?: string;
  notes?: string;
  allowChange?: boolean;
}

export interface CreateSalePayload {
  customerId?: string;
  items: CreateSaleItemPayload[];
  payments: CreatePaymentPayload[];
  remarks?: string;
  deviceId?: string;
  idempotencyKey?: string;
}

export interface ApiSale {
  id: string;
  saleNumber: string;
  customerId?: string | null;
  userId: string;
  subtotal: string | number;
  discountAmount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  amountPaid: string | number;
  balanceDue: string | number;
  paymentStatus: string;
  status: string;
  saleDate: string;
  customer?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    companyName?: string | null;
    phone: string;
  } | null;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: string | number;
    discountAmount: string | number;
    taxAmount: string | number;
    totalAmount: string | number;
    product: {
      id: string;
      name: string;
      sku?: string | null;
      barcode?: string | null;
    };
  }>;
  payments: Array<{
    id: string;
    paymentMethod: ApiPaymentMethod;
    amount: string | number;
    referenceNumber?: string | null;
    paymentDate: string;
  }>;
  receipt?: {
    id: string;
    receiptNumber: string;
  } | null;
}

export interface ApiReceipt {
  id: string;
  receiptNumber: string;
  createdAt: string;
  printed: boolean;
  business: { name: string; address?: string | null; phone?: string | null; currency: string };
  sale: {
    id: string;
    saleNumber: string;
    saleDate: string;
    subtotal: string | number;
    discountAmount: string | number;
    taxAmount: string | number;
    totalAmount: string | number;
    amountPaid: string | number;
    balanceDue: string | number;
    paymentStatus: string;
  };
  employee: { id: string; name: string; username: string };
  customer: { id: string | null; name: string; phone?: string | null };
  items: Array<{
    id: string;
    productId?: string | null;
    productName: string;
    quantity: number;
    unitPrice: string | number;
    discountAmount: string | number;
    taxAmount: string | number;
    totalAmount: string | number;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: ApiPaymentMethod;
    amount: string | number;
    referenceNumber?: string | null;
    paymentDate: string;
  }>;
}

export interface PrintReadyReceipt {
  format: "thermal-receipt-v1";
  paperWidth: "58mm" | "80mm";
  text: string;
  data: ApiReceipt;
}

export function toApiPaymentMethod(method: PosPaymentMethod): ApiPaymentMethod {
  if (method === "cash") return "CASH";
  if (method === "card") return "CARD";
  if (method === "mobile") return "MOBILE_MONEY";
  if (method === "bank") return "BANK_TRANSFER";
  return "CREDIT";
}

export function fromApiPaymentMethod(method: ApiPaymentMethod): PosPaymentMethod {
  if (method === "CARD") return "card";
  if (method === "MOBILE_MONEY") return "mobile";
  if (method === "BANK_TRANSFER") return "bank";
  if (method === "CREDIT") return "credit";
  return "cash";
}

export function mapReceiptToDocument(receipt: ApiReceipt): ReceiptDocument {
  const items: SaleItem[] = receipt.items.map((item) => ({
    productId: item.productId ?? item.id,
    name: item.productName,
    qty: item.quantity,
    price: Number(item.unitPrice)
  }));
  const primaryPayment = receipt.payments[0]?.paymentMethod ?? "CREDIT";

  return {
    id: receipt.receiptNumber,
    kind: Number(receipt.sale.balanceDue) > 0 ? "credit" : "sale",
    title: "Sales Receipt",
    orderNumber: receipt.sale.saleNumber,
    customerName: receipt.customer.name,
    employeeName: receipt.employee.name || receipt.employee.username,
    items,
    subtotal: Number(receipt.sale.subtotal),
    tax: Number(receipt.sale.taxAmount),
    total: Number(receipt.sale.totalAmount),
    paid: Number(receipt.sale.amountPaid),
    balance: Number(receipt.sale.balanceDue),
    method: fromApiPaymentMethod(primaryPayment),
    createdAt: receipt.sale.saleDate,
    printed: receipt.printed
  };
}
