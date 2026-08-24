import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { getRequiredBusinessId } from "@/api/session";
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

export const customersService = {
  async list(params: CustomerQuery = {}): Promise<CustomerListResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<CustomerListResponse>(endpoints.customers.list(businessId), { params });
    return data;
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
