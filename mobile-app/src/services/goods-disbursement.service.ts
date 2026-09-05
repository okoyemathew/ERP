import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { getRequiredBusinessId } from "@/api/session";
import type {
  ApiGoodsDisbursement,
  CreateGoodsDisbursementPayload,
  GoodsDisbursementListResponse
} from "@/types/goodsDisbursement";

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
    const { data } = await api.post<ApiGoodsDisbursement>(endpoints.goodsDisbursements.create(businessId), payload);
    return data;
  }
};
