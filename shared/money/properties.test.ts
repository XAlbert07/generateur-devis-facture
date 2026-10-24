import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeDocumentTotals } from './compute-document-totals.js';

const lineArbitrary = fc.record({
  quantityMilli: fc.bigInt({ min: 1n, max: 1_000_000n }),
  unitPrice: fc.bigInt({ min: 0n, max: 1_000_000n }),
  taxRateBasisPoints: fc.bigInt({ min: 0n, max: 10_000n }),
  discountBasisPoints: fc.bigInt({ min: 0n, max: 10_000n }),
});

describe('invariants du calculateur monétaire', () => {
  it('conserve exactement les égalités du document de conception', () => {
    fc.assert(fc.property(
      fc.array(lineArbitrary, { minLength: 1, maxLength: 20 }),
      fc.bigInt({ min: 0n, max: 10_000n }),
      (rawLines, globalDiscountBasisPoints) => {
        const totals = computeDocumentTotals(
          rawLines.map(({ discountBasisPoints, ...line }) => ({
            ...line,
            discount: { kind: 'percentage' as const, basisPoints: discountBasisPoints },
          })),
          { kind: 'percentage', basisPoints: globalDiscountBasisPoints },
        );
        const netLines = totals.lines.reduce((sum, line) => sum + line.net, 0n);
        const allocated = totals.taxes.reduce((sum, tax) => sum + tax.globalDiscount, 0n);
        const netBases = totals.taxes.reduce((sum, tax) => sum + tax.netBase, 0n);
        const taxes = totals.taxes.reduce((sum, tax) => sum + tax.tax, 0n);

        expect(netLines).toBe(totals.subtotalExcludingTax);
        expect(allocated).toBe(totals.globalDiscount);
        expect(netBases).toBe(totals.subtotalExcludingTax - totals.globalDiscount);
        expect(totals.totalIncludingTax).toBe(totals.totalExcludingTax + totals.totalTax);
        expect(totals.totalIncludingTax).toBe(netBases + taxes);
        for (const tax of totals.taxes) {
          expect(tax.globalDiscount).toBeGreaterThanOrEqual(0n);
          expect(tax.globalDiscount).toBeLessThanOrEqual(tax.base);
        }
      },
    ), { numRuns: 250 });
  });
});
