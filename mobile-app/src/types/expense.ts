import type { ApiPaymentMethod } from "./sales";

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiExpense {
  id: string;
  expenseNumber: string;
  title: string;
  description?: string | null;
  amount: string | number;
  expenseDate: string;
  receiptNumber?: string | null;
  vendor?: string | null;
  paymentMethod: ApiPaymentMethod;
  category: {
    id: string;
    name: string;
    isActive: boolean;
  };
  recordedBy: {
    id: string;
    name: string;
    username: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSummary {
  totalExpenses: string | number;
  expenseCount: number;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    expenseCount: number;
    totalAmount: string | number;
  }>;
  expensesByPaymentMethod: Array<{
    paymentMethod: ApiPaymentMethod;
    expenseCount: number;
    totalAmount: string | number;
  }>;
}

export interface ExpenseListResponse {
  summary: ExpenseSummary;
  data: ApiExpense[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateExpensePayload {
  title: string;
  description?: string;
  amount: number;
  categoryId: string;
  expenseDate?: string;
  receiptNumber?: string;
  vendor?: string;
  paymentMethod: ApiPaymentMethod;
}
