import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredAuthContext } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type {
  ApiGoodsDisbursement,
  CreateGoodsDisbursementPayload,
  GoodsDisbursementListResponse,
  UpdateGoodsDisbursementPayload
} from "@/types/goodsDisbursement";

function isOfflineError(error: unknown) {
  return error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT");
}

function filterDisbursements(
  disbursements: ApiGoodsDisbursement[],
  params: Record<string, string | number | undefined>
) {
  const search = String(params.search ?? "").trim().toLowerCase();
  const employeeId = params.employeeId ? String(params.employeeId) : "";
  return disbursements.filter((disbursement) => {
    if (employeeId && disbursement.employeeId !== employeeId) return false;
    if (!search) return true;
    const employeeName = disbursement.employee
      ? `${disbursement.employee.firstName} ${disbursement.employee.lastName}`.trim()
      : "";
    return [
      disbursement.disbursementNumber,
      disbursement.destination,
      disbursement.remarks,
      employeeName,
      disbursement.employee?.employeeCode,
      disbursement.employee?.user?.username,
      ...disbursement.items.flatMap((item) => [
        item.product?.name,
        item.product?.sku,
        item.product?.barcode,
        item.productId,
        item.quantity
      ])
    ].some((value) => String(value ?? "").toLowerCase().includes(search));
  });
}

async function disbursementFallback(
  businessId: string,
  payload: CreateGoodsDisbursementPayload | UpdateGoodsDisbursementPayload,
  id = `disbursement-${Date.now().toString(36)}`
): Promise<ApiGoodsDisbursement> {
  const now = new Date().toISOString();
  const products = await offlineDbService.getCachedProducts(businessId);
  const productsById = new Map(products.map((product) => [product.id, product]));
  return {
    id,
    businessId,
    employeeId: payload.employeeId ?? null,
    employee: null,
    disbursementNumber: payload.disbursementNumber ?? `OFF-${id.slice(-8).toUpperCase()}`,
    disbursementDate: payload.disbursementDate ?? now,
    destination: payload.destination ?? null,
    remarks: payload.remarks ?? null,
    createdAt: now,
    updatedAt: now,
    items: (payload.items ?? []).map((item, index) => {
      const product = productsById.get(item.productId);
      return {
        id: `${id}-item-${index}`,
        productId: item.productId,
        quantity: item.quantity,
        remarks: item.remarks ?? null,
        product: product
          ? {
              id: item.productId,
              name: product.name,
              sku: product.sku ?? item.productId,
              barcode: product.barcode ?? null,
              sellingPrice: product.sellingPrice ?? 0,
              isActive: product.isActive
            }
          : undefined
      };
    })
  };
}

export const goodsDisbursementService = {
  async list(params: Record<string, string | number | undefined> = {}): Promise<GoodsDisbursementListResponse> {
    const { businessId, userId } = await getRequiredAuthContext();
    try {
      const { data } = await api.get<GoodsDisbursementListResponse>(endpoints.goodsDisbursements.list(businessId), { params });
      await offlineDbService.cacheGoodsDisbursements(businessId, userId, data.data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        const cached = filterDisbursements(await offlineDbService.getCachedGoodsDisbursements(businessId, userId), params);
        const limit = Number(params.limit ?? cached.length);
        return {
          data: cached.slice(0, Number.isFinite(limit) && limit > 0 ? limit : cached.length),
          meta: { page: 1, limit, total: cached.length, totalPages: cached.length > 0 ? 1 : 0 }
        };
      }
      throw error;
    }
  },

  async mine(params: Record<string, string | number | undefined> = {}): Promise<GoodsDisbursementListResponse> {
    const { businessId, userId } = await getRequiredAuthContext();
    try {
      const { data } = await api.get<GoodsDisbursementListResponse>(endpoints.goodsDisbursements.mine(businessId), { params });
      await offlineDbService.cacheGoodsDisbursements(businessId, userId, data.data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        const cached = filterDisbursements(await offlineDbService.getCachedGoodsDisbursements(businessId, userId), params);
        const limit = Number(params.limit ?? cached.length);
        return {
          data: cached.slice(0, Number.isFinite(limit) && limit > 0 ? limit : cached.length),
          meta: { page: 1, limit, total: cached.length, totalPages: cached.length > 0 ? 1 : 0 }
        };
      }
      throw error;
    }
  },

  async detail(id: string): Promise<ApiGoodsDisbursement> {
    const { businessId, userId } = await getRequiredAuthContext();
    try {
      const { data } = await api.get<ApiGoodsDisbursement>(endpoints.goodsDisbursements.detail(businessId, id));
      await offlineDbService.cacheGoodsDisbursement(businessId, userId, data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        const cached = (await offlineDbService.getCachedGoodsDisbursements(businessId, userId)).find((item) => item.id === id);
        if (cached) return cached;
      }
      throw error;
    }
  },

  async create(payload: CreateGoodsDisbursementPayload): Promise<ApiGoodsDisbursement> {
    const { businessId, userId } = await getRequiredAuthContext();
    try {
      const { data } = await api.post<ApiGoodsDisbursement>(endpoints.goodsDisbursements.create(businessId), payload);
      await offlineDbService.cacheGoodsDisbursement(businessId, userId, data);
      return data;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      const fallback = await disbursementFallback(businessId, payload);
      await offlineDbService.cacheGoodsDisbursement(businessId, userId, fallback);
      return queueOfflineMutation(error, { method: "POST", url: endpoints.goodsDisbursements.create(businessId), data: payload }, fallback);
    }
  },

  async update(id: string, payload: UpdateGoodsDisbursementPayload): Promise<ApiGoodsDisbursement> {
    const { businessId, userId } = await getRequiredAuthContext();
    try {
      const { data } = await api.patch<ApiGoodsDisbursement>(endpoints.goodsDisbursements.update(businessId, id), payload);
      await offlineDbService.cacheGoodsDisbursement(businessId, userId, data);
      return data;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      const current = (await offlineDbService.getCachedGoodsDisbursements(businessId, userId)).find((item) => item.id === id);
      const builtFallback = await disbursementFallback(businessId, payload, id);
      const fallback = {
        ...(current ?? builtFallback),
        ...payload,
        items: payload.items ? builtFallback.items : current?.items ?? [],
        updatedAt: new Date().toISOString()
      } as ApiGoodsDisbursement;
      await offlineDbService.cacheGoodsDisbursement(businessId, userId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.goodsDisbursements.update(businessId, id), data: payload }, fallback);
    }
  }
};
