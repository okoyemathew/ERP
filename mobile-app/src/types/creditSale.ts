import type { ApiListMeta } from "./customer";
import type { ApiPaymentMethod } from "./sales";

export type CreditSaleStatus = "ACTIVE" | "PARTIALLY_PAID" | "PAID" | "DEFAULTED";
export type CreditSaleEmployeeAction = "EDIT" | "DELETE";
export type CreditSaleActionApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "USED";

export interface CreditSaleSummary {
  totalCreditSales: number;
  totalCreditIssued: string | number;
  totalOutstandingCredit: string | number;
  totalCollected: string | number;
  overdueAmount: string | number;
  activeCreditAccounts: number;
  paidCreditAccounts: number;
  overdueAccounts: number;
}

export interface ApiCreditSale {
  id: string;
  saleId: string;
  customerId: string;
  totalCredit: string | number;
  amountPaid: string | number;
  balance: string | number;
  dueDate?: string | null;
  status: CreditSaleStatus;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    status: string;
    creditLimit: string | number;
    outstandingBalance: string | number;
  };
  sale: {
    id: string;
    saleNumber: string;
    saleDate: string;
    remarks?: string | null;
    subtotal: string | number;
    discountAmount: string | number;
    taxAmount: string | number;
    totalAmount: string | number;
    paymentStatus: string;
    status: string;
    salesperson: {
      id: string;
      name: string;
      username: string;
    };
    items: Array<{
      id: string;
      productId: string;
      productName: string;
      sku?: string | null;
      barcode?: string | null;
      quantity: number;
      unitPrice: string | number;
      totalAmount: string | number;
    }>;
  };
  payments: CreditPayment[];
  employeeActionRequests?: CreditSaleActionRequest[];
}

export interface CreditSaleActionRequest {
  id: string;
  creditSaleId?: string;
  saleId?: string;
  saleNumber?: string;
  action: CreditSaleEmployeeAction;
  status: CreditSaleActionApprovalStatus;
  reason?: string | null;
  decisionNote?: string | null;
  expiresAt?: string | null;
  decidedAt?: string | null;
  usedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
  requestedBy?: {
    id: string;
    name: string;
    username: string;
  };
  approvedBy?: {
    id: string;
    name: string;
    username: string;
  } | null;
}

export interface CreditPayment {
  id: string;
  creditSaleId?: string;
  customerId?: string;
  paymentMethod: ApiPaymentMethod;
  amount: string | number;
  referenceNumber?: string | null;
  notes?: string | null;
  paymentDate: string;
  employee?: {
    id: string;
    name: string;
    username: string;
  } | null;
}

export interface CreditSaleListResponse {
  summary: CreditSaleSummary;
  data: ApiCreditSale[];
  meta: ApiListMeta;
}

export interface CreditPaymentPayload {
  amount: number;
  paymentMethod: ApiPaymentMethod;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
  idempotencyKey?: string;
}
