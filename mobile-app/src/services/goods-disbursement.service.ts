import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { getRequiredBusinessId } from "@/api/session";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type {
  ApiGoodsDisbursement,
  CreateGoodsDisbursementPayload,
  GoodsDisbursementListResponse,
  UpdateGoodsDisbursementPayload
} from "@/types/goodsDisbursement";

function disbursementFallback(businessId: string, payload: CreateGoodsDisbursementPayload | UpdateGoodsDisbursementPayload, id = `disbursement-${Date.now().toString(36)}`): ApiGoodsDisbursement {
  const now = new Date().toISOString();
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
    items: (payload.items ?? []).map((item, index) => ({
      id: `${id}-item-${index}`,
      productId: item.productId,
      quantity: item.quantity,
      remarks: item.remarks ?? null
    }))
  };
}

export const goodsDisbursementService = {
  async list(params: Record<string, string | number | undefined> = {}): Promise<GoodsDisbursementListResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<GoodsDisbursementListResponse>(endpoints.goodsDisbursements.list(businessId), { params });
    return data;
  },

  async mine(params: Record<string, string | number | undefined> = {}): Promise<GoodsDisbursementListResponse> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<GoodsDisbursementListResponse>(endpoints.goodsDisbursements.mine(businessId), { params });
    return data;
  },

  async detail(id: string): Promise<ApiGoodsDisbursement> {
    const businessId = await getRequiredBusinessId();
    const { data } = await api.get<ApiGoodsDisbursement>(endpoints.goodsDisbursements.detail(businessId, id));
    return data;
  },

  async create(payload: CreateGoodsDisbursementPayload): Promise<ApiGoodsDisbursement> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ApiGoodsDisbursement>(endpoints.goodsDisbursements.create(businessId), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.goodsDisbursements.create(businessId), data: payload }, disbursementFallback(businessId, payload));
    }
  },

  async update(id: string, payload: UpdateGoodsDisbursementPayload): Promise<ApiGoodsDisbursement> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiGoodsDisbursement>(endpoints.goodsDisbursements.update(businessId, id), payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.goodsDisbursements.update(businessId, id), data: payload }, disbursementFallback(businessId, payload, id));
    }
  }
};
