import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../constants/auth-metadata.constant';
import { SYSTEM_ROLES } from '../constants/roles.constant';
import { PermissionsGuard } from './permissions.guard';

const businessId = '11111111-1111-1111-1111-111111111111';
const userId = '33333333-3333-3333-3333-333333333333';

function context(user: Record<string, unknown> = {}) {
  return {
    getHandler: jest.fn(() => 'handler'),
    getClass: jest.fn(() => 'class'),
    switchToHttp: jest.fn(() => ({
      getRequest: () => ({
        user: {
          id: userId,
          businessId,
          roleId: null,
          roleName: null,
          ...user,
        },
      }),
    })),
  } as never;
}

function reflector(
  permissions: string[],
  roles: string[] = [SYSTEM_ROLES.CASHIER, SYSTEM_ROLES.SALESPERSON],
): Pick<Reflector, 'getAllAndOverride'> {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === PERMISSIONS_KEY) return permissions;
      if (key === ROLES_KEY) return roles;
      return undefined;
    }),
  };
}

function authorizationService() {
  return {
    getRoleName: jest.fn().mockResolvedValue(null),
    userHasPermissions: jest.fn().mockResolvedValue(false),
    employeeHasFallbackPermissions: jest.fn().mockResolvedValue(false),
  };
}

describe('PermissionsGuard', () => {
  it('allows a roleless active employee when employee flags satisfy the permission', async () => {
    const auth = authorizationService();
    auth.employeeHasFallbackPermissions.mockResolvedValue(true);
    const guard = new PermissionsGuard(
      reflector(['sales.manage']) as Reflector,
      auth as never,
    );

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(auth.employeeHasFallbackPermissions).toHaveBeenCalledWith(
      businessId,
      userId,
      ['sales.manage'],
    );
  });

  it('does not let a roleless employee use owner/admin-only permissions', async () => {
    const auth = authorizationService();
    auth.employeeHasFallbackPermissions.mockResolvedValue(true);
    const guard = new PermissionsGuard(
      reflector(
        ['employees.manage'],
        [SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN],
      ) as Reflector,
      auth as never,
    );

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auth.employeeHasFallbackPermissions).not.toHaveBeenCalled();
  });
});
