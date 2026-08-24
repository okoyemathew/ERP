import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

export interface RequestUserInterface extends Request {
  user?: AuthenticatedUser;
  params: Request['params'] & {
    businessId?: string;
  };
}
