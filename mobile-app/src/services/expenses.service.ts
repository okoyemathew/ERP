import { endpoints } from "@/api/endpoints";
import { api } from "./api";
import type { CreateExpensePayload, ExpenseCategory, ExpenseListResponse } from "@/types/expense";

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
    const { data } = await api.post(endpoints.expenses.create, payload);
    return data;
  },

  async createCategory(payload: { name: string; description?: string }) {
    const { data } = await api.post<ExpenseCategory>(endpoints.expenses.createCategory, payload);
    return data;
  },

  async summary(params?: Record<string, string | number | boolean | undefined>) {
    const { data } = await api.get(endpoints.expenses.summary, { params });
    return data;
  }
};
