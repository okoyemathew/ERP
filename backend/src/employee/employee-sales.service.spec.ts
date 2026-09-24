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
        productReturnRequests: [],
        product: {
          purchasePrice: new Prisma.Decimal(300),
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
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    creditPayment: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('shows only a later instalment in daily sales while preserving the invoice total', async () => {
    const invoice = sale({ amountPaid: new Prisma.Decimal(300), balanceDue: new Prisma.Decimal(700) });
    const paidAt = new Date('2026-09-15T10:00:00Z');
    prisma.creditPayment.findMany.mockResolvedValue([{ id: 'payment', creditSale: { saleId: invoice.id }, amount: new Prisma.Decimal(300), paymentDate: paidAt, paymentMethod: PaymentMethod.CASH }]);
    prisma.sale.findMany.mockResolvedValueOnce([]).mockResolvedValue([invoice]);
    const response = await service.getSales(businessId, employeeId, { basis: 'collections', startDate: new Date('2026-09-15T00:00:00Z') });
    expect(Number(response.summary.totalSalesValue)).toBe(300);
    expect(Number(response.data[0].totalAmount)).toBe(1000);
    expect(response.data[0]).toEqual(expect.objectContaining({ collectedAmount: new Prisma.Decimal(300), collectionDate: paidAt }));
    expect(JSON.stringify(prisma.creditPayment.findMany.mock.calls[0])).toContain(userId);
    expect(JSON.stringify(prisma.creditPayment.findMany.mock.calls[0])).not.toContain('saleDate');
  });

  it('prints unpaid legacy credit invoices with the real balance and no record limit', async () => {
    prisma.business.findUnique.mockResolvedValue({ name: 'Store', currency: 'XAF' });
    prisma.sale.aggregate.mockResolvedValue({ _count: { id: 1 }, _sum: { totalAmount: new Prisma.Decimal(1000), amountPaid: new Prisma.Decimal(1000), balanceDue: new Prisma.Decimal(0) } });
    prisma.sale.findMany.mockResolvedValue([sale({ payments: [], creditSale: { balance: new Prisma.Decimal(1000), amountPaid: new Prisma.Decimal(0) } })]);
    const response = await service.printSalesRecord(businessId, employeeId);
    expect(Number(response.data.summary.totalSalesValue)).toBe(1000);
    expect(Number(response.data.summary.totalCollected)).toBe(0);
    expect(Number(response.data.summary.totalBalanceDue)).toBe(1000);
    expect(prisma.sale.findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it('rejects cross-business employee sales access as not found', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.getSales('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', employeeId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calculates today profit independently of historical searches and excludes other days', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 24, 12));
    try {
      const yesterday = sale({ saleDate: new Date(2026, 8, 23, 23, 59, 59), payments: [],
        creditSale: { id: 'credit', deletedAt: null, amountPaid: new Prisma.Decimal(0) } });
      const midnight = sale({ saleDate: new Date(2026, 8, 24) });
      const returned = sale({ saleDate: new Date(2026, 8, 24, 23, 59, 59),
        items: [{ ...sale().items[0], productReturnRequests: [{ quantity: 1 }] }] });
      const tomorrow = sale({ saleDate: new Date(2026, 8, 25) });
      const invoices = [yesterday, midnight, returned, tomorrow];
      prisma.sale.count.mockResolvedValue(4);
      prisma.sale.aggregate.mockResolvedValue({ _sum: {}, _avg: {} });
      prisma.sale.findMany.mockImplementation(async (args) => {
        if (!args.select) return [sale()];
        const range = args.where.saleDate;
        return range?.lt ? invoices.filter((invoice) => invoice.saleDate >= range.gte && invoice.saleDate < range.lt) : invoices;
      });
      const response = await service.getSales(businessId, employeeId, {
        basis: 'invoices', page: 2, limit: 1, search: 'old invoice', startDate: new Date(2026, 7, 1),
      });
      expect(Number(response.summary.todayProfit)).toBe(600);
      expect(Number(response.summary.totalCreditSales)).toBe(1000);
      expect(prisma.sale.findMany.mock.calls[2][0].where).toEqual({ businessId, userId, deletedAt: null, status: 'COMPLETED',
        saleDate: { gte: new Date(2026, 8, 24), lt: new Date(2026, 8, 25) } });
    } finally { jest.useRealTimers(); }
  });

  it('totals unpaid credit and gross profit across all matching invoices, after returns and repayments', async () => {
    const credit = sale({
      payments: [{ paymentMethod: PaymentMethod.CASH, amount: new Prisma.Decimal(100) }],
      creditSale: { id: 'credit', deletedAt: null, amountPaid: new Prisma.Decimal(200) },
      items: [{ quantity: 2, totalAmount: new Prisma.Decimal(1100), taxAmount: new Prisma.Decimal(100),
        product: { purchasePrice: new Prisma.Decimal(300) }, productReturnRequests: [{ quantity: 1 }] }],
    });
    const loss = sale({
      items: [{ quantity: 1, totalAmount: new Prisma.Decimal(100), taxAmount: new Prisma.Decimal(0),
        product: { purchasePrice: new Prisma.Decimal(150) }, productReturnRequests: [] }],
    });
    prisma.sale.count.mockResolvedValue(2);
    prisma.sale.aggregate.mockResolvedValue({ _sum: {}, _avg: {} });
    // Only one row is shown on the requested page, but both invoices count.
    prisma.sale.findMany.mockResolvedValueOnce([sale()]).mockResolvedValueOnce([credit, loss]).mockResolvedValue([]);
    const startDate = new Date('2026-09-01T00:00:00Z');
    const response = await service.getSales(businessId, employeeId, { basis: 'invoices', page: 2, limit: 1, startDate });
    expect(Number(response.summary.totalCreditSales)).toBe(250); // 550 net invoice - 100 deposit - 200 repaid
    expect(Number(response.summary.totalProfit)).toBe(150); // (550 - 50 tax - 300 cost) + (100 - 150)
    const totalsQuery = prisma.sale.findMany.mock.calls[1][0];
    expect(totalsQuery).not.toHaveProperty('skip');
    expect(totalsQuery).not.toHaveProperty('take');
    expect(totalsQuery.where).toEqual(expect.objectContaining({ businessId, userId, deletedAt: null, status: 'COMPLETED', saleDate: { gte: startDate } }));
    expect(totalsQuery.select.items.select.productReturnRequests.where).toEqual({ status: 'APPROVED' });
  });

  it.each([
    { paid: 0, returned: 0, expectedCredit: 1000, expectedProfit: 400 },
    { paid: 1000, returned: 0, expectedCredit: 0, expectedProfit: 400 },
    { paid: 1000, returned: 2, expectedCredit: 0, expectedProfit: 0 },
  ])('handles credit balance with paid=$paid and returned=$returned', async ({ paid, returned, expectedCredit, expectedProfit }) => {
    const original = sale();
    const invoice = sale({ payments: [], creditSale: { id: 'credit', deletedAt: null, amountPaid: new Prisma.Decimal(paid) },
      items: [{ ...original.items[0], productReturnRequests: returned ? [{ quantity: returned }] : [] }] });
    prisma.sale.count.mockResolvedValue(1);
    prisma.sale.aggregate.mockResolvedValue({ _sum: {}, _avg: {} });
    prisma.sale.findMany.mockResolvedValue([invoice]);
    const response = await service.getSales(businessId, employeeId, { basis: 'invoices' });
    expect(Number(response.summary.totalCreditSales)).toBe(expectedCredit);
    expect(Number(response.summary.totalProfit)).toBe(expectedProfit);
  });

  it('includes unpaid credit invoices in the owner employee-profile sales list', async () => {
    const invoice = sale({
      amountPaid: new Prisma.Decimal(0), balanceDue: new Prisma.Decimal(1000),
      paymentStatus: 'UNPAID', payments: [],
      creditSale: { balance: new Prisma.Decimal(1000), amountPaid: new Prisma.Decimal(0) },
    });
    prisma.sale.count.mockResolvedValue(1);
    prisma.sale.aggregate.mockResolvedValue({
      _sum: { totalAmount: invoice.totalAmount, amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue },
      _avg: { totalAmount: invoice.totalAmount },
    });
    prisma.sale.findMany.mockResolvedValue([invoice]);
    const result = await service.getSales(businessId, employeeId, { basis: 'invoices' });
    expect(result.data).toHaveLength(1);
    expect(Number(result.data[0].amountPaid)).toBe(0);
    expect(Number(result.data[0].balanceDue)).toBe(1000);
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId, userId }),
    }));
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });
});
