import { PaymentMethod, Prisma } from '@prisma/client';
import { ReportsService } from './reports.service';

describe('daily sales collection report', () => {
  it('reports the approved net sale amount in daily totals and payment breakdown', async () => {
    const payment = {
      id: 'cash',
      saleId: 'sale',
      amount: new Prisma.Decimal(50000),
      paymentDate: new Date('2026-09-24T10:00:00Z'),
      paymentMethod: PaymentMethod.CASH,
    };
    const prisma = {
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
    const service = new ReportsService(prisma as never);
    const internals = service as any;
    jest.spyOn(internals, 'getBusinessTimezone').mockResolvedValue('UTC');
    jest
      .spyOn(internals, 'scopeUserQuery')
      .mockImplementation((query) => query);
    jest.spyOn(internals, 'auditReportAccess').mockResolvedValue(undefined);
    jest
      .spyOn(internals, 'salesSummary')
      .mockResolvedValue({ totalSales: '45000.00' });
    jest.spyOn(internals, 'paymentBreakdown').mockResolvedValue([]);
    jest.spyOn(internals, 'periodSalesData').mockResolvedValue([]);
    const report = await service.getDailySalesReport(
      'business',
      {
        startDate: new Date('2026-09-24T00:00:00Z'),
        endDate: new Date('2026-09-24T23:59:59.999Z'),
      },
      { id: 'owner' } as never,
    );
    expect(Number(report.summary.totalSales)).toBe(45000);
    expect(Number(report.data[0].totalSales)).toBe(45000);
    expect(
      Number(
        report.paymentBreakdown.find((row) => row.paymentMethod === 'CASH')
          ?.totalAmount,
      ),
    ).toBe(45000);
  });

  it('reports payments in their business day and retains full credit invoices for export', async () => {
    const prisma = {
      sale: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      creditPayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'part-1',
            amount: new Prisma.Decimal(250),
            paymentDate: new Date('2026-09-14T20:00:00Z'),
            paymentMethod: PaymentMethod.CASH,
            creditSale: { saleId: 'old-invoice' },
          },
          {
            id: 'part-2',
            amount: new Prisma.Decimal(100),
            paymentDate: new Date('2026-09-15T10:00:00Z'),
            paymentMethod: PaymentMethod.CARD,
            creditSale: { saleId: 'old-invoice' },
          },
        ]),
      },
    };
    const service = new ReportsService(prisma as never);
    const internals = service as any;
    jest
      .spyOn(internals, 'getBusinessTimezone')
      .mockResolvedValue('Asia/Kolkata');
    jest
      .spyOn(internals, 'scopeUserQuery')
      .mockImplementation((query) => query);
    jest.spyOn(internals, 'auditReportAccess').mockResolvedValue(undefined);
    const invoices = {
      totalSales: '1000.00',
      amountPaid: '0.00',
      outstandingAmount: '1000.00',
      transactionCount: 1,
    };
    jest.spyOn(internals, 'salesSummary').mockResolvedValue(invoices);
    jest.spyOn(internals, 'paymentBreakdown').mockResolvedValue([]);
    jest
      .spyOn(internals, 'periodSalesData')
      .mockResolvedValue([{ totalSales: '1000.00' }]);

    const report = await service.getDailySalesReport(
      'business',
      {
        startDate: new Date('2026-09-14T18:30:00Z'),
        endDate: new Date('2026-09-15T18:29:59.999Z'),
      },
      { id: 'owner' } as never,
    );

    expect(Number(report.summary.totalSales)).toBe(350);
    expect(report.summary.transactionCount).toBe(1);
    expect(report.invoiceSummary).toEqual(invoices);
    expect(report.data).toHaveLength(1);
    expect(report.data[0].periodStart).toBe('2026-09-15T00:00:00.000Z');
    expect(
      report.paymentBreakdown.find((row) => row.paymentMethod === 'CASH')
        ?.totalAmount,
    ).toBe('250.00');
    expect(
      report.paymentBreakdown.some(
        (row) => String(row.paymentMethod) === 'CREDIT',
      ),
    ).toBe(false);
    expect(
      JSON.stringify(prisma.creditPayment.findMany.mock.calls[0]),
    ).not.toContain('saleDate');
  });
});
