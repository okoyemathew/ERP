import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import type { ApiCreditSale, CreditPaymentPayload, CreditSaleActionRequest, CreditSaleEmployeeAction, CreditSaleListResponse } from "@/types/creditSale";

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
  },

  async requestAction(id: string, action: CreditSaleEmployeeAction, reason?: string): Promise<CreditSaleActionRequest> {
    const { data } = await api.post<CreditSaleActionRequest>(`/credit-sales/${id}/action-requests`, { action, reason });
    return data;
  },

  async actionRequests(): Promise<{ data: CreditSaleActionRequest[] }> {
    const { data } = await api.get<{ data: CreditSaleActionRequest[] }>("/credit-sales/action-requests");
    return data;
  },

  async approveActionRequest(requestId: string, note?: string): Promise<CreditSaleActionRequest> {
    const { data } = await api.post<CreditSaleActionRequest>(`/credit-sales/action-requests/${requestId}/approve`, { note });
    return data;
  },

  async rejectActionRequest(requestId: string, note?: string): Promise<CreditSaleActionRequest> {
    const { data } = await api.post<CreditSaleActionRequest>(`/credit-sales/action-requests/${requestId}/reject`, { note });
    return data;
  },

  async employeeEdit(id: string, payload: { dueDate?: string; remarks?: string }): Promise<ApiCreditSale> {
    const { data } = await api.patch<ApiCreditSale>(`/credit-sales/${id}/employee-edit`, payload);
    return data;
  },

  async employeeDelete(id: string): Promise<{ success: boolean; id: string; saleId: string }> {
    const { data } = await api.delete<{ success: boolean; id: string; saleId: string }>(`/credit-sales/${id}/employee-delete`);
    return data;
  }
};
