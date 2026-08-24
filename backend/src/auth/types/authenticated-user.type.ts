export type AuthenticatedUser = {
  id: string;
  username: string;
  businessId: string;
  branchId: string | null;
  roleId: string | null;
  roleName: string | null;
  employeeId: string | null;
  sessionId?: string;
};
