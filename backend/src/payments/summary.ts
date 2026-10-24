import { startOfCompanyDay } from '../../../shared/documents/date-only.js';

export type PaymentRecord = { amount: bigint; cancelledAt: Date | null };
export type PaymentStatus = 'PAYEE' | 'PARTIELLEMENT_PAYEE' | 'EN_RETARD' | 'IMPAYEE';

export function summarizePayments(
  total: bigint,
  dueDate: Date | null,
  timeZone: string,
  payments: readonly PaymentRecord[],
  now = new Date(),
) {
  const paid = payments.reduce((sum, payment) => payment.cancelledAt ? sum : sum + payment.amount, 0n);
  const balance = total - paid;
  const overdue = balance > 0n && dueDate !== null && dueDate < startOfCompanyDay(timeZone, now);
  const status: PaymentStatus = balance === 0n
    ? 'PAYEE'
    : overdue ? 'EN_RETARD' : paid > 0n ? 'PARTIELLEMENT_PAYEE' : 'IMPAYEE';
  return { total, paid, balance, status };
}
