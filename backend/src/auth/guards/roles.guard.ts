import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../constants/auth-metadata.constant';
import {
  ADMIN_ROLE_NAMES,
  normalizeSystemRoleName,
  type SystemRole,
} from '../constants/roles.constant';
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

    const rawRoleName =
      user.roleName ?? (await this.authorizationService.getRoleName(user.roleId));
    const roleName = normalizeSystemRoleName(rawRoleName);

    if (!roleName || !requiredRoles.includes(roleName)) {
      const requiredPermissions =
        this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? [];

      const isAdminOnlyRoute = requiredRoles.every((role) =>
        ADMIN_ROLE_NAMES.includes(role),
      );

      if (
        !isAdminOnlyRoute &&
        requiredPermissions.length > 0 &&
        (await this.authorizationService.userHasPermissions(
          user.roleId,
          user.businessId,
          requiredPermissions,
        ))
      ) {
        return true;
      }

      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
