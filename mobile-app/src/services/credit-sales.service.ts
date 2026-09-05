import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type { ApiCreditSale, CreditPaymentPayload, CreditSaleActionRequest, CreditSaleEmployeeAction, CreditSaleListResponse } from "@/types/creditSale";

function fallbackCreditSale(id: string): ApiCreditSale {
  const now = new Date().toISOString();
  return {
    id,
    saleId: id,
    customerId: "offline-customer",
    totalCredit: 0,
    amountPaid: 0,
    balance: 0,
    dueDate: null,
    status: "ACTIVE",
    isOverdue: false,
    createdAt: now,
    updatedAt: now,
    customer: { id: "offline-customer", name: "Customer", phone: "", status: "ACTIVE", creditLimit: 0, outstandingBalance: 0 },
    sale: {
      id,
      saleNumber: id,
      saleDate: now,
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      paymentStatus: "PENDING",
      status: "PENDING",
      salesperson: { id: "offline-user", name: "Current User", username: "offline" },
      items: []
    },
    payments: []
  };
}

function fallbackActionRequest(id: string, action: CreditSaleEmployeeAction, reason?: string): CreditSaleActionRequest {
  const now = new Date().toISOString();
  return {
    id: `request-${Date.now().toString(36)}`,
    creditSaleId: id,
    action,
    status: "PENDING",
    reason: reason ?? null,
    createdAt: now,
    updatedAt: now
  };
}

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
    try {
      const { data } = await api.post<ApiCreditSale>(endpoints.creditSales.payment(id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.creditSales.payment(id), data: payload }, fallbackCreditSale(id));
    }
  },

  async collectPosPayment(id: string, payload: CreditPaymentPayload): Promise<ApiCreditSale> {
    try {
      const { data } = await api.post<ApiCreditSale>(`/credit-sales/${id}/pos-payments`, payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: `/credit-sales/${id}/pos-payments`, data: payload }, fallbackCreditSale(id));
    }
  },

  async requestAction(id: string, action: CreditSaleEmployeeAction, reason?: string): Promise<CreditSaleActionRequest> {
    try {
      const { data } = await api.post<CreditSaleActionRequest>(`/credit-sales/${id}/action-requests`, { action, reason });
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: `/credit-sales/${id}/action-requests`, data: { action, reason } }, fallbackActionRequest(id, action, reason));
    }
  },

  async actionRequests(): Promise<{ data: CreditSaleActionRequest[] }> {
    const { data } = await api.get<{ data: CreditSaleActionRequest[] }>("/credit-sales/action-requests");
    return data;
  },

  async approveActionRequest(requestId: string, note?: string): Promise<CreditSaleActionRequest> {
    try {
      const { data } = await api.post<CreditSaleActionRequest>(`/credit-sales/action-requests/${requestId}/approve`, { note });
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: `/credit-sales/action-requests/${requestId}/approve`, data: { note } }, {
        id: requestId,
        action: "EDIT",
        status: "APPROVED",
        decisionNote: note ?? null,
        createdAt: new Date().toISOString()
      });
    }
  },

  async rejectActionRequest(requestId: string, note?: string): Promise<CreditSaleActionRequest> {
    try {
      const { data } = await api.post<CreditSaleActionRequest>(`/credit-sales/action-requests/${requestId}/reject`, { note });
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: `/credit-sales/action-requests/${requestId}/reject`, data: { note } }, {
        id: requestId,
        action: "EDIT",
        status: "REJECTED",
        decisionNote: note ?? null,
        createdAt: new Date().toISOString()
      });
    }
  },

  async employeeEdit(id: string, payload: { dueDate?: string; remarks?: string }): Promise<ApiCreditSale> {
    try {
      const { data } = await api.patch<ApiCreditSale>(`/credit-sales/${id}/employee-edit`, payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: `/credit-sales/${id}/employee-edit`, data: payload }, fallbackCreditSale(id));
    }
  },

  async employeeDelete(id: string): Promise<{ success: boolean; id: string; saleId: string }> {
    try {
      const { data } = await api.delete<{ success: boolean; id: string; saleId: string }>(`/credit-sales/${id}/employee-delete`);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "DELETE", url: `/credit-sales/${id}/employee-delete` }, { success: true, id, saleId: id });
    }
  }
};
