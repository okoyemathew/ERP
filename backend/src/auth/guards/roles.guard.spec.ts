import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../constants/auth-metadata.constant';
import { SYSTEM_ROLES } from '../constants/roles.constant';
import { RolesGuard } from './roles.guard';

const businessId = '11111111-1111-1111-1111-111111111111';
const roleId = '22222222-2222-2222-2222-222222222222';

function context(user: Record<string, unknown> = {}) {
  return {
    getHandler: jest.fn(() => 'handler'),
    getClass: jest.fn(() => 'class'),
    switchToHttp: jest.fn(() => ({
      getRequest: () => ({
        user: {
          id: '33333333-3333-3333-3333-333333333333',
          businessId,
          roleId,
          roleName: 'Cashier',
          ...user,
        },
      }),
    })),
  } as never;
}

function reflector(
  roles: string[],
  permissions: string[] | undefined,
): Pick<Reflector, 'getAllAndOverride'> {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === ROLES_KEY) return roles;
      if (key === PERMISSIONS_KEY) return permissions;
      return undefined;
    }),
  };
}

function authorizationService(hasPermissions = true) {
  return {
    getRoleName: jest.fn(),
    userHasPermissions: jest.fn().mockResolvedValue(hasPermissions),
    employeeHasFallbackPermissions: jest.fn().mockResolvedValue(false),
    hasActiveEmployeeAccount: jest.fn().mockResolvedValue(false),
  };
}

describe('RolesGuard', () => {
  it('allows a custom employee role through non-admin routes when required permissions match', async () => {
    const auth = authorizationService(true);
    const guard = new RolesGuard(
      reflector(
        [SYSTEM_ROLES.CASHIER, SYSTEM_ROLES.SALESPERSON],
        ['sales.manage'],
      ) as Reflector,
      auth as never,
    );

    await expect(
      guard.canActivate(context({ roleName: 'Vendeur' })),
    ).resolves.toBe(true);
    expect(auth.userHasPermissions).toHaveBeenCalledWith(roleId, businessId, [
      'sales.manage',
    ]);
  });

  it('rejects a custom employee role when the route is owner/admin only', async () => {
    const auth = authorizationService(true);
    const guard = new RolesGuard(
      reflector(
        [SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN],
        ['employees.manage'],
      ) as Reflector,
      auth as never,
    );

    await expect(
      guard.canActivate(context({ roleName: 'Vendeur' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.userHasPermissions).not.toHaveBeenCalled();
  });

  it('allows a custom employee role through non-admin role-only routes', async () => {
    const auth = authorizationService(false);
    const guard = new RolesGuard(
      reflector(
        [SYSTEM_ROLES.CASHIER, SYSTEM_ROLES.SALESPERSON],
        undefined,
      ) as Reflector,
      auth as never,
    );

    await expect(
      guard.canActivate(context({ roleName: 'Caissier' })),
    ).resolves.toBe(true);
    expect(auth.userHasPermissions).not.toHaveBeenCalled();
  });

  it('allows a roleless active employee through non-admin routes when employee flags match', async () => {
    const auth = authorizationService(false);
    auth.employeeHasFallbackPermissions.mockResolvedValue(true);
    const guard = new RolesGuard(
      reflector(
        [SYSTEM_ROLES.CASHIER, SYSTEM_ROLES.SALESPERSON],
        ['sales.manage'],
      ) as Reflector,
      auth as never,
    );

    await expect(
      guard.canActivate(context({ roleId: null, roleName: null })),
    ).resolves.toBe(true);
    expect(auth.employeeHasFallbackPermissions).toHaveBeenCalledWith(
      businessId,
      '33333333-3333-3333-3333-333333333333',
      ['sales.manage'],
    );
  });

  it('allows a roleless active employee through non-admin role-only routes', async () => {
    const auth = authorizationService(false);
    auth.hasActiveEmployeeAccount.mockResolvedValue(true);
    const guard = new RolesGuard(
      reflector(
        [SYSTEM_ROLES.CASHIER, SYSTEM_ROLES.SALESPERSON],
        undefined,
      ) as Reflector,
      auth as never,
    );

    await expect(
      guard.canActivate(context({ roleId: null, roleName: null })),
    ).resolves.toBe(true);
    expect(auth.hasActiveEmployeeAccount).toHaveBeenCalledWith(
      businessId,
      '33333333-3333-3333-3333-333333333333',
    );
  });

  it('rejects a roleless user without an active employee account', async () => {
    const auth = authorizationService(false);
    const guard = new RolesGuard(
      reflector(
        [SYSTEM_ROLES.CASHIER, SYSTEM_ROLES.SALESPERSON],
        undefined,
      ) as Reflector,
      auth as never,
    );

    await expect(
      guard.canActivate(context({ roleId: null, roleName: null })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
