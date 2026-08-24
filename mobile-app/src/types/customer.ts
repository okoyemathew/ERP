export type CustomerStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";
export type CustomerPaymentMethod = "CASH" | "CARD" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CHEQUE" | "OTHER";

export interface ApiListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CustomerQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerStatus;
  isActive?: boolean;
  isCompany?: boolean;
  hasOutstandingBalance?: boolean;
}

export interface ApiCustomer {
  id: string;
  businessId: string;
  customerCode?: string | null;
  firstName: string;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  creditLimit: string | number;
  outstandingBalance: string | number;
  notes?: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  sales?: CustomerSale[];
  payments?: CustomerPaymentEntry[];
  creditSales?: CustomerCreditSale[];
  creditPayments?: CustomerCreditPayment[];
  _count?: {
    sales?: number;
    payments?: number;
    creditSales?: number;
    creditPayments?: number;
  };
}

export interface CustomerListResponse {
  data: ApiCustomer[];
  meta: ApiListMeta;
}

export interface CustomerSummary {
  customerType: "COMPANY" | "INDIVIDUAL";
  totalSales: string | number;
  saleBalanceDue: string | number;
  totalPayments: string | number;
  totalCreditIssued: string | number;
  totalCreditPaid: string | number;
  activeCreditBalance: string | number;
  outstandingBalance: string | number;
  storedOutstandingBalance: string | number;
  creditLimit: string | number;
  availableCredit: string | number;
  saleCount: number;
  paymentCount: number;
}

export interface CustomerProfileResponse {
  customer: ApiCustomer;
  summary: CustomerSummary;
}

export interface CustomerBalanceResponse {
  customerId: string;
  name: string;
  creditLimit: string | number;
  outstandingBalance?: string | number;
  saleBalanceDue?: string | number;
  outstandingCreditBalance: string | number;
  storedOutstandingBalance?: string | number;
  availableCredit: string | number;
  status: CustomerStatus;
}

export interface CustomerSale {
  id: string;
  saleNumber: string;
  saleDate: string;
  totalAmount: string | number;
  amountPaid?: string | number;
  balanceDue?: string | number;
  paymentStatus?: string;
  items?: Array<{
    id: string;
    quantity: string | number;
    unitPrice: string | number;
    totalPrice: string | number;
    product?: { id: string; name: string; sku?: string | null };
  }>;
}

export interface CustomerPaymentEntry {
  id: string;
  amount: string | number;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber?: string | null;
  sale?: CustomerSale;
}

export interface CustomerCreditSale {
  id: string;
  totalCredit: string | number;
  amountPaid: string | number;
  balance: string | number;
  status: string;
  createdAt: string;
  sale?: CustomerSale;
  payments?: CustomerCreditPayment[];
}

export interface CustomerCreditPayment {
  id: string;
  amount: string | number;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber?: string | null;
}

export interface CustomerHistoryResponse<T> {
  data: T[];
  meta: ApiListMeta;
}

export interface CustomerPaymentHistoryItem {
  type: "SALE_PAYMENT" | "CREDIT_PAYMENT";
  date: string;
  payment: CustomerPaymentEntry | CustomerCreditPayment;
}

export interface CustomerStatementResponse {
  customer: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
  };
  summary: {
    saleBalanceDue: string | number;
    outstandingCreditBalance: string | number;
    totalOutstanding: string | number;
  };
  data: Array<{
    type: "SALE" | "PAYMENT" | "CREDIT_PAYMENT";
    date: string;
    debit: string | number;
    credit: string | number;
    reference?: string | null;
    runningBalance: string | number;
  }>;
  meta: ApiListMeta;
}

export interface UpsertCustomerPayload {
  customerCode?: string;
  firstName: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  creditLimit?: number;
  outstandingBalance?: number;
  notes?: string;
  status?: CustomerStatus;
}

export interface CollectCreditPaymentPayload {
  amount: number;
  paymentMethod: CustomerPaymentMethod | string;
  referenceNumber?: string;
  notes?: string;
  creditSaleId?: string;
}

export interface ValidateCreditLimitPayload {
  amount: number;
}

export interface ValidateCreditLimitResponse {
  allowed: boolean;
  requiresOverride: boolean;
  creditLimit: string | number;
  outstandingCreditBalance: string | number;
  projectedCreditBalance: string | number;
}

export function customerDisplayName(customer: ApiCustomer): string {
  const personName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  return customer.companyName || personName || customer.phone;
}
