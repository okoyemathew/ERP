import type { JwtPayloadInterface } from '../interfaces/jwt-payload.interface';

export type JwtPayload = JwtPayloadInterface & {
  sub: string;
  username: string;
  businessId: string;
  branchId: string | null;
  roleId: string | null;
  sessionId?: string;
};
