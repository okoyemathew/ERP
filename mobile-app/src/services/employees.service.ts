import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { getRequiredBusinessId } from "@/api/session";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import type {
  ApiEmployee,
  EmployeeListResponse,
  EmployeeProfileResponse,
  EmployeeSalesPrintResponse,
  EmployeeSalesResponse,
  EmployeeStatus,
  UpsertEmployeePayload
} from "@/types/employee";

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
    return data;
  },

  async myProfile(): Promise<EmployeeProfileResponse> {
    const { data } = await api.get<EmployeeProfileResponse>(endpoints.employees.myProfile);
    return data;
  },

  async sales(id: string, params: EmployeeSalesParams = {}): Promise<EmployeeSalesResponse> {
    const { data } = await api.get<EmployeeSalesResponse>(endpoints.employees.sales(id), { params });
    return data;
  },

  async printSales(id: string, params: EmployeeSalesParams = {}): Promise<EmployeeSalesPrintResponse> {
    const { data } = await api.get<EmployeeSalesPrintResponse>(endpoints.employees.salesPrint(id), { params });
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
