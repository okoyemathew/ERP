import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
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
    const { data } = await api.post<ApiEmployee>(endpoints.employees.create, payload);
    return data;
  },

  async update(id: string, payload: Partial<UpsertEmployeePayload>): Promise<ApiEmployee> {
    const { data } = await api.patch<ApiEmployee>(endpoints.employees.update(id), payload);
    return data;
  },

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const { data } = await api.delete<{ id: string; deleted: true }>(endpoints.employees.delete(id));
    return data;
  },

  async setLoginAccess(id: string, canLogin: boolean, reason?: string): Promise<ApiEmployee> {
    const { data } = await api.patch<ApiEmployee>(endpoints.employees.setLoginAccess(id), { canLogin, reason });
    return data;
  },

  async assignRole(id: string, roleId: string): Promise<ApiEmployee> {
    const { data } = await api.patch<ApiEmployee>(endpoints.employees.assignRole(id), { roleId });
    return data;
  },

  async activate(id: string, reason?: string): Promise<ApiEmployee> {
    const { data } = await api.patch<ApiEmployee>(endpoints.employees.activate(id), { reason });
    return data;
  },

  async deactivate(id: string, reason?: string): Promise<ApiEmployee> {
    const { data } = await api.patch<ApiEmployee>(endpoints.employees.deactivate(id), { reason });
    return data;
  },

  async suspend(id: string, reason?: string): Promise<ApiEmployee> {
    const { data } = await api.patch<ApiEmployee>(endpoints.employees.suspend(id), { reason });
    return data;
  },

  async terminate(id: string, reason?: string): Promise<ApiEmployee> {
    const { data } = await api.patch<ApiEmployee>(endpoints.employees.terminate(id), { reason });
    return data;
  }
};
