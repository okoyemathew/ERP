import type { Role, User } from "./domain.types";

export interface BackendAuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  profileImage?: string | null;
  status?: string;
  businessId: string;
  branchId: string | null;
  roleId: string | null;
  roleName?: string | null;
  employeeId?: string | null;
  permissions?: string[];
}

export interface LoginRequest {
  emailOrPhone: string;
  password: string;
  deviceName?: string;
  deviceId?: string;
  deviceType?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: BackendAuthUser;
}

export interface RegisterOwnerRequest {
  businessName: string;
  businessType?: string;
  businessAddress?: string;
  ownerFullName: string;
  ownerPhone?: string;
  ownerEmail: string;
  password: string;
}

export interface RegisterOwnerResponse {
  success: true;
  message: string;
  businessId: string;
  userId: string;
}

export interface ForgotPasswordRequest {
  emailOrPhone: string;
  channel?: "EMAIL" | "SMS";
}

export interface ForgotPasswordResponse {
  success: true;
  message: string;
  expiresInMinutes: number;
  deliveryChannel?: "EMAIL" | "SMS";
  devToken?: string;
}

export interface ResetPasswordRequest {
  emailOrPhone: string;
  token: string;
  newPassword: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthBusiness {
  id: string;
  name: string;
  about?: string | null;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  logo?: string | null;
  address?: string | null;
  status?: string;
  currency?: string | null;
  timezone?: string | null;
}

export interface AuthRole {
  id: string;
  name: string;
  description: string | null;
}

export interface AuthBranch {
  id: string;
  name: string;
  code: string;
  status: string;
}

export interface AuthProfileResponse {
  user: BackendAuthUser & {
    lastLogin: string | null;
  };
  business: AuthBusiness;
  branch: AuthBranch | null;
  role: AuthRole | null;
  permissions: string[];
  session: {
    id?: string;
  };
}

export interface AuthPermissionsResponse {
  role: AuthRole | null;
  roles: string[];
  permissions: string[];
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthSessionDevice {
  id: string;
  deviceName: string | null;
  deviceId: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  loginAt: string;
  lastActivityAt: string;
  isCurrent: boolean;
}

export interface AuthSessionsResponse {
  data: AuthSessionDevice[];
}

export interface StoredAuthSession {
  user: User;
  business: AuthBusiness | null;
  branch?: AuthBranch | null;
  role?: AuthRole | null;
  sessionId?: string;
  roles: string[];
  permissions: string[];
  accessToken: string;
  refreshToken: string;
}

export function mapBackendRoleToAppRole(roleName?: string | null): Role {
  const normalized = roleName?.trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "administrator" || normalized === "manager") {
    return "owner";
  }

  return "employee";
}

export function mapBackendUserToAppUser(apiUser: BackendAuthUser, accessToken: string): User {
  return {
    id: apiUser.id,
    name: `${apiUser.firstName} ${apiUser.lastName}`.trim() || apiUser.username,
    role: mapBackendRoleToAppRole(apiUser.roleName),
    token: accessToken,
    username: apiUser.username,
    firstName: apiUser.firstName,
    lastName: apiUser.lastName,
    email: apiUser.email ?? null,
    phone: apiUser.phone ?? null,
    profileImage: apiUser.profileImage ?? null,
    status: apiUser.status,
    businessId: apiUser.businessId,
    branchId: apiUser.branchId,
    roleId: apiUser.roleId,
    roleName: apiUser.roleName ?? null,
    employeeId: apiUser.employeeId ?? null,
    permissions: apiUser.permissions ?? []
  };
}
