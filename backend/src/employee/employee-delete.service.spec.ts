import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditAction, EmployeeStatus, SessionStatus, UserStatus } from '@prisma/client';
import { EmployeeService } from './employee.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

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

function employee(roleName = 'Cashier') {
  return {
    id: employeeId,
    businessId,
    userId: employeeUserId,
    employeeCode: 'EMP-001',
    firstName: 'John',
    lastName: 'Doe',
    status: EmployeeStatus.ACTIVE,
    canLogin: true,
    user: {
      id: employeeUserId,
      status: UserStatus.ACTIVE,
      role: { name: roleName },
    },
  };
}

function createPrismaMock() {
  const prisma: any = {};

  Object.assign(prisma, {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
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

describe('EmployeeService delete employee', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: EmployeeService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new EmployeeService(prisma as never, {} as never);
  });

  it('soft deletes an employee, disables login, and revokes active sessions', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee());
    prisma.employee.update.mockResolvedValue(employee());

    const result = await service.remove(businessId, employeeId, owner);

    expect(result).toEqual({ id: employeeId, deleted: true });
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
        status: EmployeeStatus.TERMINATED,
        canLogin: false,
        deletedAt: expect.any(Date),
        isSynced: true,
        syncVersion: { increment: 1 },
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId,
        userId: ownerUserId,
        action: AuditAction.USER_DELETED,
        entity: 'Employee',
        entityId: employeeId,
      }),
    });
  });

  it('rejects deleting the signed-in user own employee profile', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee());

    await expect(
      service.remove(businessId, employeeId, {
        ...owner,
        id: employeeUserId,
        employeeId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('rejects deleting an Owner employee profile', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee('Owner'));

    await expect(service.remove(businessId, employeeId, owner)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('rejects cross-business or missing employee deletion as not found', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.remove('66666666-6666-6666-6666-666666666666', employeeId, owner),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });
});
