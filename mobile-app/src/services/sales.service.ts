import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import type { ApiSale, CreatePaymentPayload, CreateSalePayload, PrintReadyReceipt } from "@/types/sales";

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
    const { data } = await api.post<ApiSale>(`/sales/${saleId}/complete`, { payments });
    return data;
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
    const { data } = await api.post<PrintReadyReceipt>(endpoints.sales.receiptReprint(receiptId));
    return data;
  },

  async collectCreditPayment(creditSaleId: string, payload: Record<string, unknown>) {
    const { data } = await api.post(`/credit-sales/${creditSaleId}/payments`, payload);
    return data;
  },

  async outstandingCreditSales(params: Record<string, string | number> = {}) {
    const { data } = await api.get<{ data: unknown[] }>("/credit-sales/outstanding", { params });
    return data;
  }
};
