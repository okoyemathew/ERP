import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type { ApiSale, CreatePaymentPayload, CreateSalePayload, PrintReadyReceipt } from "@/types/sales";

function saleFallback(payload: CreateSalePayload, id = `sale-${Date.now().toString(36)}`): ApiSale {
  const now = new Date().toISOString();
  const subtotal = payload.items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice ?? 0), 0);
  const discountAmount = payload.items.reduce((sum, item) => sum + Number(item.discountAmount ?? 0), 0);
  const taxAmount = payload.items.reduce((sum, item) => sum + Number(item.taxAmount ?? 0), 0);
  const paid = payload.payments.filter((payment) => payment.paymentMethod !== "CREDIT").reduce((sum, payment) => sum + payment.amount, 0);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);
  return {
    id,
    saleNumber: `OFF-${id.slice(-8).toUpperCase()}`,
    customerId: payload.customerId ?? null,
    userId: "offline-user",
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount: total,
    amountPaid: paid,
    balanceDue: Math.max(0, total - paid),
    paymentStatus: paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
    status: "PENDING",
    saleDate: now,
    customer: null,
    items: payload.items.map((item, index) => ({
      id: `${id}-item-${index}`,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? 0,
      discountAmount: item.discountAmount ?? 0,
      taxAmount: item.taxAmount ?? 0,
      totalAmount: item.quantity * Number(item.unitPrice ?? 0),
      product: { id: item.productId, name: "Product" }
    })),
    payments: payload.payments.map((payment, index) => ({
      id: `${id}-payment-${index}`,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      referenceNumber: payment.referenceNumber ?? null,
      paymentDate: now
    })),
    receipt: { id, receiptNumber: `OFF-${id.slice(-8).toUpperCase()}` }
  };
}

export const salesService = {
  async list(params?: Record<string, string | number>): Promise<{ data: ApiSale[] }> {
    const { data } = await api.get<{ data: ApiSale[] }>("/sales", { params });
    return data;
  },

  async create(payload: CreateSalePayload): Promise<ApiSale> {
    const { data } = await api.post<ApiSale>(endpoints.sales.create, payload);
    return data;
  },

  async complete(saleId: string, payments: CreatePaymentPayload[]): Promise<ApiSale> {
    try {
      const { data } = await api.post<ApiSale>(`/sales/${saleId}/complete`, { payments });
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: `/sales/${saleId}/complete`, data: { payments } }, saleFallback({ items: [], payments }, saleId));
    }
  },

  async receipt(saleId: string): Promise<PrintReadyReceipt["data"]> {
    const { data } = await api.get<PrintReadyReceipt["data"]>(`/sales/${saleId}/receipt`);
    return data;
  },

  async printReceipt(receiptId: string): Promise<PrintReadyReceipt> {
    const { data } = await api.get<PrintReadyReceipt>(endpoints.sales.receiptPrint(receiptId));
    return data;
  },

  async reprintReceipt(receiptId: string): Promise<PrintReadyReceipt> {
    try {
      const { data } = await api.post<PrintReadyReceipt>(endpoints.sales.receiptReprint(receiptId));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.sales.receiptReprint(receiptId) }, {
        format: "thermal-receipt-v1",
        paperWidth: "80mm",
        text: "Receipt will sync when network is available.",
        data: {} as PrintReadyReceipt["data"]
      });
    }
  },

  async collectCreditPayment(creditSaleId: string, payload: Record<string, unknown>) {
    try {
      const { data } = await api.post(`/credit-sales/${creditSaleId}/payments`, payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: `/credit-sales/${creditSaleId}/payments`, data: payload }, { queued: true });
    }
  },

  async outstandingCreditSales(params: Record<string, string | number> = {}) {
    const { data } = await api.get<{ data: unknown[] }>("/credit-sales/outstanding", { params });
    return data;
  }
};
