import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
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

function isOfflineError(error: unknown) {
  return error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT");
}

function filterCachedSuppliers(suppliers: ApiSupplier[], params: SupplierQuery = {}) {
  const search = params.search?.trim().toLowerCase();
  return suppliers.filter((supplier) => {
    if (params.status && supplier.status !== params.status) return false;
    if (params.isActive !== undefined && (supplier.status === "ACTIVE") !== params.isActive) return false;
    if (!search) return true;
    return [supplier.companyName, supplier.supplierCode, supplier.contactPerson, supplier.phone, supplier.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
}

function cachedSupplierResponse(suppliers: ApiSupplier[], params: SupplierQuery = {}): SupplierListResponse {
  const filtered = filterCachedSuppliers(suppliers, params);
  const page = params.page ?? 1;
  const limit = params.limit ?? filtered.length;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : filtered.length;
  return {
    data: safeLimit ? filtered.slice((page - 1) * safeLimit, page * safeLimit) : filtered,
    meta: { page, limit: safeLimit, total: filtered.length, totalPages: safeLimit ? Math.ceil(filtered.length / safeLimit) : (filtered.length ? 1 : 0) }
  };
}

export const suppliersService = {
  async list(params: SupplierQuery = {}): Promise<SupplierListResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<SupplierListResponse>(endpoints.suppliers.list(businessId), { params });
      await offlineDbService.cacheSuppliers(businessId, data.data);
      return data;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return cachedSupplierResponse(await offlineDbService.getCachedSuppliers(businessId), params);
    }
  },

  async search(query: string, params: SupplierQuery = {}): Promise<SupplierListResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<SupplierListResponse>(endpoints.suppliers.search(businessId), { params: { ...params, q: query } });
      await offlineDbService.cacheSuppliers(businessId, data.data);
      return data;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return cachedSupplierResponse(await offlineDbService.getCachedSuppliers(businessId), { ...params, search: query });
    }
  },

  async detail(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ApiSupplier>(endpoints.suppliers.detail(businessId, id));
      await offlineDbService.cacheSupplier(businessId, data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        const supplier = await offlineDbService.getCachedSupplier(businessId, id);
        if (supplier) return supplier;
      }
      throw error;
    }
  },

  async create(payload: UpsertSupplierPayload): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ApiSupplier>(endpoints.suppliers.create(businessId), payload);
      await offlineDbService.cacheSupplier(businessId, data);
      return data;
    } catch (error) {
      const fallback = supplierFallback(businessId, payload);
      const queued = await queueOfflineMutation(error, { method: "POST", url: endpoints.suppliers.create(businessId), data: payload }, fallback);
      await offlineDbService.cacheSupplier(businessId, queued);
      return queued;
    }
  },

  async update(id: string, payload: Partial<UpsertSupplierPayload>): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.detail(businessId, id), payload);
      await offlineDbService.cacheSupplier(businessId, data);
      return data;
    } catch (error) {
      const current = await offlineDbService.getCachedSupplier(businessId, id);
      const fallback = { ...(current ?? supplierFallback(businessId, { companyName: "Supplier", phone: id }, id)), ...payload, updatedAt: new Date().toISOString() } as ApiSupplier;
      const queued = await queueOfflineMutation(
        error,
        { method: "PATCH", url: endpoints.suppliers.detail(businessId, id), data: payload },
        fallback
      );
      await offlineDbService.cacheSupplier(businessId, queued);
      return queued;
    }
  },

  async activate(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.activate(businessId, id));
      await offlineDbService.cacheSupplier(businessId, data);
      return data;
    } catch (error) {
      const current = await offlineDbService.getCachedSupplier(businessId, id);
      const fallback = { ...(current ?? supplierFallback(businessId, { companyName: "Supplier", phone: id }, id)), status: "ACTIVE", updatedAt: new Date().toISOString() } as ApiSupplier;
      const queued = await queueOfflineMutation(error, { method: "PATCH", url: endpoints.suppliers.activate(businessId, id) }, fallback);
      await offlineDbService.cacheSupplier(businessId, queued);
      return queued;
    }
  },

  async deactivate(id: string): Promise<ApiSupplier> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiSupplier>(endpoints.suppliers.deactivate(businessId, id));
      await offlineDbService.cacheSupplier(businessId, data);
      return data;
    } catch (error) {
      const current = await offlineDbService.getCachedSupplier(businessId, id);
      const fallback = { ...(current ?? supplierFallback(businessId, { companyName: "Supplier", phone: id }, id)), status: "INACTIVE", updatedAt: new Date().toISOString() } as ApiSupplier;
      const queued = await queueOfflineMutation(error, { method: "PATCH", url: endpoints.suppliers.deactivate(businessId, id) }, fallback);
      await offlineDbService.cacheSupplier(businessId, queued);
      return queued;
    }
  },

  async outstandingBalance(id: string): Promise<SupplierBalanceResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<SupplierBalanceResponse>(endpoints.suppliers.outstandingBalance(businessId, id));
      return data;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      const supplier = await offlineDbService.getCachedSupplier(businessId, id);
      if (!supplier) throw error;
      return { supplierId: supplier.id, companyName: supplier.companyName, outstandingBalance: supplier.outstandingBalance, status: supplier.status };
    }
  },

  async recordPayment(id: string, payload: SupplierPaymentPayload): Promise<SupplierPaymentResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<SupplierPaymentResponse>(endpoints.suppliers.payments(businessId, id), payload);
      const supplier = await offlineDbService.getCachedSupplier(businessId, id);
      if (supplier) await offlineDbService.cacheSupplier(businessId, { ...supplier, outstandingBalance: data.newBalance, updatedAt: new Date().toISOString() });
      return data;
    } catch (error) {
      const supplier = await offlineDbService.getCachedSupplier(businessId, id);
      const previousBalance = Number(supplier?.outstandingBalance ?? 0);
      const newBalance = Math.max(0, previousBalance - payload.amount);
      const queued = await queueOfflineMutation(error, { method: "POST", url: endpoints.suppliers.payments(businessId, id), data: payload }, {
        supplierId: id,
        companyName: supplier?.companyName ?? "Supplier",
        paymentAmount: payload.amount,
        previousBalance,
        newBalance
      });
      if (supplier) await offlineDbService.cacheSupplier(businessId, { ...supplier, outstandingBalance: newBalance, updatedAt: new Date().toISOString() });
      return queued;
    }
  },

  async paymentHistory(id: string): Promise<SupplierPaymentHistoryResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<SupplierPaymentHistoryResponse>(endpoints.suppliers.paymentHistory(businessId, id));
      return data;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      const supplier = await offlineDbService.getCachedSupplier(businessId, id);
      if (!supplier) throw error;
      return { supplierId: id, companyName: supplier.companyName, currentOutstandingBalance: Number(supplier.outstandingBalance), paymentHistory: [] };
    }
  }
};
