import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredAuthContext } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import { dashboardEvents } from "@/utils/dashboardEvents";
import type { ApiCreditSale, CreditPaymentPayload, CreditSaleActionRequest, CreditSaleEmployeeAction, CreditSaleListResponse, CustomerCreditResponse } from "@/types/creditSale";

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

function queuedCreditSalesToResponse(sales: Awaited<ReturnType<typeof offlineDbService.getQueuedOfflineSales>>, search = ""): CreditSaleListResponse {
  const normalizedSearch = search.trim().toLowerCase();
  const data: ApiCreditSale[] = sales.flatMap((sale) => {
    const creditAmount = sale.payments
      .filter((payment) => payment.paymentMethod === "CREDIT")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const balance = Math.max(0, Number(sale.balanceDue) || 0);
    if (creditAmount <= 0) return [];

    const customerName = sale.customer
      ? sale.customer.companyName || [sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(" ") || sale.customer.phone
      : "Walk-in Customer";
    const items = sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      barcode: item.product.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalAmount: item.totalAmount,
      originalQuantity: item.originalQuantity,
      returnedQuantity: item.returnedQuantity,
      originalTotalAmount: item.originalTotalAmount,
      returnedValue: item.returnedValue,
    }));
    if (normalizedSearch && ![
      sale.saleNumber,
      customerName,
      sale.customer?.phone,
      ...items.flatMap((item) => [item.productName, item.sku, item.barcode]),
    ].some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch))) return [];

    return [{
      id: sale.id,
      saleId: sale.id,
      customerId: sale.customerId ?? "offline-walk-in",
      totalCredit: creditAmount,
      amountPaid: Math.max(creditAmount - balance, 0),
      balance,
      dueDate: null,
      status: balance <= 0 ? "PAID" : creditAmount > balance ? "PARTIALLY_PAID" : "ACTIVE",
      isOverdue: false,
      createdAt: sale.saleDate,
      updatedAt: sale.saleDate,
      customer: {
        id: sale.customer?.id ?? "offline-walk-in",
        name: customerName,
        phone: sale.customer?.phone ?? "",
        status: "ACTIVE",
        creditLimit: 0,
        outstandingBalance: balance,
      },
      sale: {
        id: sale.id,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate,
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        amountPaid: sale.amountPaid,
        balanceDue: sale.balanceDue,
        paymentStatus: sale.paymentStatus,
        status: sale.status,
        salesperson: {
          id: sale.user?.id ?? sale.userId,
          name: [sale.user?.firstName, sale.user?.lastName].filter(Boolean).join(" ") || sale.user?.username || "Offline Sale",
          username: sale.user?.username ?? "offline",
        },
        items,
        payments: sale.payments,
      },
      payments: [],
    }];
  });
  const totalCreditIssued = data.reduce((sum, credit) => sum + Number(credit.totalCredit), 0);
  const totalOutstandingCredit = data.reduce((sum, credit) => sum + Number(credit.balance), 0);
  const totalCollected = data.reduce((sum, credit) => sum + Number(credit.amountPaid), 0);
  return {
    summary: {
      totalCreditSales: data.length,
      totalCreditIssued,
      totalOutstandingCredit,
      totalCollected,
      overdueAmount: 0,
      activeCreditAccounts: data.filter((credit) => Number(credit.balance) > 0).length,
      paidCreditAccounts: data.filter((credit) => Number(credit.balance) <= 0).length,
      overdueAccounts: 0,
    },
    data,
    meta: { page: 1, limit: data.length, total: data.length, totalPages: data.length ? 1 : 0 },
  };
}

async function getQueuedCreditSales(search = "") {
  const { businessId, userId } = await getRequiredAuthContext();
  return queuedCreditSalesToResponse(await offlineDbService.getQueuedOfflineSales(businessId, userId), search);
}

function isOfflineError(error: unknown) {
  return error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT");
}

async function updateCachedCustomerBalance(customerId: string | undefined, outstandingBalance: unknown) {
  if (!customerId) return;
  const balance = Number(outstandingBalance);
  if (!Number.isFinite(balance)) return;
  const { businessId, userId } = await getRequiredAuthContext();
  const customer = (await offlineDbService.getCachedCustomers(businessId, userId)).find((item) => item.id === customerId);
  if (!customer) return;
  await offlineDbService.cacheCustomer(businessId, userId, {
    ...customer,
    outstandingBalance: Math.max(0, balance),
    updatedAt: new Date().toISOString()
  });
}

function mergeQueuedCredits(remote: CreditSaleListResponse, queued: CreditSaleListResponse): CreditSaleListResponse {
  const remoteSaleIds = new Set(remote.data.map((credit) => credit.saleId));
  const newQueued = queued.data.filter((credit) => !remoteSaleIds.has(credit.saleId));
  if (!newQueued.length) return remote;
  const data = [...remote.data, ...newQueued];
  return {
    ...remote,
    summary: {
      totalCreditSales: remote.summary.totalCreditSales + newQueued.length,
      totalCreditIssued: Number(remote.summary.totalCreditIssued) + newQueued.reduce((sum, credit) => sum + Number(credit.totalCredit), 0),
      totalOutstandingCredit: Number(remote.summary.totalOutstandingCredit) + newQueued.reduce((sum, credit) => sum + Number(credit.balance), 0),
      totalCollected: Number(remote.summary.totalCollected) + newQueued.reduce((sum, credit) => sum + Number(credit.amountPaid), 0),
      overdueAmount: remote.summary.overdueAmount,
      activeCreditAccounts: remote.summary.activeCreditAccounts + newQueued.filter((credit) => Number(credit.balance) > 0).length,
      paidCreditAccounts: remote.summary.paidCreditAccounts + newQueued.filter((credit) => Number(credit.balance) <= 0).length,
      overdueAccounts: remote.summary.overdueAccounts,
    },
    data,
    meta: { ...remote.meta, total: remote.meta.total + newQueued.length },
  };
}

async function applyQueuedCreditUpdates(response: CreditSaleListResponse): Promise<CreditSaleListResponse> {
  const { businessId, userId } = await getRequiredAuthContext();
  const mutations = await offlineDbService.getPendingApiMutations(businessId, userId);
  const data = response.data.map((credit) => ({ ...credit, sale: { ...credit.sale }, payments: [...credit.payments] }));

  for (const mutation of mutations) {
    const paymentMatch = mutation.url.match(/^\/credit-sales\/([^/]+)\/(?:payments|pos-payments)$/);
    const editMatch = mutation.url.match(/^\/credit-sales\/([^/]+)\/employee-edit$/);
    const deleteMatch = mutation.url.match(/^\/credit-sales\/([^/]+)\/employee-delete$/);
    if (deleteMatch && mutation.method === "DELETE") {
      const index = data.findIndex((credit) => credit.id === deleteMatch[1]);
      if (index >= 0) data.splice(index, 1);
      continue;
    }
    if (editMatch && mutation.method === "PATCH") {
      const credit = data.find((item) => item.id === editMatch[1]);
      const payload = mutation.data as { dueDate?: string; remarks?: string } | undefined;
      if (credit && payload) {
        credit.dueDate = payload.dueDate ?? credit.dueDate;
        credit.sale.remarks = payload.remarks ?? credit.sale.remarks;
      }
      continue;
    }
    if (!paymentMatch || mutation.method !== "POST") continue;
    const credit = data.find((item) => item.id === paymentMatch[1]);
    const payload = mutation.data as CreditPaymentPayload | undefined;
    if (!credit || !payload) continue;
    const amount = Math.max(0, Number(payload.amount) || 0);
    const total = Number(credit.sale.totalAmount || credit.totalCredit || 0);
    const amountPaid = Math.min(total, Number(credit.amountPaid || 0) + amount);
    const balance = Math.max(0, total - amountPaid);
    credit.amountPaid = amountPaid;
    credit.balance = balance;
    credit.sale.amountPaid = amountPaid;
    credit.sale.balanceDue = balance;
    credit.status = balance <= 0 ? "PAID" : amountPaid > 0 ? "PARTIALLY_PAID" : "ACTIVE";
    credit.payments.push({
      id: `offline-payment-${Date.now().toString(36)}-${credit.payments.length}`,
      amount,
      paymentMethod: payload.paymentMethod,
      paymentDate: payload.paymentDate ?? new Date().toISOString(),
      referenceNumber: payload.referenceNumber ?? null,
      employee: null
    });
  }

  const summary = data.reduce((totals, credit) => ({
    totalCreditIssued: totals.totalCreditIssued + Number(credit.totalCredit || 0),
    totalOutstandingCredit: totals.totalOutstandingCredit + Number(credit.balance || 0),
    totalCollected: totals.totalCollected + Number(credit.amountPaid || 0),
    activeCreditAccounts: totals.activeCreditAccounts + (Number(credit.balance || 0) > 0 ? 1 : 0),
    paidCreditAccounts: totals.paidCreditAccounts + (Number(credit.balance || 0) <= 0 ? 1 : 0),
  }), { totalCreditIssued: 0, totalOutstandingCredit: 0, totalCollected: 0, activeCreditAccounts: 0, paidCreditAccounts: 0 });

  return {
    ...response,
    data,
    summary: {
      ...response.summary,
      totalCreditSales: data.length,
      ...summary,
      overdueAmount: data.filter((credit) => credit.isOverdue).reduce((sum, credit) => sum + Number(credit.balance || 0), 0),
      overdueAccounts: data.filter((credit) => credit.isOverdue).length
    },
    meta: { ...response.meta, total: data.length, totalPages: data.length ? Math.max(1, Math.ceil(data.length / response.meta.limit)) : 0 }
  };
}

async function mergedCreditResponse(remote: CreditSaleListResponse, search = "") {
  return applyQueuedCreditUpdates(mergeQueuedCredits(remote, await getQueuedCreditSales(search)));
}

export const creditSalesService = {
  async list(params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    try {
      const { data } = await api.get<CreditSaleListResponse>(endpoints.creditSales.list, { params });
      return mergedCreditResponse(data, String(params.search ?? ""));
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return applyQueuedCreditUpdates(await getQueuedCreditSales(String(params.search ?? "")));
    }
  },

  async outstanding(params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    try {
      const { data } = await api.get<CreditSaleListResponse>("/credit-sales/outstanding", { params });
      return mergedCreditResponse(data, String(params.search ?? ""));
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return applyQueuedCreditUpdates(await getQueuedCreditSales(String(params.search ?? "")));
    }
  },

  async posOutstanding(params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    try {
      const { data } = await api.get<CreditSaleListResponse>("/credit-sales/pos/outstanding", { params });
      return mergedCreditResponse(data, String(params.search ?? ""));
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return applyQueuedCreditUpdates(await getQueuedCreditSales(String(params.search ?? "")));
    }
  },

  async search(query: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<CreditSaleListResponse> {
    try {
      const { data } = await api.get<CreditSaleListResponse>("/credit-sales/search", { params: { ...params, q: query } });
      return mergedCreditResponse(data, query);
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return applyQueuedCreditUpdates(await getQueuedCreditSales(query));
    }
  },

  async detail(id: string): Promise<ApiCreditSale> {
    const { data } = await api.get<ApiCreditSale>(`/credit-sales/${id}`);
    return data;
  },

  async customerCredit(customerId: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<CustomerCreditResponse> {
    const { data } = await api.get<CustomerCreditResponse>(`/credit-sales/customers/${customerId}`, { params });
    return data;
  },

  async posCustomerCredit(customerId: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<CustomerCreditResponse> {
    const { data } = await api.get<CustomerCreditResponse>(`/credit-sales/pos/customers/${customerId}`, { params });
    return data;
  },

  async collectPayment(id: string, payload: CreditPaymentPayload, customerId?: string): Promise<ApiCreditSale> {
    try {
      const { data } = await api.post<ApiCreditSale>(endpoints.creditSales.payment(id), payload);
      await updateCachedCustomerBalance(data.customer.id, data.customer.outstandingBalance);
      dashboardEvents.notifySaleChanged();
      return data;
    } catch (error) {
      const queued = await queueOfflineMutation(error, { method: "POST", url: endpoints.creditSales.payment(id), data: payload }, fallbackCreditSale(id));
      const { businessId, userId } = await getRequiredAuthContext();
      const customer = customerId ? (await offlineDbService.getCachedCustomers(businessId, userId)).find((item) => item.id === customerId) : undefined;
      if (customer) await updateCachedCustomerBalance(customerId, Number(customer.outstandingBalance) - Number(payload.amount));
      dashboardEvents.notifySaleChanged();
      return queued;
    }
  },

  async collectPosPayment(id: string, payload: CreditPaymentPayload, customerId?: string): Promise<ApiCreditSale> {
    try {
      const { data } = await api.post<ApiCreditSale>(`/credit-sales/${id}/pos-payments`, payload);
      await updateCachedCustomerBalance(data.customer.id, data.customer.outstandingBalance);
      dashboardEvents.notifySaleChanged();
      return data;
    } catch (error) {
      const queued = await queueOfflineMutation(error, { method: "POST", url: `/credit-sales/${id}/pos-payments`, data: payload }, fallbackCreditSale(id));
      const { businessId, userId } = await getRequiredAuthContext();
      const customer = customerId ? (await offlineDbService.getCachedCustomers(businessId, userId)).find((item) => item.id === customerId) : undefined;
      if (customer) await updateCachedCustomerBalance(customerId, Number(customer.outstandingBalance) - Number(payload.amount));
      dashboardEvents.notifySaleChanged();
      return queued;
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
      dashboardEvents.notifySaleChanged();
      return data;
    } catch (error) {
      const queued = await queueOfflineMutation(error, { method: "PATCH", url: `/credit-sales/${id}/employee-edit`, data: payload }, fallbackCreditSale(id));
      dashboardEvents.notifySaleChanged();
      return queued;
    }
  },

  async employeeDelete(id: string): Promise<{ success: boolean; id: string; saleId: string }> {
    try {
      const { data } = await api.delete<{ success: boolean; id: string; saleId: string }>(`/credit-sales/${id}/employee-delete`);
      dashboardEvents.notifySaleChanged();
      return data;
    } catch (error) {
      const queued = await queueOfflineMutation(error, { method: "DELETE", url: `/credit-sales/${id}/employee-delete` }, { success: true, id, saleId: id });
      dashboardEvents.notifySaleChanged();
      return queued;
    }
  }
};
