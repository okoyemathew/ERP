import type { ApiListMeta } from "./customer";

export type SupplierStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export interface SupplierQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: SupplierStatus;
  isActive?: boolean;
}

export interface ApiSupplier {
  id: string;
  businessId: string;
  supplierCode?: string | null;
  companyName: string;
  contactPerson?: string | null;
  email?: string | null;
  phone: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  taxNumber?: string | null;
  outstandingBalance: string | number;
  notes?: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
  purchaseOrders?: SupplierPurchaseOrder[];
  goodsSupplied?: GoodsSuppliedRecord[];
}

export interface SupplierListResponse {
  data: ApiSupplier[];
  meta: ApiListMeta;
}

export interface SupplierPurchaseOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string | number;
  expectedDate?: string | null;
  createdAt: string;
}

export interface GoodsSuppliedRecord {
  id: string;
  supplyNumber: string;
  status: string;
  totalAmount: string | number;
  supplyDate: string;
  createdAt: string;
}

export interface SupplierBalanceResponse {
  supplierId: string;
  companyName: string;
  outstandingBalance: string | number;
  status: SupplierStatus;
}

export interface SupplierPaymentPayload {
  amount: number;
  reference: string;
}

export interface SupplierPaymentResponse {
  supplierId: string;
  companyName: string;
  paymentAmount: number;
  previousBalance: number;
  newBalance: number;
}

export interface SupplierPaymentHistoryResponse {
  supplierId: string;
  companyName: string;
  currentOutstandingBalance: number;
  paymentHistory: Array<{
    id: string;
    date: string;
    description: string;
    recordedBy?: string | null;
  }>;
}

export interface UpsertSupplierPayload {
  supplierCode?: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  taxNumber?: string;
  outstandingBalance?: number;
  notes?: string;
  status?: SupplierStatus;
}
