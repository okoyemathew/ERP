import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Collections net of approved returns, never the CREDIT placeholder. */
export async function saleCollections(
  prisma: PrismaService,
  saleWhere: Prisma.SaleWhereInput,
  range: { startDate?: Date; endDate?: Date } = {},
  paymentMethod?: PaymentMethod,
  basis: 'net' | 'received' = 'net',
) {
  const sale: Prisma.SaleWhereInput = {
    AND: [saleWhere, { deletedAt: null, status: basis === 'received' ? { in: ['COMPLETED', 'REFUNDED'] } : 'COMPLETED' }],
  };
  const paymentDate = {
    ...(range.startDate ? { gte: range.startDate } : {}),
    ...(range.endDate ? { lte: range.endDate } : {}),
  };
  if (paymentMethod === PaymentMethod.CREDIT) return [];
  const method = paymentMethod ?? { not: PaymentMethod.CREDIT };
  const [payments, creditPayments] = await Promise.all([
    prisma.payment.findMany({
      where: { sale, paymentDate, paymentMethod: method, amount: { gt: 0 } },
      select: {
        id: true,
        saleId: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
      },
    }),
    prisma.creditPayment.findMany({
      where: {
        creditSale: { sale },
        paymentDate,
        paymentMethod: method,
        amount: { gt: 0 },
      },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        creditSale: { select: { saleId: true } },
      },
    }),
  ]);
  const rows = [
    ...payments,
    ...creditPayments.map(({ creditSale, ...payment }) => ({
      ...payment,
      saleId: creditSale.saleId,
    })),
  ];
  // Actual receipts do not disappear or move dates when goods are returned.
  if (!rows.length || basis === 'received') return rows;

  const returnedSales = await prisma.sale.findMany({
    where: {
      AND: [sale, { id: { in: [...new Set(rows.map((row) => row.saleId))] } }],
      productReturnRequests: { some: { status: 'APPROVED' } },
    },
    select: {
      id: true,
      totalAmount: true,
      items: {
        select: {
          quantity: true,
          totalAmount: true,
          productReturnRequests: {
            where: { status: 'APPROVED' },
            select: { quantity: true },
          },
        },
      },
      payments: {
        where: {
          paymentMethod: { not: PaymentMethod.CREDIT },
          amount: { gt: 0 },
        },
        select: { id: true, amount: true, paymentDate: true },
      },
      creditSale: {
        select: {
          payments: {
            where: {
              paymentMethod: { not: PaymentMethod.CREDIT },
              amount: { gt: 0 },
            },
            select: { id: true, amount: true, paymentDate: true },
          },
        },
      },
    },
  });
  const adjusted = new Map<string, Prisma.Decimal>();
  for (const invoice of returnedSales) {
    // Derive the net value from original items, including older approved returns
    // whose stored sale total was never recalculated. Do not subtract twice from
    // newer sales that already store the net total.
    const netTotal = invoice.items.some(
      (item) => item.productReturnRequests.length,
    )
      ? invoice.items.reduce((sum, item) => {
          const returned = Math.min(
            item.quantity,
            item.productReturnRequests.reduce(
              (qty, request) => qty + request.quantity,
              0,
            ),
          );
          const returnedValue =
            item.quantity > 0
              ? new Prisma.Decimal(item.totalAmount)
                  .mul(returned)
                  .div(item.quantity)
                  .toDecimalPlaces(2)
              : new Prisma.Decimal(0);
          return sum.add(
            Prisma.Decimal.max(
              0,
              new Prisma.Decimal(item.totalAmount).sub(returnedValue),
            ),
          );
        }, new Prisma.Decimal(0))
      : invoice.totalAmount;
    // Keep payment history intact, removing excess from latest collections first.
    // Use the entire history before applying date/method filters so split reports
    // always reconcile and a credit return reduces unpaid debt before collections.
    let remaining = Prisma.Decimal.max(0, netTotal);
    const history = [
      ...invoice.payments.map((payment) => ({
        ...payment,
        key: `payment:${payment.id}`,
      })),
      ...(invoice.creditSale?.payments ?? []).map((payment) => ({
        ...payment,
        key: `credit:${payment.id}`,
      })),
    ].sort(
      (a, b) =>
        a.paymentDate.getTime() - b.paymentDate.getTime() ||
        a.key.localeCompare(b.key),
    );
    for (const payment of history) {
      const amount = Prisma.Decimal.min(remaining, payment.amount);
      adjusted.set(payment.key, amount);
      remaining = remaining.sub(amount);
    }
  }
  return [
    ...payments.map((payment) => ({
      ...payment,
      amount: adjusted.get(`payment:${payment.id}`) ?? payment.amount,
    })),
    ...creditPayments.map(({ creditSale, ...payment }) => ({
      ...payment,
      saleId: creditSale.saleId,
      amount: adjusted.get(`credit:${payment.id}`) ?? payment.amount,
    })),
  ].filter((payment) => payment.amount.gt(0));
}

export function collectionsBySale(
  rows: Awaited<ReturnType<typeof saleCollections>>,
) {
  const result = new Map<
    string,
    {
      collectedAmount: Prisma.Decimal;
      collectionDate: Date;
      collectionPayments: Array<{ amount: Prisma.Decimal; paymentDate: Date }>;
    }
  >();
  for (const row of rows) {
    const current = result.get(row.saleId);
    result.set(row.saleId, {
      collectionPayments: [
        ...(current?.collectionPayments ?? []),
        { amount: row.amount, paymentDate: row.paymentDate },
      ],
      collectedAmount: (current?.collectedAmount ?? new Prisma.Decimal(0)).add(
        row.amount,
      ),
      collectionDate:
        current && current.collectionDate > row.paymentDate
          ? current.collectionDate
          : row.paymentDate,
    });
  }
  return result;
}
