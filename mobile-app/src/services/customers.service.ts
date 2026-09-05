import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
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
    const { data } = await api.get<CustomerListResponse>(endpoints.customers.search(businessId), { params: { ...params, q: query } });
    return data;
  },

  async detail(id: string): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ApiCustomer>(endpoints.customers.detail(businessId, id));
    return data;
  },

  async profile(id: string): Promise<CustomerProfileResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerProfileResponse>(endpoints.customers.profile(businessId, id));
    return data;
  },

  async create(payload: UpsertCustomerPayload): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<ApiCustomer>(endpoints.customers.create(businessId), payload);
    return data;
  },

  async update(id: string, payload: Partial<UpsertCustomerPayload>): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ApiCustomer>(endpoints.customers.detail(businessId, id), payload);
    return data;
  },

  async activate(id: string): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ApiCustomer>(endpoints.customers.activate(businessId, id));
    return data;
  },

  async deactivate(id: string): Promise<ApiCustomer> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ApiCustomer>(endpoints.customers.deactivate(businessId, id));
    return data;
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
    const { data } = await api.post(endpoints.customers.collectCreditPayment(businessId, id), payload);
    return data;
  },

  async validateCreditLimit(id: string, payload: ValidateCreditLimitPayload): Promise<ValidateCreditLimitResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<ValidateCreditLimitResponse>(endpoints.customers.validateCreditLimit(businessId, id), payload);
    return data;
  }
};
