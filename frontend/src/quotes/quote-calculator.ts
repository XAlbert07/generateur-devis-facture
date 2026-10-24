import { computeDocumentTotals, type Discount } from '../../../shared/money/index.js';
import { parseMajorUnits, parseTaxPercent } from '../money/format';
import type { DiscountType, QuoteFormValues } from './quote-model';

function quantityMilli(input: string): bigint {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{0,3})?$/.test(normalized)) throw new Error('La quantité accepte au maximum trois décimales.');
  const [whole, fraction = ''] = normalized.split('.');
  const value = BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3));
  if (value <= 0n) throw new Error('La quantité doit être supérieure à zéro.');
  return value;
}

function discount(type: DiscountType, value: string, decimals: number): { api: { type: 'POURCENTAGE' | 'MONTANT_FIXE'; value: string } | null; money?: Discount } {
  if (type === 'NONE') return { api: null };
  if (!value.trim()) throw new Error('Saisissez la valeur de remise.');
  if (type === 'POURCENTAGE') {
    const basisPoints = BigInt(parseTaxPercent(value));
    return { api: { type, value: basisPoints.toString() }, money: { kind: 'percentage', basisPoints } };
  }
  const amount = BigInt(parseMajorUnits(value, decimals));
  return { api: { type, value: amount.toString() }, money: { kind: 'fixed', amount } };
}

export function calculateQuoteForm(values: QuoteFormValues, decimals: number) {
  const global = discount(values.globalDiscountType, values.globalDiscountValue, decimals);
  const lines = values.lines.map((line) => {
    const lineDiscount = discount(line.discountType, line.discountValue, decimals);
    return {
      api: {
        description: line.description.trim(), quantityMilli: quantityMilli(line.quantity).toString(),
        unitPrice: parseMajorUnits(line.unitPrice, decimals), taxRateBasisPts: parseTaxPercent(line.taxRate),
        discount: lineDiscount.api,
      },
      money: {
        quantityMilli: quantityMilli(line.quantity), unitPrice: BigInt(parseMajorUnits(line.unitPrice, decimals)),
        taxRateBasisPoints: BigInt(parseTaxPercent(line.taxRate)), ...(lineDiscount.money ? { discount: lineDiscount.money } : {}),
      },
    };
  });
  const totals = computeDocumentTotals(lines.map((line) => line.money), global.money);
  return {
    totals,
    payload: { clientId: values.clientId || null, validUntil: values.validUntil || null, globalDiscount: global.api, lines: lines.map((line) => line.api) },
  };
}
