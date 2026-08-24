import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../constants/auth-metadata.constant';
import type { SystemRole } from '../constants/roles.constant';
import { AuthorizationService } from '../services/authorization.service';
import type { RequestUserInterface } from '../interfaces/request-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<SystemRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestUserInterface>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authenticated user is required');
    }

    const roleName =
      user.roleName ??
      (await this.authorizationService.getRoleName(user.roleId));

    if (!roleName || !requiredRoles.includes(roleName as SystemRole)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
