import { PaymentMethod, Prisma } from '@prisma/client';
import {
  AccountingInvoice,
  employeePeriodAccounting,
} from './employee-period-accounting';

const date = (day: number, time = '12:00:00') =>
  new Date(`2026-09-${String(day).padStart(2, '0')}T${time}Z`);
const range = (first: number, last = first) => ({
  startDate: date(first, '00:00:00'),
  endDate: date(last, '23:59:59.999'),
});
const payment = (day: number, amount: number, id = 'payment') => ({
  id,
  amount,
  paymentDate: date(day),
  paymentMethod: PaymentMethod.CASH,
});
function invoice(): AccountingInvoice {
  return {
    id: 'sale',
    saleNumber: 'SALE-1',
    saleDate: date(1),
    items: [
      {
        quantity: 10,
        totalAmount: 50000,
        taxAmount: 0,
        product: { purchasePrice: 4000 },
        productReturnRequests: [],
      },
    ],
    payments: [
      {
        ...payment(1, 50000, 'placeholder'),
        paymentMethod: PaymentMethod.CREDIT,
      },
    ],
    creditSale: { amountPaid: 20000, payments: [payment(2, 20000)] },
  };
}
const number = (value: Prisma.Decimal) => Number(value);
describe('employee accounting by period', () => {
  it('places the 20000 repayment in its payment day without creating new sales or profit', () => {
    const report = employeePeriodAccounting([invoice()], range(2));
    expect(number(report.summary.grossSales)).toBe(0);
    expect(number(report.summary.totalProfit)).toBe(0);
    expect(number(report.summary.totalCollected)).toBe(20000);
    expect(number(report.summary.olderInvoiceCollections)).toBe(20000);
    expect(number(report.summary.openingCredit)).toBe(50000);
    expect(number(report.summary.creditRepayments)).toBe(20000);
    expect(number(report.summary.closingCredit)).toBe(30000);
    expect(number(report.summary.reconciliationDifference)).toBe(0);
    expect(report.sales).toHaveLength(0);
    expect(report.collections[0].saleNumber).toBe('SALE-1');
  });

  it('does not move later payments or returns into an earlier printed period', () => {
    const sale = invoice();
    sale.items[0].productReturnRequests = [
      { id: 'return', quantity: 1, reviewedAt: date(3) },
    ];
    const report = employeePeriodAccounting([sale], range(1));
    expect(number(report.summary.totalSalesValue)).toBe(50000);
    expect(number(report.summary.totalProfit)).toBe(10000);
    expect(number(report.summary.totalCollected)).toBe(0);
    expect(number(report.summary.closingCredit)).toBe(50000);
    expect(number(report.sales[0].amountPaid)).toBe(0);
  });

  it('daily totals add up to weekly/monthly totals with opening and closing continuity', () => {
    const sale = invoice();
    sale.items[0].productReturnRequests = [
      { id: 'return', quantity: 1, reviewedAt: date(3) },
    ];
    const daily = [1, 2, 3].map(
      (day) => employeePeriodAccounting([sale], range(day)).summary,
    );
    const week = employeePeriodAccounting([sale], range(1, 7)).summary;
    const month = employeePeriodAccounting([sale], range(1, 30)).summary;
    for (const field of [
      'totalSalesValue',
      'totalCollected',
      'totalProfit',
      'newCreditIssued',
      'creditRepayments',
      'creditReturnReductions',
    ] as const) {
      expect(daily.reduce((sum, day) => sum + number(day[field]), 0)).toBe(
        number(week[field]),
      );
      expect(number(week[field])).toBe(number(month[field]));
    }
    expect(number(daily[1].openingCredit)).toBe(number(daily[0].closingCredit));
    expect(number(daily[2].openingCredit)).toBe(number(daily[1].closingCredit));
    expect(number(month.closingCredit)).toBe(25000);
    expect(number(month.reconciliationDifference)).toBe(0);
    expect(number(month.totalProfit)).toBe(9000);
  });

  it('reports paid-product returns as customer credit, not an invented cash refund', () => {
    const sale = invoice();
    sale.payments = [payment(1, 50000)];
    sale.creditSale = null;
    sale.items[0].productReturnRequests = [
      { id: 'return', quantity: 1, reviewedAt: date(2) },
    ];
    const report = employeePeriodAccounting([sale], range(1, 2)).summary;
    expect(number(report.totalSalesValue)).toBe(45000);
    expect(number(report.totalCollected)).toBe(50000);
    expect(number(report.customerCreditFromReturns)).toBe(5000);
    expect(number(report.closingCredit)).toBe(0);
    expect(number(report.reconciliationDifference)).toBe(0);
  });

  it('handles deposits, installments, boundaries and excludes CREDIT placeholders', () => {
    const sale = invoice();
    sale.payments.push(payment(1, 10000, 'deposit'));
    sale.creditSale = {
      amountPaid: 40000,
      payments: [payment(2, 20000, 'part-1'), payment(3, 20000, 'part-2')],
    };
    const first = employeePeriodAccounting([sale], range(1)).summary;
    expect(number(first.newCreditIssued)).toBe(40000);
    expect(number(first.totalCollected)).toBe(10000);
    const report = employeePeriodAccounting([sale], range(2, 3));
    expect(number(report.summary.openingCredit)).toBe(40000);
    expect(number(report.summary.totalCollected)).toBe(40000);
    expect(number(report.summary.creditRepayments)).toBe(40000);
    expect(number(report.summary.closingCredit)).toBe(0);
    expect(report.collections).toHaveLength(2);
  });

  it('fully returned invoices retain historical payments and never create negative debt', () => {
    const sale = invoice();
    sale.items[0].productReturnRequests = [
      { id: 'return', quantity: 10, reviewedAt: date(3) },
    ];
    const report = employeePeriodAccounting([sale], range(1, 3)).summary;
    expect(number(report.totalSalesValue)).toBe(0);
    expect(number(report.totalProfit)).toBe(0);
    expect(number(report.totalCollected)).toBe(20000);
    expect(number(report.creditReturnReductions)).toBe(30000);
    expect(number(report.customerCreditFromReturns)).toBe(20000);
    expect(number(report.reconciliationDifference)).toBe(0);
  });
});
