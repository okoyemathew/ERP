import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type {
  ApiCustomer,
  CollectCreditPaymentPayload,
  CustomerBalanceResponse,
  CustomerCreditSale,
  CustomerHistoryResponse,
  CustomerListResponse,
  CustomerPaymentHistoryItem,
  CustomerProfileResponse,
  CustomerQuery,
  CustomerSale,
  CustomerStatementResponse,
  UpsertCustomerPayload,
  ValidateCreditLimitPayload,
  ValidateCreditLimitResponse
} from "@/types/customer";
import { customerDisplayName } from "@/types/customer";

function filterCachedCustomers(customers: ApiCustomer[], params: CustomerQuery) {
  const search = params.search?.trim().toLowerCase();
  return customers.filter((customer) => {
    if (params.status && customer.status !== params.status) return false;
    if (params.isActive !== undefined && (customer.status === "ACTIVE") !== params.isActive) return false;
    if (params.isCompany !== undefined && Boolean(customer.companyName) !== params.isCompany) return false;
    if (params.hasOutstandingBalance && Number(customer.outstandingBalance ?? 0) <= 0) return false;
    if (!search) return true;
    return [
      customerDisplayName(customer),
      customer.customerCode,
      customer.email,
      customer.phone,
      customer.city,
      customer.state
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
}

function offlineId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function customerFallback(businessId: string, payload: UpsertCustomerPayload, id = offlineId("customer")): ApiCustomer {
  const now = new Date().toISOString();
  return {
    id,
    businessId,
    customerCode: payload.customerCode ?? null,
    firstName: payload.firstName,
    lastName: payload.lastName ?? null,
    companyName: payload.companyName ?? null,
    email: payload.email ?? null,
    phone: payload.phone,
    address: payload.address ?? null,
    city: payload.city ?? null,
    state: payload.state ?? null,
    country: payload.country ?? null,
    creditLimit: payload.creditLimit ?? 0,
    outstandingBalance: payload.outstandingBalance ?? 0,
    notes: payload.notes ?? null,
    status: payload.status ?? "ACTIVE",
    createdAt: now,
    updatedAt: now
  };
}

export const customersService = {
  async list(params: CustomerQuery = {}): Promise<CustomerListResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<CustomerListResponse>(endpoints.customers.list(businessId), { params });
      await offlineDbService.cacheCustomers(businessId, data.data);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        const cached = filterCachedCustomers(await offlineDbService.getCachedCustomers(businessId), params);
        const limit = params.limit ?? cached.length;
        return {
          data: cached.slice(0, limit),
          meta: { page: 1, limit, total: cached.length, totalPages: cached.length > 0 ? 1 : 0 }
        };
      }
      throw error;
    }
  },

  async search(query: string, params: CustomerQuery = {}): Promise<CustomerListResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<CustomerListResponse>(endpoints.customers.search(businessId), { params: { ...params, q: query } });
      await offlineDbService.cacheCustomers(businessId, data.data);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        const cached = filterCachedCustomers(await offlineDbService.getCachedCustomers(businessId), { ...params, search: query });
        const limit = params.limit ?? cached.length;
        return { data: cached.slice(0, limit), meta: { page: 1, limit, total: cached.length, totalPages: cached.length > 0 ? 1 : 0 } };
      }
      throw error;
    }
  },

  async detail(id: string): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ApiCustomer>(endpoints.customers.detail(businessId, id));
      await offlineDbService.cacheCustomer(businessId, data);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        const cached = (await offlineDbService.getCachedCustomers(businessId)).find((customer) => customer.id === id);
        if (cached) return cached;
      }
      throw error;
    }
  },

  async profile(id: string): Promise<CustomerProfileResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerProfileResponse>(endpoints.customers.profile(businessId, id));
    return data;
  },

  async create(payload: UpsertCustomerPayload): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ApiCustomer>(endpoints.customers.create(businessId), payload);
      await offlineDbService.cacheCustomer(businessId, data);
      return data;
    } catch (error) {
      const fallback = customerFallback(businessId, payload);
      await offlineDbService.cacheCustomer(businessId, fallback);
      return queueOfflineMutation(error, { method: "POST", url: endpoints.customers.create(businessId), data: payload }, fallback);
    }
  },

  async update(id: string, payload: Partial<UpsertCustomerPayload>): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiCustomer>(endpoints.customers.detail(businessId, id), payload);
      await offlineDbService.cacheCustomer(businessId, data);
      return data;
    } catch (error) {
      const current = (await offlineDbService.getCachedCustomers(businessId)).find((customer) => customer.id === id);
      const fallback = { ...(current ?? customerFallback(businessId, { firstName: payload.firstName ?? "Customer", phone: payload.phone ?? id }, id)), ...payload, updatedAt: new Date().toISOString() } as ApiCustomer;
      await offlineDbService.cacheCustomer(businessId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.customers.detail(businessId, id), data: payload }, fallback);
    }
  },

  async activate(id: string): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiCustomer>(endpoints.customers.activate(businessId, id));
      await offlineDbService.cacheCustomer(businessId, data);
      return data;
    } catch (error) {
      const current = (await offlineDbService.getCachedCustomers(businessId)).find((customer) => customer.id === id);
      const fallback = { ...(current ?? customerFallback(businessId, { firstName: "Customer", phone: id }, id)), status: "ACTIVE" as const, updatedAt: new Date().toISOString() };
      await offlineDbService.cacheCustomer(businessId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.customers.activate(businessId, id) }, fallback);
    }
  },

  async deactivate(id: string): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiCustomer>(endpoints.customers.deactivate(businessId, id));
      await offlineDbService.cacheCustomer(businessId, data);
      return data;
    } catch (error) {
      const current = (await offlineDbService.getCachedCustomers(businessId)).find((customer) => customer.id === id);
      const fallback = { ...(current ?? customerFallback(businessId, { firstName: "Customer", phone: id }, id)), status: "INACTIVE" as const, updatedAt: new Date().toISOString() };
      await offlineDbService.cacheCustomer(businessId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.customers.deactivate(businessId, id) }, fallback);
    }
  },

  async outstandingBalance(id: string): Promise<CustomerBalanceResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerBalanceResponse>(endpoints.customers.outstandingBalance(businessId, id));
    return data;
  },

  async outstandingCreditBalance(id: string): Promise<CustomerBalanceResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerBalanceResponse>(endpoints.customers.outstandingCreditBalance(businessId, id));
    return data;
  },

  async purchaseHistory(id: string, params: CustomerQuery = {}): Promise<CustomerHistoryResponse<CustomerSale>> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerHistoryResponse<CustomerSale>>(endpoints.customers.purchaseHistory(businessId, id), { params });
    return data;
  },

  async paymentHistory(id: string, params: CustomerQuery = {}): Promise<CustomerHistoryResponse<CustomerPaymentHistoryItem>> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerHistoryResponse<CustomerPaymentHistoryItem>>(endpoints.customers.paymentHistory(businessId, id), { params });
    return data;
  },

  async creditHistory(id: string, params: CustomerQuery = {}): Promise<CustomerHistoryResponse<CustomerCreditSale>> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerHistoryResponse<CustomerCreditSale>>(endpoints.customers.creditHistory(businessId, id), { params });
    return data;
  },

  async statement(id: string, params: CustomerQuery = {}): Promise<CustomerStatementResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerStatementResponse>(endpoints.customers.statement(businessId, id), { params });
    return data;
  },

  async collectCreditPayment(id: string, payload: CollectCreditPaymentPayload) {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post(endpoints.customers.collectCreditPayment(businessId, id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.customers.collectCreditPayment(businessId, id), data: payload }, { queued: true });
    }
  },

  async validateCreditLimit(id: string, payload: ValidateCreditLimitPayload): Promise<ValidateCreditLimitResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ValidateCreditLimitResponse>(endpoints.customers.validateCreditLimit(businessId, id), payload);
      return data;
    } catch (error) {
      if (error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT")) {
        const cached = (await offlineDbService.getCachedCustomers(businessId)).find((customer) => customer.id === id);
        const outstanding = Number(cached?.outstandingBalance ?? 0);
        const limit = Number(cached?.creditLimit ?? 0);
        const projected = outstanding + payload.amount;
        return {
          allowed: limit <= 0 || projected <= limit,
          requiresOverride: limit > 0 && projected > limit,
          creditLimit: limit,
          outstandingCreditBalance: outstanding,
          projectedCreditBalance: projected
        };
      }
      throw error;
    }
  }
};
