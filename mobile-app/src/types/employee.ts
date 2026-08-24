export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "TERMINATED";

export interface ApiRole {
  id: string;
  name: string;
  description: string | null;
  permissions?: string[];
}

export interface ApiEmployee {
  id: string;
  businessId: string;
  userId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
  profileImage: string | null;
  lastLogin: string | null;
  status: EmployeeStatus;
  canLogin: boolean;
  canSell: boolean;
  canManageStock: boolean;
  canManageExpenses: boolean;
  canPrintReceipt: boolean;
  deviceId: string | null;
  user: {
    id: string;
    username: string;
    status: string;
    lastLogin: string | null;
    role: ApiRole | null;
    branch: { id: string; name: string; code: string } | null;
  };
}

export interface EmployeeListResponse {
  data: ApiEmployee[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface EmployeeProfileResponse {
  employee: ApiEmployee;
  summary: {
    salesCount: number;
    paymentsCount: number;
    expensesCount: number;
    activeSessions: number;
  };
  recentSessions: Array<{
    id: string;
    deviceName: string | null;
    deviceId: string | null;
    deviceType: string | null;
    ipAddress: string | null;
    status: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface UpsertEmployeePayload {
  employeeCode: string;
  firstName: string;
  lastName: string;
  username: string;
  password?: string;
  roleId?: string;
  branchId?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  department?: string;
  designation?: string;
  profileImage?: string;
  status?: EmployeeStatus;
  canLogin?: boolean;
  canSell?: boolean;
  canManageStock?: boolean;
  canManageExpenses?: boolean;
  canPrintReceipt?: boolean;
}
