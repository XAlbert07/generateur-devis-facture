import { describe, expect, it } from 'vitest';
import { calculateQuote, hashSnapshot, quoteSnapshot } from './document.js';
import { hashPdf, hashQuotePdf } from './pdf-storage.js';
import { renderDocumentPdf, renderQuotePdf } from './pdf.js';
import { jsonValue } from '../../../shared/documents/snapshot.js';

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
  it('canonise les cles JSON par code UTF-16 et produit un hash deterministe (D3)', () => {
    // Tri par codepoint Unicode : 'z' (0x7A) < 'e-accent-grave' (0xE9) < 'e-accent-circon' (0xEA)
    const ordered = jsonValue({ '\u00ea': 3, '\u00e9': 2, z: 1 }) as Record<string, unknown>;
    expect(Object.keys(ordered)).toEqual(['z', '\u00e9', '\u00ea']);

    // Deux objets equivalents (ordre de cles inverse) -> meme hash
    const hashA = hashSnapshot({ foo: 1, bar: 2, baz: [{ x: 9, a: 0 }] });
    const hashB = hashSnapshot({ baz: [{ a: 0, x: 9 }], bar: 2, foo: 1 });
    expect(hashA).toBe(hashB);

    // Vecteur de regression : le hash est stable entre executions
    const hashRef = hashSnapshot({ a: '\u00e9', b: 'hello' });
    expect(hashRef).toBe(hashSnapshot({ b: 'hello', a: '\u00e9' }));
  });


  it('rend un PDF depuis un instantané immuable', async () => {
    const quote = calculateQuote({ lines: [{ description: 'Prestation', quantityMilli: 1_000n, unitPrice: 2_500n, taxRateBasisPts: 0 }] });
    const frozen = quoteSnapshot({ ...quote, number: 'DEV-2026-00001', currency: 'XOF', sentAt: new Date('2026-10-24T00:00:00.000Z') }, { name: 'Entreprise', currency: 'XOF', decimals: 0 }, { name: 'Client', address: 'Ouagadougou' });
    const pdf = await renderQuotePdf(frozen.snapshot);
    const regenerated = await renderQuotePdf(frozen.snapshot);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
    expect(hashPdf(regenerated)).toBe(hashPdf(pdf));
    expect(hashQuotePdf(regenerated)).toBe(hashQuotePdf(pdf));
    expect(hashQuotePdf(pdf)).not.toBe(hashPdf(pdf));
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
    const cancelledQuotePdf = await renderQuotePdf({
      ...(frozen.snapshot as Record<string, unknown>),
      cancellation: { cancelledAt: new Date('2026-10-25T12:00:00.000Z'), reason: 'Erreur de saisie à corriger.' },
    });
    expect(cancelledQuotePdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(hashPdf(cancelledQuotePdf)).not.toBe(hashPdf(pdf));

    const draftPdf = await renderQuotePdf(frozen.snapshot, { draft: true });
    expect(draftPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(hashPdf(draftPdf)).not.toBe(hashPdf(pdf));
  });
});
