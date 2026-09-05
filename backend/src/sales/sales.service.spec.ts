import { BadRequestException } from '@nestjs/common';
import {
  AuditAction,
  CashRegisterStatus,
  CashTransactionType,
  PaymentStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { SalesService } from './sales.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const businessId = '11111111-1111-1111-1111-111111111111';
const employeeUserId = '22222222-2222-2222-2222-222222222222';
const spoofedUserId = '33333333-3333-3333-3333-333333333333';
const productId = '66666666-6666-6666-6666-666666666666';

const authUser: AuthenticatedUser = {
  id: employeeUserId,
  username: 'cashier',
  businessId,
  branchId: null,
  roleId: null,
  roleName: 'Cashier',
  employeeId: '44444444-4444-4444-4444-444444444444',
};

function pendingSale() {
  const now = new Date('2026-08-28T10:00:00.000Z');

  return {
    id: '55555555-5555-5555-5555-555555555555',
    businessId,
    customerId: null,
    userId: employeeUserId,
    saleNumber: 'SALE-000001',
    subtotal: new Prisma.Decimal(0),
    discountAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(0),
    amountPaid: new Prisma.Decimal(0),
    balanceDue: new Prisma.Decimal(0),
    paymentStatus: PaymentStatus.UNPAID,
    status: SaleStatus.PENDING,
    remarks: null,
    idempotencyKey: null,
    saleDate: now,
    isSynced: true,
    syncVersion: 1,
    deviceId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    customer: null,
    user: {
      id: employeeUserId,
      firstName: 'Jane',
      lastName: 'Cashier',
      username: 'cashier',
    },
    items: [],
    payments: [],
    receipt: null,
  };
}

function createPrismaMock() {
  const prisma: any = {};

  Object.assign(prisma, {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    employee: {
      findFirst: jest.fn(),
    },
    sale: {
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    saleItem: {
      findMany: jest.fn(),
    },
    product: {
      findFirst: jest.fn(),
    },
    cashRegister: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cashRegisterTransaction: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  });

  return prisma;
}

describe('SalesService authenticated ownership', () => {
  it('creates sales for the authenticated user, ignoring caller-supplied ownership', async () => {
    const prisma = createPrismaMock();
    const service = new SalesService(prisma as never);
    const sale = pendingSale();

    prisma.employee.findFirst.mockResolvedValue({ id: authUser.employeeId });
    prisma.sale.count.mockResolvedValue(0);
    prisma.sale.create.mockResolvedValue(sale);
    prisma.saleItem.findMany.mockResolvedValue([]);
    prisma.sale.update.mockResolvedValue(sale);
    prisma.sale.findFirst.mockResolvedValue(sale);

    await service.create(
      businessId,
      {
        remarks: 'Counter sale',
        userId: spoofedUserId,
      } as never,
      authUser,
    );

    expect(prisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId,
          userId: employeeUserId,
          remarks: 'Counter sale',
        }),
      }),
    );
    expect(prisma.sale.create.mock.calls[0][0].data.userId).not.toBe(spoofedUserId);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: employeeUserId,
          action: AuditAction.SALE_CREATED,
        }),
      }),
    );
  });
});

describe('SalesService sale item price and quantity validation', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: SalesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new SalesService(prisma as never);
  });

  function sellableProduct(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: productId,
      sellingPrice: new Prisma.Decimal(12000),
      baseSellingPrice: new Prisma.Decimal(10000),
      inventory: {
        businessId,
        quantityAvailable: 100,
        quantityOnHand: 100,
        deletedAt: null,
      },
      ...overrides,
    };
  }

  async function buildItem(quantity: number, unitPrice: number) {
    return (service as unknown as {
      buildItemData: (
        businessId: string,
        dto: { productId: string; quantity: number; unitPrice: number },
        tx: unknown,
      ) => Promise<{
        quantity: number;
        unitPrice: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
      }>;
    }).buildItemData(
      businessId,
      { productId, quantity, unitPrice },
      prisma,
    );
  }

  it('allows selling exactly at base selling price', async () => {
    prisma.product.findFirst.mockResolvedValue(sellableProduct());

    const item = await buildItem(5, 10000);

    expect(Number(item.unitPrice)).toBe(10000);
    expect(Number(item.totalAmount)).toBe(50000);
  });

  it('allows selling above base selling price and calculates quantity totals', async () => {
    prisma.product.findFirst.mockResolvedValue(sellableProduct());

    const item = await buildItem(50, 12000);

    expect(item.quantity).toBe(50);
    expect(Number(item.totalAmount)).toBe(600000);
  });

  it('rejects direct API attempts below base selling price', async () => {
    prisma.product.findFirst.mockResolvedValue(sellableProduct());

    await expect(buildItem(1, 9999)).rejects.toThrow(
      'Sale price is below the allowed selling price.',
    );
  });

  it('keeps stock validation server-side', async () => {
    prisma.product.findFirst.mockResolvedValue(
      sellableProduct({
        inventory: {
          businessId,
          quantityAvailable: 20,
          quantityOnHand: 20,
          deletedAt: null,
        },
      }),
    );

    await expect(buildItem(50, 12000)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stores the actual sale item price independent of later base price changes', async () => {
    prisma.product.findFirst
      .mockResolvedValueOnce(sellableProduct({ baseSellingPrice: new Prisma.Decimal(10000) }))
      .mockResolvedValueOnce(sellableProduct({ baseSellingPrice: new Prisma.Decimal(12000) }));

    const mondayItem = await buildItem(1, 11000);
    const tuesdayItem = await buildItem(1, 12000);

    expect(Number(mondayItem.unitPrice)).toBe(11000);
    expect(Number(tuesdayItem.unitPrice)).toBe(12000);
  });

  it('auto-opens a zero-balance cash register for first cash sale', async () => {
    const openedAt = new Date('2026-08-28T12:00:00.000Z');
    prisma.cashRegister.findFirst.mockResolvedValue(null);
    prisma.cashRegister.create.mockResolvedValue({
      id: '77777777-7777-7777-7777-777777777777',
      openingBalance: new Prisma.Decimal(0),
      expectedBalance: new Prisma.Decimal(0),
    });

    await (service as unknown as {
      recordCashRegisterTransaction: (
        tx: unknown,
        data: {
          businessId: string;
          userId: string;
          transactionType: CashTransactionType;
          amount: Prisma.Decimal;
          reference: string;
          description: string;
          transactionDate: Date;
        },
      ) => Promise<void>;
    }).recordCashRegisterTransaction(prisma, {
      businessId,
      userId: employeeUserId,
      transactionType: CashTransactionType.SALE,
      amount: new Prisma.Decimal(120),
      reference: 'SALE-000001',
      description: 'Cash sale: SALE-000001',
      transactionDate: openedAt,
    });

    expect(prisma.cashRegister.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId,
          userId: employeeUserId,
          openingBalance: new Prisma.Decimal(0),
          expectedBalance: new Prisma.Decimal(0),
          status: CashRegisterStatus.OPEN,
          openedAt,
        }),
      }),
    );
    expect(prisma.cashRegisterTransaction.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          transactionType: CashTransactionType.OPENING_BALANCE,
          amount: new Prisma.Decimal(0),
        }),
      }),
    );
    expect(prisma.cashRegisterTransaction.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          transactionType: CashTransactionType.SALE,
          amount: new Prisma.Decimal(120),
          reference: 'SALE-000001',
        }),
      }),
    );
    expect(prisma.cashRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { expectedBalance: new Prisma.Decimal(120) },
      }),
    );
  });
});
