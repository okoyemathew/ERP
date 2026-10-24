import { CreditSaleStatus, Prisma, SaleStatus } from '@prisma/client';

/** Replace customer PII only after every transaction is settled. Related sale,
 * receipt, payment, and credit records remain available for accounting lookup.
 */
export async function anonymizeCustomerIfSettled(
  tx: Prisma.TransactionClient,
  businessId: string,
  customerId: string,
) {
  const [customer, pendingSales, unsettledCreditSales] = await Promise.all([
    tx.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
      select: { id: true, outstandingBalance: true },
    }),
    tx.sale.count({
      where: { businessId, customerId, status: SaleStatus.PENDING },
    }),
    tx.creditSale.count({
      where: {
        customerId,
        balance: { gt: 0 },
        status: { not: CreditSaleStatus.PAID },
        deletedAt: null,
      },
    }),
  ]);

  if (
    !customer ||
    new Prisma.Decimal(customer.outstandingBalance).gt(0) ||
    pendingSales > 0 ||
    unsettledCreditSales > 0
  ) {
    return false;
  }

  const unsettledSales = await tx.sale.count({
    where: {
      businessId,
      customerId,
      status: SaleStatus.COMPLETED,
      balanceDue: { gt: 0 },
    },
  });
  if (unsettledSales > 0) return false;

  const now = new Date();
  await tx.customer.update({
    where: { id: customerId },
    data: {
      customerCode: null,
      firstName: 'Former',
      lastName: 'Customer',
      companyName: null,
      email: null,
      phone: `REDACTED-${customerId}`,
      address: null,
      city: null,
      state: null,
      country: null,
      creditLimit: 0,
      notes: null,
      status: 'INACTIVE',
      deletedAt: now,
      isSynced: true,
      syncVersion: { increment: 1 },
    },
  });

  return true;
}
