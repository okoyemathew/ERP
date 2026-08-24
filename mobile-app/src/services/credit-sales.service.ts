import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import type { ApiCreditSale, CreditPaymentPayload, CreditSaleListResponse } from "@/types/creditSale";

export const creditSalesService = {
  async list(params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    const { data } = await api.get<CreditSaleListResponse>(endpoints.creditSales.list, { params });
    return data;
  },

  async outstanding(params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    const { data } = await api.get<CreditSaleListResponse>("/credit-sales/outstanding", { params });
    return data;
  },

  async posOutstanding(params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    const { data } = await api.get<CreditSaleListResponse>("/credit-sales/pos/outstanding", { params });
    return data;
  },

  async search(query: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    const { data } = await api.get<CreditSaleListResponse>("/credit-sales/search", { params: { ...params, q: query } });
    return data;
  },

  async detail(id: string): Promise<ApiCreditSale> {
    const { data } = await api.get<ApiCreditSale>(`/credit-sales/${id}`);
    return data;
  },

  async collectPayment(id: string, payload: CreditPaymentPayload): Promise<ApiCreditSale> {
    const { data } = await api.post<ApiCreditSale>(endpoints.creditSales.payment(id), payload);
    return data;
  },

  async collectPosPayment(id: string, payload: CreditPaymentPayload): Promise<ApiCreditSale> {
    const { data } = await api.post<ApiCreditSale>(`/credit-sales/${id}/pos-payments`, payload);
    return data;
  }
};
