import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { getRequiredBusinessId } from "@/api/session";
import type {
  ApiSupplier,
  SupplierBalanceResponse,
  SupplierListResponse,
  SupplierPaymentHistoryResponse,
  SupplierPaymentPayload,
  SupplierPaymentResponse,
  SupplierQuery,
  UpsertSupplierPayload
} from "@/types/supplier";

export const suppliersService = {
  async list(params: SupplierQuery = {}): Promise<SupplierListResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<SupplierListResponse>(endpoints.suppliers.list(businessId), { params });
    return data;
  },

  async search(query: string, params: SupplierQuery = {}): Promise<SupplierListResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<SupplierListResponse>(endpoints.suppliers.search(businessId), { params: { ...params, q: query } });
    return data;
  },

  async detail(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ApiSupplier>(endpoints.suppliers.detail(businessId, id));
    return data;
  },

  async create(payload: UpsertSupplierPayload): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<ApiSupplier>(endpoints.suppliers.create(businessId), payload);
    return data;
  },

  async update(id: string, payload: Partial<UpsertSupplierPayload>): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.detail(businessId, id), payload);
    return data;
  },

  async activate(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.activate(businessId, id));
    return data;
  },

  async deactivate(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.deactivate(businessId, id));
    return data;
  },

  async outstandingBalance(id: string): Promise<SupplierBalanceResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<SupplierBalanceResponse>(endpoints.suppliers.outstandingBalance(businessId, id));
    return data;
  },

  async recordPayment(id: string, payload: SupplierPaymentPayload): Promise<SupplierPaymentResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.post<SupplierPaymentResponse>(endpoints.suppliers.payments(businessId, id), payload);
    return data;
  },

  async paymentHistory(id: string): Promise<SupplierPaymentHistoryResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<SupplierPaymentHistoryResponse>(endpoints.suppliers.paymentHistory(businessId, id));
    return data;
  }
};
