import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Cash received, never the CREDIT placeholder or the invoice's lifetime paid total. */
export async function saleCollections(
  prisma: PrismaService,
  saleWhere: Prisma.SaleWhereInput,
  range: { startDate?: Date; endDate?: Date } = {},
  paymentMethod?: PaymentMethod,
) {
  const sale = {
    AND: [saleWhere, { deletedAt: null, status: 'COMPLETED' as const }],
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
  return [
    ...payments,
    ...creditPayments.map(({ creditSale, ...payment }) => ({
      ...payment,
      saleId: creditSale.saleId,
    })),
  ];
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
