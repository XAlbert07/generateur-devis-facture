import type { DraftDocument } from '../quotes/quote-model';

export type InvoiceStatus = 'BROUILLON' | 'EMISE' | 'ANNULEE';
export type InvoiceOrigin = 'MANUELLE' | 'DEVIS';
export type Invoice = DraftDocument & {
  number: string | null; status: InvoiceStatus; origin: InvoiceOrigin; quoteId: string | null;
  issueDate: string | null; dueDate: string | null;
};
