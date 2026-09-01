import { NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, SaleStatus } from '@prisma/client';
import { EmployeeService } from './employee.service';

const businessId = '11111111-1111-1111-1111-111111111111';
const employeeId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
const otherUserId = '44444444-4444-4444-4444-444444444444';

const employee = {
  id: employeeId,
  businessId,
  userId,
  employeeCode: 'EMP-001',
  firstName: 'John',
  lastName: 'Doe',
  status: 'ACTIVE',
  lastLogin: null,
  user: {
    id: userId,
    username: 'john.doe',
    lastLogin: null,
    status: 'ACTIVE',
    role: { name: 'Cashier' },
    branch: { name: 'Main' },
  },
};

function sale(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-08-28T10:00:00.000Z');

  return {
    id: '55555555-5555-5555-5555-555555555555',
    businessId,
    customerId: null,
    userId,
    saleNumber: 'SALE-000001',
    subtotal: new Prisma.Decimal(1000),
    discountAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(1000),
    amountPaid: new Prisma.Decimal(1000),
    balanceDue: new Prisma.Decimal(0),
    paymentStatus: 'PAID',
    status: SaleStatus.COMPLETED,
    remarks: null,
    idempotencyKey: null,
    saleDate: now,
    isSynced: true,
    syncVersion: 1,
    deviceId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    customer: {
      id: '66666666-6666-6666-6666-666666666666',
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: null,
      phone: '9999999999',
    },
    user: {
      id: userId,
      firstName: 'John',
      lastName: 'Doe',
      username: 'john.doe',
    },
    items: [
      {
        id: '77777777-7777-7777-7777-777777777777',
        productId: '88888888-8888-8888-8888-888888888888',
        quantity: 2,
        unitPrice: new Prisma.Decimal(500),
        discountAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(1000),
        product: {
          id: '88888888-8888-8888-8888-888888888888',
          name: 'Coca Cola',
          sku: 'SKU-COCA',
          barcode: '123456',
        },
      },
    ],
    payments: [
      {
        id: '99999999-9999-9999-9999-999999999999',
        paymentMethod: PaymentMethod.CASH,
        amount: new Prisma.Decimal(1000),
        referenceNumber: null,
        paymentDate: now,
      },
    ],
    receipt: {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      receiptNumber: 'RCT-SALE-000001',
    },
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    employee: {
      findFirst: jest.fn(),
    },
    sale: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    business: {
      findUnique: jest.fn(),
    },
  };
}

describe('EmployeeService sales reporting', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: EmployeeService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new EmployeeService(prisma as never, {} as never);
    prisma.employee.findFirst.mockResolvedValue(employee);
  });

  it('lists sales for the selected employee user and calculates completed totals', async () => {
    prisma.sale.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.sale.aggregate.mockResolvedValue({
      _sum: {
        totalAmount: new Prisma.Decimal(1000),
        amountPaid: new Prisma.Decimal(1000),
        balanceDue: new Prisma.Decimal(0),
      },
      _avg: { totalAmount: new Prisma.Decimal(1000) },
    });
    prisma.sale.findMany.mockResolvedValue([sale()]);

    const response = await service.getSales(businessId, employeeId, {
      search: 'Ada',
      paymentMethod: PaymentMethod.CASH,
    });

    expect(prisma.sale.count).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ businessId, userId }),
      }),
    );
    expect(prisma.sale.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          businessId,
          userId,
          status: SaleStatus.COMPLETED,
        }),
      }),
    );
    expect(JSON.stringify(prisma.sale.findMany.mock.calls[0][0].where)).not.toContain(otherUserId);
    expect(response.employee.userId).toBe(userId);
    expect(response.summary.completedSalesCount).toBe(1);
    expect(Number(response.summary.totalSalesValue)).toBe(1000);
    expect(response.data[0].items[0].product.name).toBe('Coca Cola');
  });

  it('prints a completed sales record for the selected employee', async () => {
    prisma.business.findUnique.mockResolvedValue({
      name: 'Smart Store',
      address: 'Main Road',
      phone: '12345',
      currency: 'XAF',
    });
    prisma.sale.aggregate.mockResolvedValue({
      _count: { id: 1 },
      _sum: {
        totalAmount: new Prisma.Decimal(1000),
        amountPaid: new Prisma.Decimal(1000),
        balanceDue: new Prisma.Decimal(0),
      },
    });
    prisma.sale.findMany.mockResolvedValue([sale()]);

    const response = await service.printSalesRecord(businessId, employeeId, {});

    expect(prisma.sale.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId,
          userId,
          status: SaleStatus.COMPLETED,
        }),
      }),
    );
    expect(response.text).toContain('Employee Sales Record');
    expect(response.text).toContain('Employee: John Doe');
    expect(response.text).toContain('SALE-000001');
    expect(response.text).toContain('FCFA 1,000');
  });

  it('rejects cross-business employee sales access as not found', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.getSales('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', employeeId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
