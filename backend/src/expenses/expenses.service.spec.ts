import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const expenseId = '22222222-2222-2222-2222-222222222222';
const categoryId = '33333333-3333-3333-3333-333333333333';
const employeeUserId = '44444444-4444-4444-4444-444444444444';
const otherEmployeeUserId = '55555555-5555-5555-5555-555555555555';
const ownerUserId = '66666666-6666-6666-6666-666666666666';

function authUser(id: string, roleName: string): AuthenticatedUser {
  return {
    id,
    username: roleName.toLowerCase(),
    businessId,
    branchId: null,
    roleId: null,
    roleName,
    employeeId: null,
  };
}

function expense(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-08-28T10:00:00.000Z');

  return {
    id: expenseId,
    businessId,
    categoryId,
    userId: employeeUserId,
    expenseNumber: 'EXP-20260828-000001',
    title: 'Fuel',
    description: 'Delivery fuel',
    amount: new Prisma.Decimal(1000),
    expenseDate: now,
    receiptNumber: null,
    vendor: null,
    paymentMethod: PaymentMethod.CARD,
    isSynced: true,
    syncVersion: 1,
    deviceId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    category: {
      id: categoryId,
      name: 'Travel',
      isActive: true,
    },
    user: {
      id: employeeUserId,
      firstName: 'Employee',
      lastName: 'A',
      username: 'employee.a',
    },
    ...overrides,
  };
}

function createPrismaMock() {
  // The service only needs the Prisma methods exercised below; Jest supplies them.
  const prisma: any = {};

  Object.assign(prisma, {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    expenseCategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    expense: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    cashRegister: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    cashRegisterTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  });

  return prisma;
}

describe('ExpensesService employee ownership', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: ExpensesService;
  const employeeA = authUser(employeeUserId, 'Cashier');
  const employeeB = authUser(otherEmployeeUserId, 'Cashier');
  const owner = authUser(ownerUserId, 'Owner');

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ExpensesService(prisma as never);
  });

  it('creates an expense owned by the authenticated employee', async () => {
    const createdExpense = expense();
    prisma.expenseCategory.findFirst.mockResolvedValue({
      id: categoryId,
      businessId,
      isActive: true,
    });
    prisma.expense.count.mockResolvedValue(0);
    prisma.expense.create.mockResolvedValue(createdExpense);
    prisma.expense.findFirst.mockResolvedValue(createdExpense);

    const result = await service.createExpense(
      businessId,
      {
        title: 'Fuel',
        description: 'Delivery fuel',
        amount: 1000,
        categoryId,
        paymentMethod: PaymentMethod.CARD,
      },
      employeeA,
    );

    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId,
          userId: employeeUserId,
          amount: new Prisma.Decimal(1000),
        }),
      }),
    );
    expect(result.recordedBy.id).toBe(employeeUserId);
  });

  it('calculates employee totals from database aggregate groups', async () => {
    prisma.expense.aggregate.mockResolvedValue({
      _count: 1,
      _sum: { amount: new Prisma.Decimal(1000) },
    });
    prisma.expense.groupBy
      .mockResolvedValueOnce([
        {
          categoryId,
          _count: { _all: 1 },
          _sum: { amount: new Prisma.Decimal(1000) },
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentMethod: PaymentMethod.CARD,
          _count: { _all: 1 },
          _sum: { amount: new Prisma.Decimal(1000) },
        },
      ])
      .mockResolvedValueOnce([
        {
          userId: employeeUserId,
          _count: { _all: 1 },
          _sum: { amount: new Prisma.Decimal(1000) },
        },
      ]);
    prisma.expenseCategory.findMany.mockResolvedValue([
      { id: categoryId, name: 'Travel' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: employeeUserId,
        firstName: 'Employee',
        lastName: 'A',
        username: 'employee.a',
        employee: { id: 'emp-a', employeeCode: 'EMP-A' },
      },
    ]);

    const summary = await service.getSummary(businessId, {}, owner);

    expect(Number(summary.totalExpenses)).toBe(1000);
    expect(summary.expensesByEmployee[0]).toEqual(
      expect.objectContaining({
        userId: employeeUserId,
        employeeName: 'Employee A',
        expenseCount: 1,
      }),
    );
    expect(Number(summary.expensesByEmployee[0].totalAmount)).toBe(1000);
  });

  it('allows the creator to update their own expense', async () => {
    const record = expense();
    prisma.expense.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, amount: new Prisma.Decimal(1200) });
    prisma.expense.update.mockResolvedValue({
      ...record,
      amount: new Prisma.Decimal(1200),
    });

    const result = await service.updateExpense(
      businessId,
      expenseId,
      { amount: 1200 },
      employeeA,
    );

    expect(prisma.expense.update).toHaveBeenCalled();
    expect(Number(result.amount)).toBe(1200);
  });

  it('rejects owner updates to an employee expense', async () => {
    prisma.expense.findFirst.mockResolvedValue(expense());

    await expect(
      service.updateExpense(businessId, expenseId, { amount: 1200 }, owner),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('rejects another employee update to the creator expense', async () => {
    prisma.expense.findFirst.mockResolvedValue(expense());

    await expect(
      service.updateExpense(businessId, expenseId, { amount: 1200 }, employeeB),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('allows the creator to delete their own expense', async () => {
    prisma.expense.findFirst.mockResolvedValue(expense());
    prisma.expense.update.mockResolvedValue(expense({ deletedAt: new Date() }));

    const result = await service.removeExpense(businessId, expenseId, employeeA);

    expect(result).toEqual({ id: expenseId, deleted: true });
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('rejects owner deletion of an employee expense', async () => {
    prisma.expense.findFirst.mockResolvedValue(expense());

    await expect(
      service.removeExpense(businessId, expenseId, owner),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('rejects cross-business detail access as not found', async () => {
    prisma.expense.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('77777777-7777-7777-7777-777777777777', expenseId, owner),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
