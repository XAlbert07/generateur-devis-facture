import { roundHalfUpDiv } from './rounding.js';
import type {
  ComputedLine,
  Discount,
  DocumentLineInput,
  DocumentTotals,
  Money,
  TaxBreakdown,
} from './types.js';

const BASIS_POINTS = 10_000n;
const QUANTITY_SCALE = 1_000n;

function assertBasisPoints(value: bigint, label: string): void {
  if (value < 0n || value > BASIS_POINTS) {
    throw new RangeError(`${label} doit être compris entre 0 et 10000`);
  }
}

function computeDiscount(base: Money, discount: Discount | undefined): Money {
  if (!discount) return 0n;
  const amount = discount.kind === 'percentage'
    ? (assertBasisPoints(discount.basisPoints, 'Le taux de remise'),
      roundHalfUpDiv(base, discount.basisPoints, BASIS_POINTS))
    : discount.amount;

  if (amount < 0n || amount > base) {
    throw new RangeError('La remise doit être comprise entre 0 et le montant brut');
  }
  return amount;
}

function computeLine(line: DocumentLineInput): ComputedLine {
  if (line.quantityMilli <= 0n || line.unitPrice < 0n) {
    throw new RangeError('La quantité doit être positive et le prix ne peut être négatif');
  }
  assertBasisPoints(line.taxRateBasisPoints, 'Le taux de TVA');
  const gross = roundHalfUpDiv(line.quantityMilli, line.unitPrice, QUANTITY_SCALE);
  const discount = computeDiscount(gross, line.discount);

  return { ...line, gross, discount, net: gross - discount };
}

/** Répartit une remise globale par taux de TVA, selon le plus fort reste. */
function allocateGlobalDiscount(
  bases: ReadonlyMap<bigint, Money>,
  discount: Money,
): ReadonlyMap<bigint, Money> {
  const subtotal = [...bases.values()].reduce((sum, base) => sum + base, 0n);
  const allocated = new Map<bigint, Money>();
  if (subtotal === 0n) {
    for (const rate of bases.keys()) allocated.set(rate, 0n);
    return allocated;
  }

  const shares = [...bases.entries()].map(([rate, base]) => {
    const product = discount * base;
    const floor = product / subtotal;
    return { rate, base, floor, remainder: product - floor * subtotal };
  });
  let remaining = discount - shares.reduce((sum, share) => sum + share.floor, 0n);
  shares.sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.base !== b.base) return a.base > b.base ? -1 : 1;
    return a.rate < b.rate ? -1 : a.rate > b.rate ? 1 : 0;
  });
  for (const share of shares) {
    const extra = remaining > 0n ? 1n : 0n;
    allocated.set(share.rate, share.floor + extra);
    remaining -= extra;
  }
  return allocated;
}

/** Calcule tous les totaux d'un devis ou d'une facture, exclusivement en bigint. */
export function computeDocumentTotals(
  inputLines: readonly DocumentLineInput[],
  globalDiscount?: Discount,
): DocumentTotals {
  const lines = inputLines.map(computeLine);
  const bases = new Map<bigint, Money>();
  for (const line of lines) {
    bases.set(line.taxRateBasisPoints, (bases.get(line.taxRateBasisPoints) ?? 0n) + line.net);
  }
  const subtotalExcludingTax = [...bases.values()].reduce((sum, base) => sum + base, 0n);
  const globalDiscountAmount = computeDiscount(subtotalExcludingTax, globalDiscount);
  const allocatedDiscounts = allocateGlobalDiscount(bases, globalDiscountAmount);
  const taxes: TaxBreakdown[] = [...bases.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([taxRateBasisPoints, base]) => {
      const globalDiscountForRate = allocatedDiscounts.get(taxRateBasisPoints) ?? 0n;
      const netBase = base - globalDiscountForRate;
      return {
        taxRateBasisPoints,
        base,
        globalDiscount: globalDiscountForRate,
        netBase,
        tax: roundHalfUpDiv(netBase, taxRateBasisPoints, BASIS_POINTS),
      };
    });
  const totalTax = taxes.reduce((sum, tax) => sum + tax.tax, 0n);
  const totalExcludingTax = subtotalExcludingTax - globalDiscountAmount;

  return {
    lines,
    subtotalExcludingTax,
    globalDiscount: globalDiscountAmount,
    totalExcludingTax,
    totalTax,
    totalIncludingTax: totalExcludingTax + totalTax,
    taxes,
  };
}
