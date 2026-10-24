import { apiRequest } from '../api/http';

export type PaymentMethod = 'VIREMENT' | 'ESPECES' | 'CHEQUE' | 'MOBILE_MONEY' | 'CARTE' | 'AUTRE';
export type PaymentStatus = 'PAYEE' | 'PARTIELLEMENT_PAYEE' | 'EN_RETARD' | 'IMPAYEE';
export type Payment = { id: string; amount: string; paymentDate: string; method: PaymentMethod; reference: string | null; cancelledAt: string | null; cancellationReason: string | null };
export type PaymentSummary = { total: string; paid: string; balance: string; status: PaymentStatus };
export type PaymentList = { data: Payment[]; summary: PaymentSummary };
export function getPayments(invoiceId: string): Promise<PaymentList> { return apiRequest(`/invoices/${invoiceId}/payments`); }
export function createPayment(invoiceId: string, key: string, body: unknown): Promise<Payment> {
  return apiRequest(`/invoices/${invoiceId}/payments`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) });
}
export function cancelPayment(invoiceId: string, paymentId: string, reason: string): Promise<Payment> {
  return apiRequest(`/invoices/${invoiceId}/payments/${paymentId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}
