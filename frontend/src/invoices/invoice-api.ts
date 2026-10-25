import { apiRequest } from '../api/http';
import type { Invoice, InvoiceStatus } from './invoice-model';

export type InvoiceList = { data: Invoice[]; meta: { page: number; total: number; totalPages: number } };
export function listInvoices(page: number, status?: InvoiceStatus, search?: string, signal?: AbortSignal): Promise<InvoiceList> {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  return apiRequest(`/invoices?${params}`, { signal });
}
export function getInvoice(id: string): Promise<Invoice> { return apiRequest(`/invoices/${id}`); }
export function saveManualInvoice(input: unknown, invoice?: Invoice): Promise<Invoice> {
  return apiRequest(invoice ? `/invoices/${invoice.id}` : '/invoices', {
    method: invoice ? 'PUT' : 'POST', headers: invoice ? { 'If-Match': `"${invoice.version}"` } : {}, body: JSON.stringify(input),
  });
}
export function deleteInvoice(invoice: Invoice): Promise<void> {
  return apiRequest(`/invoices/${invoice.id}`, { method: 'DELETE', headers: { 'If-Match': `"${invoice.version}"` } });
}
export function issueInvoice(invoice: Invoice): Promise<Invoice> {
  return apiRequest(`/invoices/${invoice.id}/issue`, { method: 'POST', headers: { 'If-Match': `"${invoice.version}"` } });
}
export function cancelInvoice(invoice: Invoice, reason: string): Promise<Invoice> {
  return apiRequest(`/invoices/${invoice.id}/cancel`, {
    method: 'POST', headers: { 'If-Match': `"${invoice.version}"` }, body: JSON.stringify({ reason }),
  });
}
export function convertQuote(id: string, version: number): Promise<Invoice> {
  return apiRequest(`/quotes/${id}/convert`, { method: 'POST', headers: { 'If-Match': `"${version}"` } });
}
