import { apiRequest } from '../api/http';
import type { Quote, QuoteStatus } from './quote-model';

export type QuoteList = { data: Quote[]; meta: { page: number; total: number; totalPages: number } };
export function listQuotes(page: number, status?: QuoteStatus, search?: string, signal?: AbortSignal): Promise<QuoteList> {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  return apiRequest(`/quotes?${params}`, { signal });
}
export function getQuote(id: string): Promise<Quote> { return apiRequest(`/quotes/${id}`); }
export function saveQuote(input: unknown, quote?: Quote): Promise<Quote> {
  return apiRequest(quote ? `/quotes/${quote.id}` : '/quotes', {
    method: quote ? 'PUT' : 'POST', headers: quote ? { 'If-Match': `"${quote.version}"` } : {}, body: JSON.stringify(input),
  });
}
export function deleteQuote(quote: Quote): Promise<void> {
  return apiRequest(`/quotes/${quote.id}`, { method: 'DELETE', headers: { 'If-Match': `"${quote.version}"` } });
}
export function quoteAction(quote: Quote, action: 'send' | 'accept' | 'refuse' | 'cancel', body?: unknown): Promise<Quote> {
  return apiRequest(`/quotes/${quote.id}/${action}`, {
    method: 'POST', headers: { 'If-Match': `"${quote.version}"` }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
