import { describe, expect, it } from 'vitest';
import { computeDocumentTotals } from './compute-document-totals.js';
import { roundHalfUpDiv } from './rounding.js';

describe('roundHalfUpDiv', () => {
  it('arrondit les moitiés vers le haut', () => {
    expect(roundHalfUpDiv(1n, 1n, 2n)).toBe(1n);
    expect(roundHalfUpDiv(149n, 1n, 100n)).toBe(1n);
    expect(roundHalfUpDiv(150n, 1n, 100n)).toBe(2n);
  });

  it('refuse les arguments hors domaine', () => {
    expect(() => roundHalfUpDiv(-1n, 1n, 1n)).toThrow(RangeError);
    expect(() => roundHalfUpDiv(1n, 1n, 0n)).toThrow(RangeError);
  });
});

describe('computeDocumentTotals', () => {
  it('reproduit exactement l’exemple EUR à deux taux', () => {
    const totals = computeDocumentTotals([
      { quantityMilli: 1000n, unitPrice: 10_000n, taxRateBasisPoints: 2000n },
      { quantityMilli: 1000n, unitPrice: 5_000n, taxRateBasisPoints: 1000n },
      {
        quantityMilli: 2000n,
        unitPrice: 2_500n,
        taxRateBasisPoints: 2000n,
        discount: { kind: 'percentage', basisPoints: 500n },
      },
    ], { kind: 'fixed', amount: 1_000n });

    expect(totals.subtotalExcludingTax).toBe(19_750n);
    expect(totals.globalDiscount).toBe(1_000n);
    expect(totals.totalExcludingTax).toBe(18_750n);
    expect(totals.totalTax).toBe(3_276n);
    expect(totals.totalIncludingTax).toBe(22_026n);
    expect(totals.taxes).toEqual([
      { taxRateBasisPoints: 1000n, base: 5_000n, globalDiscount: 253n, netBase: 4_747n, tax: 475n },
      { taxRateBasisPoints: 2000n, base: 14_750n, globalDiscount: 747n, netBase: 14_003n, tax: 2_801n },
    ]);
  });

  it('répartit le contre-exemple à cinq taux sans dépasser aucune base', () => {
    const totals = computeDocumentTotals([0n, 100n, 200n, 300n, 400n].map((rate) => ({
      quantityMilli: 1000n,
      unitPrice: 1n,
      taxRateBasisPoints: rate,
    })), { kind: 'fixed', amount: 2n });

    expect(totals.taxes.map((tax) => tax.globalDiscount)).toEqual([1n, 1n, 0n, 0n, 0n]);
  });

  it('gère une quantité décimale sans flottant', () => {
    const totals = computeDocumentTotals([
      { quantityMilli: 1500n, unitPrice: 1999n, taxRateBasisPoints: 0n },
    ]);
    expect(totals.lines[0]?.gross).toBe(2999n);
    expect(totals.totalIncludingTax).toBe(2999n);
  });
});
