import type { ApiListMeta } from "./customer";

export interface ApiGoodsDisbursementItem {
  id: string;
  productId: string;
  quantity: number;
  remarks?: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
    sellingPrice?: string | number;
  };
}

export interface ApiGoodsDisbursement {
  id: string;
  businessId: string;
  employeeId?: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    user?: { username: string };
  } | null;
  disbursementNumber: string;
  disbursementDate: string;
  destination?: string | null;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  items: ApiGoodsDisbursementItem[];
}

export interface GoodsDisbursementListResponse {
  data: ApiGoodsDisbursement[];
  meta: ApiListMeta;
}

export interface CreateGoodsDisbursementPayload {
  employeeId?: string;
  disbursementNumber?: string;
  disbursementDate?: string;
  destination?: string;
  remarks?: string;
  deviceId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    remarks?: string;
  }>;
}
