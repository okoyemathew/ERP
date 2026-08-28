import { endpoints } from "@/api/endpoints";
import { api } from "./api";
import type { ApiExpense, CreateExpensePayload, ExpenseCategory, ExpenseListResponse, ExpenseSummary, UpdateExpensePayload } from "@/types/expense";

export const expensesService = {
  async list(params?: Record<string, string | number | boolean | undefined>): Promise<ExpenseListResponse> {
    const { data } = await api.get<ExpenseListResponse>(endpoints.expenses.list, { params });
    return data;
  },

  async categories(): Promise<ExpenseCategory[]> {
    const { data } = await api.get<ExpenseCategory[]>(endpoints.expenses.categories);
    return data;
  },

  async create(payload: CreateExpensePayload) {
    const { data } = await api.post<ApiExpense>(endpoints.expenses.create, payload);
    return data;
  },

  async detail(id: string): Promise<ApiExpense> {
    const { data } = await api.get<ApiExpense>(endpoints.expenses.detail(id));
    return data;
  },

  async update(id: string, payload: UpdateExpensePayload): Promise<ApiExpense> {
    const { data } = await api.patch<ApiExpense>(endpoints.expenses.update(id), payload);
    return data;
  },

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const { data } = await api.delete<{ id: string; deleted: true }>(endpoints.expenses.delete(id));
    return data;
  },

  async createCategory(payload: { name: string; description?: string }) {
    const { data } = await api.post<ExpenseCategory>(endpoints.expenses.createCategory, payload);
    return data;
  },

  async summary(params?: Record<string, string | number | boolean | undefined>): Promise<ExpenseSummary> {
    const { data } = await api.get<ExpenseSummary>(endpoints.expenses.summary, { params });
    return data;
  }
};
