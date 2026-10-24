import { describe, expect, it } from 'vitest';
import { calculateQuote, hashSnapshot, quoteSnapshot } from './document.js';
import { hashPdf } from './pdf-storage.js';
import { renderDocumentPdf, renderQuotePdf } from './pdf.js';

describe('préparation d’un devis', () => {
  it('calcule et persiste les lignes dans leur ordre', () => {
    const quote = calculateQuote({ lines: [{ description: 'Prestation', quantityMilli: 1_500n, unitPrice: 1_000n, taxRateBasisPts: 1_800 }] });
    expect(quote.lines[0]).toMatchObject({ position: 1, gross: 1_500n, net: 1_500n });
    expect(quote.totalInclTax).toBe(1_770n);
  });

  it('produit un instantané stable malgré l’ordre des propriétés', () => {
    expect(quoteSnapshot({ b: 2, a: 1 }, { name: 'A' }, null).hash)
      .toBe(quoteSnapshot({ a: 1, b: 2 }, { name: 'A' }, null).hash);
  });

  it('rend un PDF depuis un instantané immuable', async () => {
    const quote = calculateQuote({ lines: [{ description: 'Prestation', quantityMilli: 1_000n, unitPrice: 2_500n, taxRateBasisPts: 0 }] });
    const frozen = quoteSnapshot({ ...quote, number: 'DEV-2026-00001', currency: 'XOF', sentAt: new Date('2026-10-24T00:00:00.000Z') }, { name: 'Entreprise', currency: 'XOF', decimals: 0 }, { name: 'Client', address: 'Ouagadougou' });
    const pdf = await renderQuotePdf(frozen.snapshot);
    const regenerated = await renderQuotePdf(frozen.snapshot);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
    expect(hashPdf(regenerated)).toBe(hashPdf(pdf));
    expect(hashSnapshot(frozen.snapshot)).toBe(frozen.hash);

    const invoicePdf = await renderDocumentPdf({
      version: 1, documentType: 'FACTURE',
      document: { ...quote, number: 'FAC-2026-00001', currency: 'XOF', issueDate: new Date('2026-10-24T00:00:00.000Z'), dueDate: new Date('2026-11-23T00:00:00.000Z') },
      company: { name: 'Entreprise', currency: 'XOF', decimals: 0 }, client: { name: 'Client' },
    });
    const invoicePdfAgain = await renderDocumentPdf({
      version: 1, documentType: 'FACTURE',
      document: { ...quote, number: 'FAC-2026-00001', currency: 'XOF', issueDate: new Date('2026-10-24T00:00:00.000Z'), dueDate: new Date('2026-11-23T00:00:00.000Z') },
      company: { name: 'Entreprise', currency: 'XOF', decimals: 0 }, client: { name: 'Client' },
    });
    expect(invoicePdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(hashPdf(invoicePdfAgain)).toBe(hashPdf(invoicePdf));
    const cancelledSnapshot = {
      version: 1, documentType: 'FACTURE' as const,
      document: { ...quote, number: 'FAC-2026-00001', currency: 'XOF', issueDate: new Date('2026-10-24T00:00:00.000Z'), dueDate: new Date('2026-11-23T00:00:00.000Z') },
      company: { name: 'Entreprise', currency: 'XOF', decimals: 0 }, client: { name: 'Client' },
      cancellation: { cancelledAt: new Date('2026-10-25T12:00:00.000Z'), reason: 'Erreur de saisie à corriger.' },
    };
    const cancellationPdf = await renderDocumentPdf(cancelledSnapshot);
    const regeneratedCancellationPdf = await renderDocumentPdf(cancelledSnapshot);
    expect(cancellationPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(hashPdf(regeneratedCancellationPdf)).toBe(hashPdf(cancellationPdf));
  });
});
