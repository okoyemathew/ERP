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
  EMPLOYEE_RESTRICTED_PERMISSIONS,
  SALESPERSON_RESTRICTED_PERMISSIONS,
} from '../constants/restricted-actions.constant';
import { ADMIN_ROLE_NAMES, type SystemRole } from '../constants/roles.constant';
import type { RequestUserInterface } from '../interfaces/request-user.interface';
import { AuthorizationService } from '../services/authorization.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
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

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
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

    this.assertEmployeeRestrictions(context, requiredPermissions, roleName);

    const hasPermissions = await this.authorizationService.userHasPermissions(
      user.roleId,
      user.businessId,
      requiredPermissions,
    );

    if (!hasPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private assertEmployeeRestrictions(
    context: ExecutionContext,
    requiredPermissions: readonly string[],
    roleName: string | null,
  ): void {
    const routeRoles =
      this.reflector.getAllAndOverride<SystemRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const isAdminRole = roleName
      ? ADMIN_ROLE_NAMES.includes(roleName as SystemRole)
      : false;

    if (
      !isAdminRole &&
      routeRoles.length > 0 &&
      routeRoles.every((role) => ADMIN_ROLE_NAMES.includes(role))
    ) {
      throw new ForbiddenException('Employees cannot access admin endpoints');
    }

    const blockedPermission = requiredPermissions.find((permission) =>
      EMPLOYEE_RESTRICTED_PERMISSIONS.has(permission),
    );

    if (!isAdminRole && blockedPermission) {
      throw new ForbiddenException(
        `Action is not allowed: ${blockedPermission}`,
      );
    }

    const salespersonBlockedPermission = requiredPermissions.find(
      (permission) =>
        roleName === 'Salesperson' &&
        SALESPERSON_RESTRICTED_PERMISSIONS.has(permission),
    );

    if (salespersonBlockedPermission) {
      throw new ForbiddenException(
        `Salesperson role is not allowed: ${salespersonBlockedPermission}`,
      );
    }
  }
}
