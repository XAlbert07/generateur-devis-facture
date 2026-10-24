export type DiscountType = 'NONE' | 'POURCENTAGE' | 'MONTANT_FIXE';
export type QuoteStatus = 'BROUILLON' | 'ENVOYE' | 'ACCEPTE' | 'REFUSE' | 'EXPIRE' | 'CONVERTI' | 'ANNULE';
export type QuoteLine = {
  id: string; description: string; quantityMilli: string; unitPrice: string;
  taxRateBasisPts: number; discountType: Exclude<DiscountType, 'NONE'> | null; discountValue: string | null;
};
export type DraftDocument = {
  id: string; version: number; clientId: string | null; client?: { id: string; name: string } | null;
  validUntil?: string | null; currency: string;
  createdAt?: string; updatedAt?: string; sentAt?: string | null;
  subtotalExclTax: string; globalDiscount: string; totalExclTax: string; totalTax: string; totalInclTax: string;
  globalDiscountType: Exclude<DiscountType, 'NONE'> | null; globalDiscountValue: string | null; lines: QuoteLine[];
};
export type Quote = DraftDocument & { number: string | null; status: QuoteStatus; validUntil: string | null };
export type QuoteFormValues = {
  clientId: string; validUntil: string; globalDiscountType: DiscountType; globalDiscountValue: string;
  lines: { productId: string; description: string; quantity: string; unitPrice: string; taxRate: string; discountType: DiscountType; discountValue: string }[];
};
export type ClientOption = { id: string; name: string };
export type ProductOption = { id: string; name: string; description: string | null; unitPrice: string; unit: string; taxRateBasisPts: number };
export type CompanyMoney = { currency: string; decimals: number; defaultTaxRateBasisPts: number; timezone?: string };

export function blankQuoteLine(): QuoteFormValues['lines'][number] {
  return { productId: '', description: '', quantity: '1', unitPrice: '', taxRate: '0', discountType: 'NONE', discountValue: '' };
}
