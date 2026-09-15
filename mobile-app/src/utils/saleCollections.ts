import type { ApiSale } from '@/types/sales';

/** Used only for locally queued sales; server collections also include credit repayments. */
export function queuedSaleCollection(sale: ApiSale): ApiSale | null {
  if (sale.status !== 'COMPLETED') return null;
  const payments = sale.payments.filter(payment => payment.paymentMethod !== 'CREDIT' && Number(payment.amount) > 0);
  const collectedAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  if (!collectedAmount) return null;
  return {
    ...sale,
    collectedAmount,
    collectionDate: payments.map(payment => payment.paymentDate).sort().at(-1) ?? sale.saleDate,
    collectionPayments: payments.map(payment => ({ amount: payment.amount, paymentDate: payment.paymentDate })),
  };
}
