export interface JwtPayloadInterface {
  sub: string;
  username: string;
  businessId: string;
  branchId: string | null;
  roleId: string | null;
  sessionId?: string;
}
