import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../constants/auth-metadata.constant';
import type { RequestUserInterface } from '../interfaces/request-user.interface';

@Injectable()
export class BusinessAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestUserInterface>();
    const routeBusinessId = request.params?.businessId;

    if (!routeBusinessId) {
      return true;
    }

    if (!request.user || request.user.businessId !== routeBusinessId) {
      throw new ForbiddenException('Access denied to this business');
    }

    return true;
  }
}
