import { PaymentMethod, Prisma } from '@prisma/client';
import { collectionsBySale, saleCollections } from './sale-collections';

describe('sale collections', () => {
  it('keeps actual dated receipts intact after a return, including fully refunded invoices', async () => {
    const receipt = { id: 'cash', saleId: 'sale', amount: new Prisma.Decimal(50000), paymentDate: new Date('2026-09-24T12:00:00Z'), paymentMethod: PaymentMethod.CASH };
    const prisma = { payment: { findMany: jest.fn().mockResolvedValue([receipt]) }, creditPayment: { findMany: jest.fn().mockResolvedValue([]) }, sale: { findMany: jest.fn() } };
    const rows = await saleCollections(prisma as never, { businessId: 'business' }, {}, undefined, 'received');
    expect(rows).toEqual([receipt]);
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany.mock.calls[0][0].where.sale.AND).toContainEqual({ deletedAt: null, status: { in: ['COMPLETED', 'REFUNDED'] } });
  });
  const day = new Date('2026-09-15T00:00:00Z');
  const end = new Date('2026-09-15T23:59:59.999Z');
  const scope = { businessId: 'business', userId: 'seller' };
  const payment = (id: string, amount: number) => ({
    id,
    saleId: 'invoice',
    amount: new Prisma.Decimal(amount),
    paymentDate: day,
    paymentMethod: PaymentMethod.CASH,
  });

  it('combines upfront money and instalments without counting a credit invoice as money received', async () => {
    const prisma = {
      sale: { findMany: jest.fn().mockResolvedValue([]) },
      payment: {
        findMany: jest.fn().mockResolvedValue([payment('deposit', 100)]),
      },
      creditPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...payment('instalment', 200),
            creditSale: { saleId: 'invoice' },
          },
        ]),
      },
    };
    const rows = await saleCollections(prisma as never, scope, {
      startDate: day,
      endDate: end,
    });
    expect(
      Number(collectionsBySale(rows).get('invoice')?.collectedAmount),
    ).toBe(300);
    const sale = { AND: [scope, { deletedAt: null, status: 'COMPLETED' }] };
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sale,
          paymentDate: { gte: day, lte: end },
          paymentMethod: { not: 'CREDIT' },
          amount: { gt: 0 },
        },
      }),
    );
    expect(prisma.creditPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          creditSale: { sale },
          paymentDate: { gte: day, lte: end },
          paymentMethod: { not: 'CREDIT' },
          amount: { gt: 0 },
        },
      }),
    );
    // There is deliberately no saleDate condition: an old invoice can be paid today.
    expect(
      JSON.stringify(prisma.creditPayment.findMany.mock.calls[0]),
    ).not.toContain('saleDate');
  });

  it('returns no daily sales for unpaid credit and does not report CREDIT tender as cash', async () => {
    const prisma = {
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      creditPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    expect(await saleCollections(prisma as never, scope)).toEqual([]);
    expect(
      await saleCollections(prisma as never, scope, {}, PaymentMethod.CREDIT),
    ).toEqual([]);
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
  });

  it('preserves each instalment date and sums decimal money accurately', () => {
    const later = new Date('2026-09-16T10:00:00Z');
    const rows = [
      payment('first', 0.1),
      { ...payment('second', 0.2), paymentDate: later },
    ];
    const result = collectionsBySale(rows).get('invoice')!;
    expect(result.collectedAmount.toString()).toBe('0.3');
    expect(result.collectionDate).toEqual(later);
    expect(result.collectionPayments.map((row) => row.paymentDate)).toEqual([
      day,
      later,
    ]);
  });

  it.each([45000, 40000, 0])(
    'uses the approved net total %s without altering payment history',
    async (total) => {
      const original = payment('cash', 50000);
      const prisma = {
        payment: { findMany: jest.fn().mockResolvedValue([original]) },
        creditPayment: { findMany: jest.fn().mockResolvedValue([]) },
        sale: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'invoice',
              totalAmount: new Prisma.Decimal(total),
              items: [
                {
                  quantity: 10,
                  totalAmount: new Prisma.Decimal(50000),
                  productReturnRequests: [{ quantity: (50000 - total) / 5000 }],
                },
              ],
              payments: [original],
              creditSale: null,
            },
          ]),
        },
      };
      const rows = await saleCollections(prisma as never, scope, {
        startDate: day,
        endDate: end,
      });
      expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(
        total,
      );
      expect(Number(original.amount)).toBe(50000);
      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productReturnRequests: { some: { status: 'APPROVED' } },
          }),
        }),
      );
    },
  );

  it('allocates a credit return across the full payment history before filtering the reporting day or tender', async () => {
    const deposit = payment('deposit', 30000);
    const later = {
      ...payment('instalment', 20000),
      paymentDate: new Date('2026-09-16T10:00:00Z'),
      paymentMethod: PaymentMethod.CARD,
    };
    const prisma = {
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      creditPayment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ ...later, creditSale: { saleId: 'invoice' } }]),
      },
      sale: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'invoice',
            totalAmount: new Prisma.Decimal(50000),
            items: [
              {
                quantity: 10,
                totalAmount: new Prisma.Decimal(50000),
                productReturnRequests: [{ quantity: 1 }],
              },
            ],
            payments: [deposit],
            creditSale: { payments: [later] },
          },
        ]),
      },
    };
    const rows = await saleCollections(
      prisma as never,
      scope,
      { startDate: later.paymentDate },
      PaymentMethod.CARD,
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(15000);
    expect(rows[0].paymentDate).toEqual(later.paymentDate);
    expect(rows[0].paymentMethod).toBe(PaymentMethod.CARD);
  });

  it('reduces unpaid credit before reducing money already collected', async () => {
    const deposit = payment('deposit', 10000);
    const prisma = {
      payment: { findMany: jest.fn().mockResolvedValue([deposit]) },
      creditPayment: { findMany: jest.fn().mockResolvedValue([]) },
      sale: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'invoice',
            totalAmount: new Prisma.Decimal(50000),
            items: [
              {
                quantity: 10,
                totalAmount: new Prisma.Decimal(50000),
                productReturnRequests: [{ quantity: 1 }],
              },
            ],
            payments: [deposit],
            creditSale: { payments: [] },
          },
        ]),
      },
    };
    const rows = await saleCollections(prisma as never, scope);
    expect(Number(rows[0].amount)).toBe(10000);
  });
});
