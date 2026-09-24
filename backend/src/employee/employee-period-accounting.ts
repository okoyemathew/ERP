import { PaymentMethod, Prisma } from '@prisma/client';

type Money = Prisma.Decimal | number | string;
type Payment = {
  id: string;
  amount: Money;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
};
export type AccountingInvoice = {
  id: string;
  saleNumber: string;
  saleDate: Date;
  items: Array<{
    quantity: number;
    totalAmount: Money;
    taxAmount: Money;
    product: { purchasePrice: Money };
    productReturnRequests: Array<{
      id: string;
      quantity: number;
      reviewedAt: Date | null;
    }>;
  }>;
  payments: Payment[];
  creditSale?: { amountPaid: Money; payments?: Payment[] } | null;
};

/** Reconstruct period activity from dated events, never lifetime paid snapshots. */
export function employeePeriodAccounting(
  invoices: AccountingInvoice[],
  range: { startDate?: Date; endDate?: Date },
) {
  const zero = () => new Prisma.Decimal(0);
  const start = range.startDate?.getTime() ?? -Infinity;
  const end = range.endDate?.getTime() ?? Date.now();
  const inPeriod = (date: Date) =>
    date.getTime() >= start && date.getTime() <= end;
  let grossSales = zero(),
    salesReturns = zero(),
    grossProfit = zero();
  let openingCredit = zero(),
    newCreditIssued = zero(),
    creditRepayments = zero();
  let creditReturnReductions = zero(),
    closingCredit = zero();
  let totalCollected = zero(),
    newSaleCollections = zero(),
    olderInvoiceCollections = zero();
  let customerCreditFromReturns = zero(),
    undatedRepayments = zero();
  const sales: Array<{
    id: string;
    saleNumber: string;
    saleDate: Date;
    totalAmount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    balanceDue: Prisma.Decimal;
  }> = [];
  const collections: Array<{
    id: string;
    saleId: string;
    saleNumber: string;
    invoiceDate: Date;
    paymentDate: Date;
    paymentMethod: PaymentMethod;
    amount: Prisma.Decimal;
    source: 'sale' | 'credit';
  }> = [];
  const returns: Array<{
    id: string;
    saleNumber: string;
    date: Date;
    amount: Prisma.Decimal;
    creditReduction: Prisma.Decimal;
    customerCredit: Prisma.Decimal;
  }> = [];
  for (const invoice of invoices) {
    if (invoice.saleDate.getTime() > end) continue;
    let original = zero(),
      originalProfit = zero();
    type Event = {
      id: string;
      date: Date;
      kind: 'sale' | 'payment' | 'return';
      amount: Prisma.Decimal;
      profit: Prisma.Decimal;
      payment?: Payment;
      source?: 'sale' | 'credit';
    };
    const events: Event[] = [];
    for (const item of invoice.items) {
      const total = new Prisma.Decimal(item.totalAmount);
      const tax = new Prisma.Decimal(item.taxAmount);
      const cost = new Prisma.Decimal(item.product.purchasePrice);
      original = original.add(total);
      originalProfit = originalProfit.add(
        total.sub(tax).sub(cost.mul(item.quantity)),
      );
      let quantity = 0,
        previousValue = zero(),
        previousTax = zero();
      for (const request of [...item.productReturnRequests].sort(
        (a, b) =>
          (a.reviewedAt?.getTime() ?? Infinity) -
            (b.reviewedAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id),
      )) {
        if (!request.reviewedAt || item.quantity <= 0) continue;
        const nextQuantity = Math.min(
          item.quantity,
          quantity + request.quantity,
        );
        const nextValue = total
          .mul(nextQuantity)
          .div(item.quantity)
          .toDecimalPlaces(2);
        const nextTax = tax
          .mul(nextQuantity)
          .div(item.quantity)
          .toDecimalPlaces(2);
        const amount = nextValue.sub(previousValue);
        events.push({
          id: request.id,
          date: request.reviewedAt,
          kind: 'return',
          amount,
          profit: amount
            .sub(nextTax.sub(previousTax))
            .sub(cost.mul(nextQuantity - quantity)),
        });
        quantity = nextQuantity;
        previousValue = nextValue;
        previousTax = nextTax;
      }
    }
    events.push({
      id: invoice.id,
      date: invoice.saleDate,
      kind: 'sale',
      amount: original,
      profit: originalProfit,
    });
    const creditPayments = invoice.creditSale?.payments ?? [];
    const recordedCreditPaid = creditPayments
      .filter((p) => p.paymentMethod !== PaymentMethod.CREDIT)
      .reduce((sum, p) => sum.add(p.amount), zero());
    undatedRepayments = undatedRepayments.add(
      Prisma.Decimal.max(
        0,
        new Prisma.Decimal(invoice.creditSale?.amountPaid ?? 0).sub(
          recordedCreditPaid,
        ),
      ),
    );
    for (const source of ['sale', 'credit'] as const) {
      for (const payment of source === 'sale'
        ? invoice.payments
        : creditPayments) {
        if (
          payment.paymentMethod === PaymentMethod.CREDIT ||
          new Prisma.Decimal(payment.amount).lte(0)
        )
          continue;
        events.push({
          id: `${source}:${payment.id}`,
          date: payment.paymentDate,
          kind: 'payment',
          amount: new Prisma.Decimal(payment.amount),
          profit: zero(),
          payment,
          source,
        });
      }
    }
    const priority = { sale: 0, payment: 1, return: 2 };
    events.sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        priority[a.kind] - priority[b.kind] ||
        a.id.localeCompare(b.id),
    );
    let balance = zero(),
      received = zero(),
      returned = zero();
    for (const event of events) {
      if (event.date.getTime() > end) continue;
      const before = balance;
      const current = inPeriod(event.date);
      if (event.kind === 'sale') {
        balance = balance.add(event.amount);
        if (current) {
          grossSales = grossSales.add(event.amount);
          grossProfit = grossProfit.add(event.profit);
          newCreditIssued = newCreditIssued.add(event.amount);
        }
      } else if (event.kind === 'payment') {
        received = received.add(event.amount);
        const applied = Prisma.Decimal.min(balance, event.amount);
        balance = balance.sub(applied);
        if (current) {
          totalCollected = totalCollected.add(event.amount);
          if (inPeriod(invoice.saleDate))
            newSaleCollections = newSaleCollections.add(event.amount);
          else
            olderInvoiceCollections = olderInvoiceCollections.add(event.amount);
          if (event.source === 'sale' && inPeriod(invoice.saleDate))
            newCreditIssued = newCreditIssued.sub(applied);
          else creditRepayments = creditRepayments.add(applied);
          collections.push({
            id: event.id,
            saleId: invoice.id,
            saleNumber: invoice.saleNumber,
            invoiceDate: invoice.saleDate,
            paymentDate: event.date,
            paymentMethod: event.payment!.paymentMethod,
            amount: event.amount,
            source: event.source!,
          });
        }
      } else {
        returned = returned.add(event.amount);
        const reduction = Prisma.Decimal.min(balance, event.amount);
        balance = balance.sub(reduction);
        if (current) {
          salesReturns = salesReturns.add(event.amount);
          grossProfit = grossProfit.sub(event.profit);
          creditReturnReductions = creditReturnReductions.add(reduction);
          const customerCredit = event.amount.sub(reduction);
          customerCreditFromReturns =
            customerCreditFromReturns.add(customerCredit);
          returns.push({
            id: event.id,
            saleNumber: invoice.saleNumber,
            date: event.date,
            amount: event.amount,
            creditReduction: reduction,
            customerCredit,
          });
        }
      }
      if (event.date.getTime() < start)
        openingCredit = openingCredit.add(balance.sub(before));
    }
    closingCredit = closingCredit.add(balance);
    if (inPeriod(invoice.saleDate))
      sales.push({
        id: invoice.id,
        saleNumber: invoice.saleNumber,
        saleDate: invoice.saleDate,
        totalAmount: Prisma.Decimal.max(0, original.sub(returned)),
        amountPaid: Prisma.Decimal.min(
          received,
          Prisma.Decimal.max(0, original.sub(returned)),
        ),
        balanceDue: balance,
      });
  }
  const expectedClosing = openingCredit
    .add(newCreditIssued)
    .sub(creditRepayments)
    .sub(creditReturnReductions);
  return {
    summary: {
      salesCount: sales.length,
      grossSales,
      salesReturns,
      totalSalesValue: grossSales.sub(salesReturns),
      totalProfit: grossProfit.toDecimalPlaces(2),
      totalCollected,
      newSaleCollections,
      olderInvoiceCollections,
      openingCredit,
      newCreditIssued,
      creditRepayments,
      creditReturnReductions,
      closingCredit,
      totalBalanceDue: closingCredit,
      customerCreditFromReturns,
      undatedRepayments,
      reconciliationDifference: closingCredit.sub(expectedClosing),
    },
    sales,
    collections: collections.sort(
      (a, b) =>
        a.paymentDate.getTime() - b.paymentDate.getTime() ||
        a.id.localeCompare(b.id),
    ),
    returns,
  };
}
