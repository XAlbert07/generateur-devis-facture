import { hashSnapshot, jsonValue } from '../../../shared/documents/snapshot.js';
import { calculateDocument, type DocumentInput } from '../documents/calculation.js';
export { hashSnapshot } from '../../../shared/documents/snapshot.js';

export type QuoteInput = DocumentInput & { clientId?: string | null; validUntil?: string | null; notes?: string | null };

export function calculateQuote(input: QuoteInput) {
  return calculateDocument(input);
}

export function quoteSnapshot(quote: object, company: object, client: object | null) {
  const snapshot = jsonValue({ version: 1, quote, company, client });
  return { snapshot, hash: hashSnapshot(snapshot) };
}
