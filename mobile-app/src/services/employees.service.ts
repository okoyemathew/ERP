import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredAuthContext, getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import { useAuthStore } from "@/store/authStore";
import type {
  ApiEmployee,
  EmployeeListResponse,
  EmployeeProfileResponse,
  EmployeeSalesPrintResponse,
  EmployeeSalesResponse,
  EmployeeStatus,
  UpsertEmployeePayload
} from "@/types/employee";
import type { ApiSale } from "@/types/sales";

interface EmployeeListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmployeeStatus;
  department?: string;
  designation?: string;
  canLogin?: boolean;
  sortBy?: "createdAt" | "updatedAt" | "employeeCode" | "firstName" | "lastName" | "department" | "designation" | "hireDate" | "salary" | "status";
  sortOrder?: "asc" | "desc";
}

interface EmployeeSalesParams {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  status?: "PENDING" | "COMPLETED" | "CANCELLED" | "REFUNDED";
  paymentMethod?: "CASH" | "CREDIT" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD";
  sortBy?: "createdAt" | "saleDate" | "paymentDate" | "totalAmount";
  sortOrder?: "asc" | "desc";
}

function offlineId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function moneyValue(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function isOfflineError(error: unknown) {
  return error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT");
}

function saleCustomerName(sale: ApiSale) {
  return sale.customer
    ? sale.customer.companyName || [sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(" ")
    : "Walk-in Customer";
}

function saleMatchesEmployeeParams(sale: ApiSale, params: EmployeeSalesParams) {
  const search = params.search?.trim().toLowerCase();
  const status = params.status?.toUpperCase();
  const paymentMethod = params.paymentMethod?.toUpperCase();

  if (status && sale.status.toUpperCase() !== status) return false;
  if (paymentMethod && !sale.payments.some((payment) => payment.paymentMethod === paymentMethod)) return false;
  if (params.startDate && new Date(sale.saleDate) < new Date(params.startDate)) return false;
  if (params.endDate && new Date(sale.saleDate) > new Date(params.endDate)) return false;
  if (!search) return true;

  return [
    sale.saleNumber,
    saleCustomerName(sale),
    sale.customer?.phone,
    sale.user?.username,
    sale.user?.firstName,
    sale.user?.lastName,
    ...sale.items.map((item) => item.product.name)
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

function mergeSales(remoteSales: ApiSale[], queuedSales: ApiSale[], limit: number) {
  const salesById = new Map<string, ApiSale>();
  queuedSales.forEach((sale) => salesById.set(sale.id, sale));
  remoteSales.forEach((sale) => salesById.set(sale.id, sale));
  return Array.from(salesById.values())
    .sort((left, right) => new Date(right.saleDate).getTime() - new Date(left.saleDate).getTime())
    .slice(0, limit);
}

async function queuedEmployeeSales(params: EmployeeSalesParams = {}) {
  const { businessId, userId } = await getRequiredAuthContext();
  return (await offlineDbService.getQueuedOfflineSales(businessId, userId)).filter((sale) => saleMatchesEmployeeParams(sale, params));
}

function augmentEmployeeSalesResponse(response: EmployeeSalesResponse, queuedSales: ApiSale[], params: EmployeeSalesParams = {}): EmployeeSalesResponse {
  const page = params.page ?? response.meta.page ?? 1;
  const limit = params.limit ?? response.meta.limit ?? 20;
  const completedQueued = queuedSales.filter((sale) => sale.status === "COMPLETED");
  const totalSalesValue = completedQueued.reduce((sum, sale) => sum + moneyValue(sale.totalAmount), 0);
  const totalCollected = completedQueued.reduce((sum, sale) => sum + moneyValue(sale.amountPaid), 0);
  const totalBalanceDue = completedQueued.reduce((sum, sale) => sum + moneyValue(sale.balanceDue), 0);
  const completedSalesCount = response.summary.completedSalesCount + completedQueued.length;
  const nextTotal = response.meta.total + queuedSales.length;

  return {
    ...response,
    summary: {
      ...response.summary,
      transactions: response.summary.transactions + queuedSales.length,
      completedSalesCount,
      totalSalesValue: moneyValue(response.summary.totalSalesValue) + totalSalesValue,
      totalCollected: moneyValue(response.summary.totalCollected) + totalCollected,
      totalBalanceDue: moneyValue(response.summary.totalBalanceDue) + totalBalanceDue,
      averageSaleValue: completedSalesCount > 0
        ? (moneyValue(response.summary.totalSalesValue) + totalSalesValue) / completedSalesCount
        : 0
    },
    data: page === 1 ? mergeSales(response.data, queuedSales, limit) : response.data,
    meta: {
      ...response.meta,
      total: nextTotal,
      totalPages: Math.ceil(nextTotal / limit)
    }
  };
}

function currentUserEmployeeFallback(businessId: string): ApiEmployee {
  const user = useAuthStore.getState().user;
  const now = new Date().toISOString();
  return {
    id: user?.employeeId ?? user?.id ?? "offline-employee",
    businessId,
    userId: user?.id ?? "offline-user",
    employeeCode: user?.username ?? user?.id ?? "offline-employee",
    firstName: user?.firstName ?? user?.name ?? "Employee",
    lastName: user?.lastName ?? "",
    phone: user?.phone ?? null,
    email: user?.email ?? null,
    department: null,
    designation: user?.roleName ?? "Employee",
    profileImage: user?.profileImage ?? null,
    lastLogin: null,
    status: "ACTIVE",
    canLogin: true,
    canSell: true,
    canManageStock: false,
    canManageExpenses: false,
    canPrintReceipt: true,
    deviceId: null,
    user: {
      id: user?.id ?? "offline-user",
      username: user?.username ?? "offline",
      status: user?.status ?? "ACTIVE",
      lastLogin: null,
      role: user?.roleName ? { id: user.roleId ?? user.roleName, name: user.roleName, description: null } : null,
      branch: null
    }
  };
}

async function buildOfflineSelfProfile(): Promise<EmployeeProfileResponse> {
  const { businessId, userId } = await getRequiredAuthContext();
  const [disbursements, queuedSales, queuedExpenses] = await Promise.all([
    offlineDbService.getCachedGoodsDisbursements(businessId, userId),
    offlineDbService.getQueuedOfflineSales(businessId, userId),
    offlineDbService.getQueuedOfflineExpensePayloads(businessId, userId)
  ]);
  const employee = currentUserEmployeeFallback(businessId);
  const supplied = new Map<string, { productId: string; productName: string; sku?: string | null; barcode?: string | null; suppliedQuantity: number; unitValue: number; lastActivityAt: string }>();
  const supplyRuns = disbursements.map((run) => {
    let totalQuantity = 0;
    let totalValue = 0;
    const items = run.items.map((item) => {
      const productName = item.product?.name ?? item.productId;
      const unitValue = moneyValue(item.product?.sellingPrice);
      const value = unitValue * item.quantity;
      const current = supplied.get(item.productId);
      supplied.set(item.productId, {
        productId: item.productId,
        productName,
        sku: item.product?.sku ?? null,
        barcode: item.product?.barcode ?? null,
        suppliedQuantity: (current?.suppliedQuantity ?? 0) + item.quantity,
        unitValue: current?.unitValue ?? unitValue,
        lastActivityAt: run.disbursementDate
      });
      totalQuantity += item.quantity;
      totalValue += value;
      return { id: item.id, productId: item.productId, productName, sku: item.product?.sku ?? null, barcode: item.product?.barcode ?? null, quantity: item.quantity, value };
    });
    return { ...run, totalQuantity, totalValue, items };
  });
  const stock = Array.from(supplied.values()).map((item) => ({
    ...item,
    quantityInHand: item.suppliedQuantity,
    quantitySold: 0,
    totalSoldValue: 0
  }));
  const stockByProduct = new Map(stock.map((item) => [item.productId, item]));
  const completedQueued = queuedSales.filter((sale) => sale.status === "COMPLETED");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  let salesToday = 0;
  let salesTodayValue = 0;

  for (const sale of completedQueued) {
    if (new Date(sale.saleDate) >= start) {
      salesToday += 1;
      salesTodayValue += moneyValue(sale.totalAmount);
    }
    for (const saleItem of sale.items) {
      const item = stockByProduct.get(saleItem.productId);
      if (!item) continue;
      item.quantityInHand = Math.max(0, item.quantityInHand - saleItem.quantity);
      item.quantitySold += saleItem.quantity;
      item.totalSoldValue = moneyValue(item.totalSoldValue) + moneyValue(saleItem.totalAmount);
      item.lastActivityAt = sale.saleDate;
    }
  }
  const stockValue = stock.reduce((sum, item) => sum + item.quantityInHand * moneyValue(item.unitValue), 0);
  const totalSuppliedQuantity = supplyRuns.reduce((sum, run) => sum + run.totalQuantity, 0);
  const totalSuppliedValue = supplyRuns.reduce((sum, run) => sum + moneyValue(run.totalValue), 0);

  return {
    employee,
    summary: {
      salesCount: queuedSales.length,
      paymentsCount: queuedSales.reduce((sum, sale) => sum + sale.payments.filter((payment) => payment.paymentMethod !== "CREDIT").length, 0),
      expensesCount: queuedExpenses.length,
      activeSessions: 0
    },
    profileActivity: {
      stats: {
        stockItems: stock.length,
        stockValue,
        totalSupplied: totalSuppliedQuantity,
        salesToday,
        salesTodayValue
      },
      stock,
      supplies: {
        summary: {
          totalSupplyRuns: supplyRuns.length,
          totalSuppliedQuantity,
          totalSuppliedValue
        },
        data: supplyRuns
      }
    },
    recentSessions: []
  };
}

async function augmentSelfProfile(profile: EmployeeProfileResponse): Promise<EmployeeProfileResponse> {
  const queuedSales = await queuedEmployeeSales();
  if (!queuedSales.length) return profile;
  const completedQueued = queuedSales.filter((sale) => sale.status === "COMPLETED");
  const activity = profile.profileActivity;
  if (!activity) return profile;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const stock = activity.stock.map((item) => ({ ...item }));
  const stockByProduct = new Map(stock.map((item) => [item.productId, item]));
  let salesToday = activity.stats.salesToday;
  let salesTodayValue = moneyValue(activity.stats.salesTodayValue);

  for (const sale of completedQueued) {
    if (new Date(sale.saleDate) >= start) {
      salesToday += 1;
      salesTodayValue += moneyValue(sale.totalAmount);
    }
    for (const saleItem of sale.items) {
      const item = stockByProduct.get(saleItem.productId);
      if (!item) continue;
      item.quantityInHand = Math.max(0, item.quantityInHand - saleItem.quantity);
      item.quantitySold += saleItem.quantity;
      item.totalSoldValue = moneyValue(item.totalSoldValue) + moneyValue(saleItem.totalAmount);
      item.lastActivityAt = sale.saleDate;
    }
  }
  const stockValue = stock.reduce((sum, item) => sum + item.quantityInHand * moneyValue(item.unitValue), 0);

  return {
    ...profile,
    summary: {
      ...profile.summary,
      salesCount: profile.summary.salesCount + queuedSales.length,
      paymentsCount: profile.summary.paymentsCount + queuedSales.reduce((sum, sale) => sum + sale.payments.filter((payment) => payment.paymentMethod !== "CREDIT").length, 0)
    },
    profileActivity: {
      ...activity,
      stats: {
        ...activity.stats,
        stockValue,
        salesToday,
        salesTodayValue
      },
      stock
    }
  };
}

function employeeFallback(businessId: string, payload: Partial<UpsertEmployeePayload>, id = offlineId("employee")): ApiEmployee {
  return {
    id,
    businessId,
    userId: `user-${id}`,
    employeeCode: payload.employeeCode ?? id,
    firstName: payload.firstName ?? "Employee",
    lastName: payload.lastName ?? "",
    phone: payload.phone ?? null,
    email: payload.email ?? null,
    department: payload.department ?? null,
    designation: payload.designation ?? null,
    profileImage: payload.profileImage ?? null,
    lastLogin: null,
    status: payload.status ?? "ACTIVE",
    canLogin: payload.canLogin ?? true,
    canSell: payload.canSell ?? true,
    canManageStock: payload.canManageStock ?? false,
    canManageExpenses: payload.canManageExpenses ?? false,
    canPrintReceipt: payload.canPrintReceipt ?? true,
    deviceId: null,
    user: {
      id: `user-${id}`,
      username: payload.username ?? id,
      status: payload.status ?? "ACTIVE",
      lastLogin: null,
      role: null,
      branch: null
    }
  };
}

export const employeesService = {
  async list(params: EmployeeListParams = {}): Promise<EmployeeListResponse> {
    const { data } = await api.get<EmployeeListResponse>(endpoints.employees.list, { params });
    return data;
  },

  async detail(id: string): Promise<ApiEmployee> {
    const { data } = await api.get<ApiEmployee>(endpoints.employees.detail(id));
    return data;
  },

  async profile(id: string): Promise<EmployeeProfileResponse> {
    const { data } = await api.get<EmployeeProfileResponse>(endpoints.employees.profile(id));
    const currentUserId = useAuthStore.getState().user?.id;
    return data.employee.userId === currentUserId ? augmentSelfProfile(data) : data;
  },

  async myProfile(): Promise<EmployeeProfileResponse> {
    try {
      const { data } = await api.get<EmployeeProfileResponse>(endpoints.employees.myProfile);
      return augmentSelfProfile(data);
    } catch (error) {
      if (isOfflineError(error)) return buildOfflineSelfProfile();
      throw error;
    }
  },

  async sales(id: string, params: EmployeeSalesParams = {}): Promise<EmployeeSalesResponse> {
    const { data } = await api.get<EmployeeSalesResponse>(endpoints.employees.sales(id), { params });
    const currentUserId = useAuthStore.getState().user?.id;
    if (data.employee.userId !== currentUserId) return data;
    return augmentEmployeeSalesResponse(data, await queuedEmployeeSales(params), params);
  },

  async mySales(params: EmployeeSalesParams = {}): Promise<EmployeeSalesResponse> {
    try {
      const { data } = await api.get<EmployeeSalesResponse>(endpoints.employees.mySales, { params });
      return augmentEmployeeSalesResponse(data, await queuedEmployeeSales(params), params);
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      const profile = await buildOfflineSelfProfile();
      const queued = await queuedEmployeeSales(params);
      const limit = params.limit ?? 20;
      const page = params.page ?? 1;
      const data = mergeSales([], queued, limit);
      const completed = queued.filter((sale) => sale.status === "COMPLETED");
      const totalSalesValue = completed.reduce((sum, sale) => sum + moneyValue(sale.totalAmount), 0);
      const totalCollected = completed.reduce((sum, sale) => sum + moneyValue(sale.amountPaid), 0);
      const totalBalanceDue = completed.reduce((sum, sale) => sum + moneyValue(sale.balanceDue), 0);
      return {
        employee: {
          id: profile.employee.id,
          userId: profile.employee.userId,
          employeeCode: profile.employee.employeeCode,
          firstName: profile.employee.firstName,
          lastName: profile.employee.lastName,
          status: profile.employee.status,
          role: profile.employee.user.role?.name ?? null,
          branch: profile.employee.user.branch?.name ?? null
        },
        summary: {
          transactions: queued.length,
          completedSalesCount: completed.length,
          totalSalesValue,
          totalCollected,
          totalBalanceDue,
          averageSaleValue: completed.length > 0 ? totalSalesValue / completed.length : 0
        },
        data: page === 1 ? data : [],
        meta: { page, limit, total: queued.length, totalPages: Math.ceil(queued.length / limit) }
      };
    }
  },

  async printSales(id: string, params: EmployeeSalesParams = {}): Promise<EmployeeSalesPrintResponse> {
    const { data } = await api.get<EmployeeSalesPrintResponse>(endpoints.employees.salesPrint(id), { params });
    return data;
  },

  async printMySales(params: EmployeeSalesParams = {}): Promise<EmployeeSalesPrintResponse> {
    const { data } = await api.get<EmployeeSalesPrintResponse>(endpoints.employees.mySalesPrint, { params });
    return data;
  },

  async create(payload: UpsertEmployeePayload): Promise<ApiEmployee> {
    try {
      const { data } = await api.post<ApiEmployee>(endpoints.employees.create, payload);
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "POST", url: endpoints.employees.create, data: payload }, employeeFallback(businessId, payload));
    }
  },

  async update(id: string, payload: Partial<UpsertEmployeePayload>): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.update(id), payload);
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.employees.update(id), data: payload }, employeeFallback(businessId, payload, id));
    }
  },

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    try {
      const { data } = await api.delete<{ id: string; deleted: true }>(endpoints.employees.delete(id));
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "DELETE", url: endpoints.employees.delete(id) }, { id, deleted: true });
    }
  },

  async setLoginAccess(id: string, canLogin: boolean, reason?: string): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.setLoginAccess(id), { canLogin, reason });
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.employees.setLoginAccess(id), data: { canLogin, reason } }, employeeFallback(businessId, { canLogin }, id));
    }
  },

  async setCreditSalePermissions(
    id: string,
    payload: { canEditCreditSales?: boolean; canDeleteCreditSales?: boolean; reason?: string }
  ): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.creditSalePermissions(id), payload);
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(
        error,
        { method: "PATCH", url: endpoints.employees.creditSalePermissions(id), data: payload },
        employeeFallback(businessId, {}, id)
      );
    }
  },

  async assignRole(id: string, roleId: string): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.assignRole(id), { roleId });
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.employees.assignRole(id), data: { roleId } }, employeeFallback(businessId, {}, id));
    }
  },

  async activate(id: string, reason?: string): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.activate(id), { reason });
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.employees.activate(id), data: { reason } }, employeeFallback(businessId, { status: "ACTIVE" }, id));
    }
  },

  async deactivate(id: string, reason?: string): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.deactivate(id), { reason });
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.employees.deactivate(id), data: { reason } }, employeeFallback(businessId, { status: "INACTIVE" }, id));
    }
  },

  async suspend(id: string, reason?: string): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.suspend(id), { reason });
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.employees.suspend(id), data: { reason } }, employeeFallback(businessId, { status: "SUSPENDED" }, id));
    }
  },

  async terminate(id: string, reason?: string): Promise<ApiEmployee> {
    try {
      const { data } = await api.patch<ApiEmployee>(endpoints.employees.terminate(id), { reason });
      return data;
    } catch (error) {
      const businessId = await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.employees.terminate(id), data: { reason } }, employeeFallback(businessId, { status: "TERMINATED" }, id));
    }
  }
};
