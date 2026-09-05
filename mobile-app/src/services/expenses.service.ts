import { endpoints } from "@/api/endpoints";
import { api } from "./api";
import { AppApiError } from "@/api/errors";
import { getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import { offlineSyncService } from "@/services/offline-sync.service";
import { useAuthStore } from "@/store/authStore";
import type { ApiExpense, CreateExpensePayload, ExpenseCategory, ExpenseListResponse, ExpenseSummary, UpdateExpensePayload } from "@/types/expense";

const fallbackCategory: ExpenseCategory = {
  id: "offline-miscellaneous",
  name: "Miscellaneous",
  description: null,
  isActive: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
};

function isOfflineError(error: unknown) {
  return error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT");
}

function filterCachedExpenses(expenses: ApiExpense[], params?: Record<string, string | number | boolean | undefined>) {
  const search = String(params?.search ?? "").trim().toLowerCase();
  const userId = params?.userId ? String(params.userId) : "";
  return expenses.filter((expense) => {
    if (userId && expense.recordedBy.id !== userId) return false;
    if (!search) return true;
    return [
      expense.title,
      expense.description,
      expense.expenseNumber,
      expense.receiptNumber,
      expense.vendor,
      expense.category.name,
      expense.recordedBy.name,
      expense.recordedBy.username
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
}

function buildSummary(expenses: ApiExpense[]): ExpenseSummary {
  const byCategory = new Map<string, { categoryId: string; categoryName: string; expenseCount: number; totalAmount: number }>();
  const byEmployee = new Map<string, { userId: string; employeeName: string; username?: string | null; expenseCount: number; totalAmount: number }>();
  const byPaymentMethod = new Map<string, { paymentMethod: ApiExpense["paymentMethod"]; expenseCount: number; totalAmount: number }>();

  let totalExpenses = 0;
  for (const expense of expenses) {
    const amount = Number(expense.amount ?? 0);
    totalExpenses += amount;

    const categoryRow = byCategory.get(expense.category.id) ?? {
      categoryId: expense.category.id,
      categoryName: expense.category.name,
      expenseCount: 0,
      totalAmount: 0
    };
    categoryRow.expenseCount += 1;
    categoryRow.totalAmount += amount;
    byCategory.set(expense.category.id, categoryRow);

    const employeeRow = byEmployee.get(expense.recordedBy.id) ?? {
      userId: expense.recordedBy.id,
      employeeName: expense.recordedBy.name || expense.recordedBy.username,
      username: expense.recordedBy.username,
      expenseCount: 0,
      totalAmount: 0
    };
    employeeRow.expenseCount += 1;
    employeeRow.totalAmount += amount;
    byEmployee.set(expense.recordedBy.id, employeeRow);

    const methodRow = byPaymentMethod.get(expense.paymentMethod) ?? {
      paymentMethod: expense.paymentMethod,
      expenseCount: 0,
      totalAmount: 0
    };
    methodRow.expenseCount += 1;
    methodRow.totalAmount += amount;
    byPaymentMethod.set(expense.paymentMethod, methodRow);
  }

  return {
    totalExpenses,
    expenseCount: expenses.length,
    expensesByCategory: Array.from(byCategory.values()),
    expensesByEmployee: Array.from(byEmployee.values()),
    expensesByPaymentMethod: Array.from(byPaymentMethod.values())
  };
}

function buildOfflineExpense(id: string, payload: CreateExpensePayload, categories: ExpenseCategory[]): ApiExpense {
  const user = useAuthStore.getState().user;
  const now = new Date().toISOString();
  const category = categories.find((item) => item.id === payload.categoryId) ?? fallbackCategory;
  return {
    id,
    expenseNumber: `OFF-${id.slice(-8).toUpperCase()}`,
    title: payload.title,
    description: payload.description ?? null,
    amount: payload.amount,
    expenseDate: payload.expenseDate ?? now,
    receiptNumber: payload.receiptNumber ?? id,
    vendor: payload.vendor ?? null,
    paymentMethod: payload.paymentMethod,
    category: { id: category.id, name: category.name, isActive: category.isActive },
    recordedBy: {
      id: user?.id ?? "offline-user",
      name: user?.name ?? ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username) ?? "Current User",
      username: user?.username ?? "offline"
    },
    createdAt: now,
    updatedAt: now
  };
}

export const expensesService = {
  async list(params?: Record<string, string | number | boolean | undefined>): Promise<ExpenseListResponse> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ExpenseListResponse>(endpoints.expenses.list, { params });
      await offlineDbService.cacheExpenses(businessId, data.data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        const cached = filterCachedExpenses(await offlineDbService.getCachedExpenses(businessId), params);
        const limit = Number(params?.limit ?? cached.length);
        return {
          summary: buildSummary(cached),
          data: cached.slice(0, limit),
          meta: { page: 1, limit, total: cached.length, totalPages: cached.length > 0 ? 1 : 0 }
        };
      }
      throw error;
    }
  },

  async categories(): Promise<ExpenseCategory[]> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ExpenseCategory[]>(endpoints.expenses.categories);
      await offlineDbService.cacheExpenseCategories(businessId, data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        const cached = await offlineDbService.getCachedExpenseCategories(businessId);
        return cached.length > 0 ? cached : [fallbackCategory];
      }
      throw error;
    }
  },

  async create(payload: CreateExpensePayload) {
    const businessId = await getRequiredBusinessId();
    const createOffline = async () => {
      const categories = await offlineDbService.getCachedExpenseCategories(businessId);
      const queued = await offlineSyncService.enqueueExpense(payload);
      const offlineExpense = buildOfflineExpense(queued.id, queued.payload as CreateExpensePayload, categories);
      await offlineDbService.cacheExpense(businessId, offlineExpense);
      return offlineExpense;
    };

    if (!(await offlineSyncService.isOnline())) {
      return createOffline();
    }

    try {
      const { data } = await api.post<ApiExpense>(endpoints.expenses.create, payload);
      await offlineDbService.cacheExpense(businessId, data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        return createOffline();
      }
      throw error;
    }
  },

  async detail(id: string): Promise<ApiExpense> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ApiExpense>(endpoints.expenses.detail(id));
      await offlineDbService.cacheExpense(businessId, data);
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        const cached = await offlineDbService.getCachedExpenses(businessId);
        const expense = cached.find((item) => item.id === id);
        if (expense) return expense;
      }
      throw error;
    }
  },

  async update(id: string, payload: UpdateExpensePayload): Promise<ApiExpense> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.patch<ApiExpense>(endpoints.expenses.update(id), payload);
      await offlineDbService.cacheExpense(businessId, data);
      return data;
    } catch (error) {
      const current = (await offlineDbService.getCachedExpenses(businessId)).find((expense) => expense.id === id);
      const fallback = {
        ...(current ?? buildOfflineExpense(id, { title: payload.title ?? "Expense", amount: payload.amount ?? 0, paymentMethod: payload.paymentMethod ?? "CASH" }, [])),
        ...payload,
        updatedAt: new Date().toISOString()
      } as ApiExpense;
      await offlineDbService.cacheExpense(businessId, fallback);
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.expenses.update(id), data: payload }, fallback);
    }
  },

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.delete<{ id: string; deleted: true }>(endpoints.expenses.delete(id));
      await offlineDbService.removeCachedExpense(businessId, id);
      return data;
    } catch (error) {
      await offlineDbService.removeCachedExpense(businessId, id);
      return queueOfflineMutation(error, { method: "DELETE", url: endpoints.expenses.delete(id) }, { id, deleted: true });
    }
  },

  async createCategory(payload: { name: string; description?: string }) {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.post<ExpenseCategory>(endpoints.expenses.createCategory, payload);
      await offlineDbService.cacheExpenseCategories(businessId, [data]);
      return data;
    } catch (error) {
      const fallback: ExpenseCategory = {
        id: `expense-category-${Date.now().toString(36)}`,
        name: payload.name,
        description: payload.description ?? null,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await offlineDbService.cacheExpenseCategories(businessId, [fallback]);
      return queueOfflineMutation(error, { method: "POST", url: endpoints.expenses.createCategory, data: payload }, fallback);
    }
  },

  async summary(params?: Record<string, string | number | boolean | undefined>): Promise<ExpenseSummary> {
    const businessId = await getRequiredBusinessId();
    try {
      const { data } = await api.get<ExpenseSummary>(endpoints.expenses.summary, { params });
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        return buildSummary(filterCachedExpenses(await offlineDbService.getCachedExpenses(businessId), params));
      }
      throw error;
    }
  }
};
