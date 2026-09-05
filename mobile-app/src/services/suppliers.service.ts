import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { getRequiredBusinessId } from "@/api/session";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
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

function offlineId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function supplierFallback(businessId: string, payload: UpsertSupplierPayload, id = offlineId("supplier")): ApiSupplier {
  const now = new Date().toISOString();
  return {
    id,
    businessId,
    supplierCode: payload.supplierCode ?? null,
    companyName: payload.companyName,
    contactPerson: payload.contactPerson ?? null,
    email: payload.email ?? null,
    phone: payload.phone,
    address: payload.address ?? null,
    city: payload.city ?? null,
    state: payload.state ?? null,
    country: payload.country ?? null,
    taxNumber: payload.taxNumber ?? null,
    outstandingBalance: payload.outstandingBalance ?? 0,
    notes: payload.notes ?? null,
    status: payload.status ?? "ACTIVE",
    createdAt: now,
    updatedAt: now
  };
}

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
    try {
      const { data } = await api.post<ApiSupplier>(endpoints.suppliers.create(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.suppliers.create(businessId), data: payload }, supplierFallback(businessId, payload));
    }
  },

  async update(id: string, payload: Partial<UpsertSupplierPayload>): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.detail(businessId, id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(
        error,
        { method: "PATCH", url: endpoints.suppliers.detail(businessId, id), data: payload },
        supplierFallback(businessId, { companyName: payload.companyName ?? "Supplier", phone: payload.phone ?? id, ...payload }, id)
      );
    }
  },

  async activate(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.activate(businessId, id));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.suppliers.activate(businessId, id) }, supplierFallback(businessId, { companyName: "Supplier", phone: id, status: "ACTIVE" }, id));
    }
  },

  async deactivate(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.deactivate(businessId, id));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.suppliers.deactivate(businessId, id) }, supplierFallback(businessId, { companyName: "Supplier", phone: id, status: "INACTIVE" }, id));
    }
  },

  async outstandingBalance(id: string): Promise<SupplierBalanceResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<SupplierBalanceResponse>(endpoints.suppliers.outstandingBalance(businessId, id));
    return data;
  },

  async recordPayment(id: string, payload: SupplierPaymentPayload): Promise<SupplierPaymentResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<SupplierPaymentResponse>(endpoints.suppliers.payments(businessId, id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.suppliers.payments(businessId, id), data: payload }, {
        supplierId: id,
        companyName: "Supplier",
        paymentAmount: payload.amount,
        previousBalance: 0,
        newBalance: 0
      });
    }
  },

  async paymentHistory(id: string): Promise<SupplierPaymentHistoryResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<SupplierPaymentHistoryResponse>(endpoints.suppliers.paymentHistory(businessId, id));
    return data;
  }
};
