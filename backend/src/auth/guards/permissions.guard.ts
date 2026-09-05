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
import {
  ADMIN_ROLE_NAMES,
  normalizeSystemRoleName,
  SYSTEM_ROLES,
  type SystemRole,
} from '../constants/roles.constant';
import type { RequestUserInterface } from '../interfaces/request-user.interface';
import { AuthorizationService } from '../services/authorization.service';

const BUILT_IN_ROLE_PERMISSIONS: Partial<Record<SystemRole, readonly string[]>> =
  {
    [SYSTEM_ROLES.ADMIN]: [
      'dashboard.view',
      'users.manage',
      'employees.manage',
      'roles.manage',
      'products.manage',
      'categories.manage',
      'brands.manage',
      'units.manage',
      'inventory.manage',
      'suppliers.manage',
      'customers.manage',
      'sales.manage',
      'credit-sales.manage',
      'expenses.manage',
      'reports.view',
      'notifications.manage',
      'settings.manage',
      'receipt.manage',
      'goods-supplied.manage',
      'goods-disbursement.manage',
      'audit-logs.view',
    ],
    [SYSTEM_ROLES.MANAGER]: [
      'sales.manage',
      'inventory.manage',
      'customers.manage',
      'reports.view',
      'receipt.manage',
    ],
    [SYSTEM_ROLES.CASHIER]: [
      'sales.manage',
      'receipt.manage',
      'customers.manage',
    ],
    [SYSTEM_ROLES.SALESPERSON]: ['sales.manage', 'receipt.manage'],
    [SYSTEM_ROLES.INVENTORY_OFFICER]: [
      'inventory.manage',
      'goods-supplied.manage',
      'goods-disbursement.manage',
    ],
    [SYSTEM_ROLES.ACCOUNTANT]: [
      'expenses.manage',
      'reports.view',
      'credit-sales.manage',
    ],
    [SYSTEM_ROLES.SUPERVISOR]: [
      'reports.view',
      'inventory.manage',
      'sales.manage',
      'receipt.manage',
    ],
  };

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

    const roleName = normalizeSystemRoleName(
      user.roleName ??
        (await this.authorizationService.getRoleName(user.roleId)),
    );

    this.assertEmployeeRestrictions(context, requiredPermissions, roleName);

    if (roleName === SYSTEM_ROLES.OWNER) {
      return true;
    }

    const hasPermissions = await this.authorizationService.userHasPermissions(
      user.roleId,
      user.businessId,
      requiredPermissions,
    );

    if (
      !hasPermissions &&
      !this.builtInRoleHasPermissions(roleName, requiredPermissions)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private builtInRoleHasPermissions(
    roleName: SystemRole | null,
    requiredPermissions: readonly string[],
  ): boolean {
    if (!roleName) {
      return false;
    }

    const rolePermissions =
      BUILT_IN_ROLE_PERMISSIONS[roleName] ?? [];

    return requiredPermissions.every((permission) =>
      rolePermissions.includes(permission),
    );
  }

  private assertEmployeeRestrictions(
    context: ExecutionContext,
    requiredPermissions: readonly string[],
    roleName: SystemRole | null,
  ): void {
    const routeRoles =
      this.reflector.getAllAndOverride<SystemRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const isAdminRole = roleName ? ADMIN_ROLE_NAMES.includes(roleName) : false;

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
        roleName === SYSTEM_ROLES.SALESPERSON &&
        SALESPERSON_RESTRICTED_PERMISSIONS.has(permission),
    );

    if (salespersonBlockedPermission) {
      throw new ForbiddenException(
        `Salesperson role is not allowed: ${salespersonBlockedPermission}`,
      );
    }
  }
}
