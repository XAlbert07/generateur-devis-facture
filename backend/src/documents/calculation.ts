import { computeDocumentTotals, type Discount, type DocumentLineInput } from '../../../shared/money/index.js';

type InputDiscount = { type: 'POURCENTAGE' | 'MONTANT_FIXE'; value: bigint } | null | undefined;
type InputLine = {
  description: string; quantityMilli: bigint; unitPrice: bigint; taxRateBasisPts: number; discount?: InputDiscount;
};
export type DocumentInput = { globalDiscount?: InputDiscount; lines: InputLine[] };

function discountOf(value: InputDiscount): Discount | undefined {
  if (!value) return undefined;
  return value.type === 'POURCENTAGE'
    ? { kind: 'percentage', basisPoints: value.value }
    : { kind: 'fixed', amount: value.value };
}

export function calculateDocument(input: DocumentInput) {
  const lines: DocumentLineInput[] = input.lines.map((line) => {
    const discount = discountOf(line.discount);
    return {
      quantityMilli: line.quantityMilli, unitPrice: line.unitPrice,
      taxRateBasisPoints: BigInt(line.taxRateBasisPts), ...(discount ? { discount } : {}),
    };
  });
  const totals = computeDocumentTotals(lines, discountOf(input.globalDiscount));
  return {
    globalDiscountType: input.globalDiscount?.type ?? null,
    globalDiscountValue: input.globalDiscount?.value ?? null,
    subtotalExclTax: totals.subtotalExcludingTax, globalDiscount: totals.globalDiscount,
    totalExclTax: totals.totalExcludingTax, totalTax: totals.totalTax,
    totalInclTax: totals.totalIncludingTax,
    taxBreakdown: totals.taxes.map((tax) => ({
      taxRateBasisPts: tax.taxRateBasisPoints.toString(), base: tax.base.toString(),
      globalDiscount: tax.globalDiscount.toString(), netBase: tax.netBase.toString(), tax: tax.tax.toString(),
    })),
    lines: input.lines.map((line, index) => ({
      position: index + 1, description: line.description, quantityMilli: line.quantityMilli,
      unitPrice: line.unitPrice, discountType: line.discount?.type ?? null,
      discountValue: line.discount?.value ?? null, taxRateBasisPts: line.taxRateBasisPts,
      gross: totals.lines[index]!.gross, discount: totals.lines[index]!.discount, net: totals.lines[index]!.net,
    })),
  };
}
