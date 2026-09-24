import { PaymentMethod, Prisma } from '@prisma/client';
import { BusinessDashboardService } from './business-dashboard.service';
import { BusinessService } from './business.service';

describe('dashboard approved returns', () => {
  it('reports 45000 after a 5000 return on a 50000 paid sale', async () => {
    const payment = {
      id: 'payment',
      saleId: 'sale',
      amount: new Prisma.Decimal(50000),
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
    };
    const count = () => ({ count: jest.fn().mockResolvedValue(1) });
    const prisma = {
      business: { findUnique: jest.fn().mockResolvedValue({ id: 'business' }) },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      creditSale: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 0 } }),
      },
      customer: count(),
      supplier: count(),
      inventory: count(),
      branch: count(),
      user: count(),
      payment: { findMany: jest.fn().mockResolvedValue([payment]) },
      creditPayment: { findMany: jest.fn().mockResolvedValue([]) },
      sale: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sale',
            totalAmount: new Prisma.Decimal(50000),
            items: [
              {
                quantity: 10,
                totalAmount: new Prisma.Decimal(50000),
                productReturnRequests: [{ quantity: 1 }],
              },
            ],
            payments: [payment],
            creditSale: null,
          },
        ]),
      },
    };
    const summary = await new BusinessDashboardService(
      prisma as never,
    ).getSummary('business');
    expect(summary.totalRevenueToday).toBe(45000);
    expect(summary.totalPaymentsToday).toBe(50000);
    expect(summary.totalSalesToday).toBe(1);

    // Exercise the service actually wired to /businesses/:id/dashboard/*.
    const routedPrisma = {
      ...prisma,
      product: count(),
      $queryRaw: jest.fn().mockResolvedValue([]),
      expense: { ...prisma.expense, findMany: jest.fn().mockResolvedValue([]) },
      payment: {
        ...prisma.payment,
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(50000) } }),
      },
      creditPayment: {
        ...prisma.creditPayment,
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      sale: {
        aggregate: jest
          .fn()
          .mockResolvedValue({
            _count: 1,
            _sum: { totalAmount: new Prisma.Decimal(45000) },
          }),
        findMany: jest
          .fn()
          .mockImplementation((args) =>
            args.select
              ? prisma.sale.findMany()
              : Promise.resolve([
                  {
                    id: 'sale',
                    saleNumber: 'SALE-1',
                    customer: null,
                    items: [{ id: 'item' }],
                    user: {
                      id: 'owner',
                      firstName: 'Owner',
                      lastName: '',
                      username: 'owner',
                    },
                  },
                ]),
          ),
      },
    };
    const service = new BusinessService(
      routedPrisma as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service as any, 'ensureBusinessAccess')
      .mockResolvedValue({ id: 'business' });
    const routedSummary = await service.getDashboardSummary('business', {
      id: 'owner',
    } as never);
    expect(routedSummary.totalRevenueToday).toBe(45000);
    expect(routedSummary.totalPaymentsToday).toBe(50000);
    expect(routedSummary.recentSales[0].totalAmount).toBe(45000);
    const statistics = await service.getDashboardStatistics('business', {
      id: 'owner',
    } as never);
    expect(
      statistics.salesLast7Days.reduce((sum, row) => sum + row.revenue, 0),
    ).toBe(45000);
    expect(
      statistics.paymentsLast7Days.reduce((sum, row) => sum + row.amount, 0),
    ).toBe(50000);
  });
});
