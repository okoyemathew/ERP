import { PaymentMethod, Prisma } from '@prisma/client';
import { collectionsBySale, saleCollections } from './sale-collections';

describe('sale collections', () => {
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
      payment: {
        findMany: jest.fn().mockResolvedValue([payment('deposit', 100)]),
      },
      creditPayment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
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
});
