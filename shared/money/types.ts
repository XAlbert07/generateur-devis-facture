/** Montant dans la plus petite unité de la devise (centime, franc, etc.). */
export type Money = bigint;

export type Discount =
  | { readonly kind: 'percentage'; readonly basisPoints: bigint }
  | { readonly kind: 'fixed'; readonly amount: Money };

export interface DocumentLineInput {
  readonly quantityMilli: bigint;
  readonly unitPrice: Money;
  readonly taxRateBasisPoints: bigint;
  readonly discount?: Discount;
}

export interface ComputedLine {
  readonly quantityMilli: bigint;
  readonly unitPrice: Money;
  readonly taxRateBasisPoints: bigint;
  readonly gross: Money;
  readonly discount: Money;
  readonly net: Money;
}

export interface TaxBreakdown {
  readonly taxRateBasisPoints: bigint;
  readonly base: Money;
  readonly globalDiscount: Money;
  readonly netBase: Money;
  readonly tax: Money;
}

export interface DocumentTotals {
  readonly lines: readonly ComputedLine[];
  readonly subtotalExcludingTax: Money;
  readonly globalDiscount: Money;
  readonly totalExcludingTax: Money;
  readonly totalTax: Money;
  readonly totalIncludingTax: Money;
  readonly taxes: readonly TaxBreakdown[];
}
