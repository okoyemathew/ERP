import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  EmployeeStatus,
  SessionStatus,
  UserStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { EmployeeService } from './employee.service';

const businessId = '11111111-1111-1111-1111-111111111111';
const employeeId = '22222222-2222-2222-2222-222222222222';
const employeeUserId = '33333333-3333-3333-3333-333333333333';
const ownerUserId = '44444444-4444-4444-4444-444444444444';

const owner: AuthenticatedUser = {
  id: ownerUserId,
  username: 'owner',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Owner',
  employeeId: '55555555-5555-5555-5555-555555555555',
};

const manager: AuthenticatedUser = {
  ...owner,
  id: '66666666-6666-6666-6666-666666666666',
  username: 'manager',
  roleName: 'Manager',
};

function employee(roleName = 'Cashier', canLogin = true) {
  return {
    id: employeeId,
    businessId,
    userId: employeeUserId,
    employeeCode: 'EMP-001',
    firstName: 'John',
    lastName: 'Doe',
    status: EmployeeStatus.ACTIVE,
    canLogin,
    user: {
      id: employeeUserId,
      password: 'hashed-password',
      status: canLogin ? UserStatus.ACTIVE : UserStatus.INACTIVE,
      role: { name: roleName },
    },
  };
}

function createPrismaMock() {
  const prisma: any = {};

  Object.assign(prisma, {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
    employee: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    userSession: {
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  });

  return prisma;
}

describe('EmployeeService login access', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: EmployeeService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new EmployeeService(prisma as never, {} as never);
  });

  it('lets an owner disable employee login and revokes active sessions', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee());
    prisma.employee.update.mockResolvedValue(employee('Cashier', false));

    const result = await service.setLoginAccess(
      businessId,
      employeeId,
      { canLogin: false },
      owner,
    );

    expect(result.canLogin).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: employeeUserId },
      data: { status: UserStatus.INACTIVE },
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: employeeUserId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, refreshToken: '' },
    });
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: employeeId },
      data: expect.objectContaining({
        canLogin: false,
        isSynced: true,
        syncVersion: { increment: 1 },
      }),
      include: expect.any(Object),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId,
        userId: ownerUserId,
        action: AuditAction.USER_UPDATED,
        entity: 'EmployeeLoginAccess',
        entityId: employeeId,
      }),
    });
  });

  it('lets an owner enable employee login without revoking sessions', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee('Cashier', false));
    prisma.employee.update.mockResolvedValue(employee('Cashier', true));

    const result = await service.setLoginAccess(
      businessId,
      employeeId,
      { canLogin: true },
      owner,
    );

    expect(result.canLogin).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: employeeUserId },
      data: { status: UserStatus.ACTIVE },
    });
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it('rejects non-owner login access changes', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee());

    await expect(
      service.setLoginAccess(
        businessId,
        employeeId,
        { canLogin: false },
        manager,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('rejects changing the signed-in user own login access', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee());

    await expect(
      service.setLoginAccess(
        businessId,
        employeeId,
        { canLogin: false },
        { ...owner, id: employeeUserId, employeeId },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('rejects changing an owner employee profile', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee('Owner'));

    await expect(
      service.setLoginAccess(
        businessId,
        employeeId,
        { canLogin: false },
        owner,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('rejects cross-business or missing employees as not found', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.setLoginAccess(
        '77777777-7777-7777-7777-777777777777',
        employeeId,
        { canLogin: false },
        owner,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });
});
