/**
 * Répare les PDF manquants ou dont l’empreinte ne correspond plus (§13 / §18).
 * Usage : npm run docs:reconcile-pdf
 * Journal : une ligne JSON par opération sur stdout.
 */
import { prisma } from '../src/db/prisma.js';
import { hashSnapshot } from '../../shared/documents/snapshot.js';
import { renderDocumentPdf, renderQuotePdf } from '../src/quotes/pdf.js';
import {
  hashPdf,
  readCancellationPdf,
  readInvoicePdf,
  readQuotePdf,
  saveCancellationPdf,
  saveInvoicePdf,
  saveQuotePdf,
} from '../src/quotes/pdf-storage.js';

type Outcome = 'ok' | 'repaired' | 'skipped' | 'error';

function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
}

async function quoteNeedsRepair(
  companyId: string,
  quoteId: string,
  pdfHash: string | null,
): Promise<boolean> {
  if (!pdfHash) return true;
  try {
    const bytes = await readQuotePdf(companyId, quoteId);
    return hashPdf(bytes) !== pdfHash;
  } catch {
    return true;
  }
}

async function invoiceNeedsRepair(
  companyId: string,
  invoiceId: string,
  pdfHash: string | null,
): Promise<boolean> {
  if (!pdfHash) return true;
  try {
    const bytes = await readInvoicePdf(companyId, invoiceId);
    return hashPdf(bytes) !== pdfHash;
  } catch {
    return true;
  }
}

async function cancellationNeedsRepair(
  companyId: string,
  invoiceId: string,
  pdfHash: string | null,
): Promise<boolean> {
  if (!pdfHash) return true;
  try {
    const bytes = await readCancellationPdf(companyId, invoiceId);
    return hashPdf(bytes) !== pdfHash;
  } catch {
    return true;
  }
}

const quoteStatuses = ['ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'CONVERTI', 'ANNULE'] as const;

let repaired = 0;
let errors = 0;
let ok = 0;
let skipped = 0;

const quotes = await prisma.quote.findMany({
  where: {
    status: { in: [...quoteStatuses] },
    snapshotHash: { not: null },
  },
  select: { id: true, companyId: true, number: true, snapshot: true, snapshotHash: true, pdfHash: true },
});

for (const quote of quotes) {
  const base = { kind: 'quote', id: quote.id, number: quote.number, companyId: quote.companyId };
  if (!quote.snapshot || !quote.snapshotHash) {
    skipped += 1;
    log({ ...base, outcome: 'skipped' satisfies Outcome, reason: 'instantané manquant' });
    continue;
  }
  if (hashSnapshot(quote.snapshot) !== quote.snapshotHash) {
    errors += 1;
    log({ ...base, outcome: 'error' satisfies Outcome, reason: 'hash_snapshot incohérent' });
    continue;
  }
  try {
    if (!(await quoteNeedsRepair(quote.companyId, quote.id, quote.pdfHash))) {
      ok += 1;
      log({ ...base, outcome: 'ok' satisfies Outcome });
      continue;
    }
    const bytes = await renderQuotePdf(quote.snapshot);
    const stored = await saveQuotePdf(quote.companyId, quote.id, bytes);
    await prisma.quote.updateMany({
      where: { id: quote.id, companyId: quote.companyId, snapshotHash: quote.snapshotHash },
      data: { pdfReference: stored.reference, pdfHash: stored.hash },
    });
    repaired += 1;
    log({ ...base, outcome: 'repaired' satisfies Outcome, pdfHash: stored.hash });
  } catch (error) {
    errors += 1;
    log({
      ...base,
      outcome: 'error' satisfies Outcome,
      reason: error instanceof Error ? error.message : 'échec réparation',
    });
  }
}

const invoices = await prisma.invoice.findMany({
  where: {
    status: { in: ['EMISE', 'ANNULEE'] },
    snapshotHash: { not: null },
  },
  select: {
    id: true, companyId: true, number: true, status: true, snapshot: true, snapshotHash: true,
    pdfHash: true, cancellationPdfHash: true, cancelledAt: true, cancellationReason: true,
  },
});

for (const invoice of invoices) {
  const base = { kind: 'invoice', id: invoice.id, number: invoice.number, companyId: invoice.companyId };
  if (!invoice.snapshot || !invoice.snapshotHash) {
    skipped += 1;
    log({ ...base, outcome: 'skipped' satisfies Outcome, reason: 'instantané manquant' });
    continue;
  }
  if (hashSnapshot(invoice.snapshot) !== invoice.snapshotHash) {
    errors += 1;
    log({ ...base, outcome: 'error' satisfies Outcome, reason: 'hash_snapshot incohérent' });
    continue;
  }
  try {
    if (!(await invoiceNeedsRepair(invoice.companyId, invoice.id, invoice.pdfHash))) {
      ok += 1;
      log({ ...base, outcome: 'ok' satisfies Outcome });
    } else {
      const bytes = await renderDocumentPdf(invoice.snapshot);
      const stored = await saveInvoicePdf(invoice.companyId, invoice.id, bytes);
      await prisma.invoice.updateMany({
        where: { id: invoice.id, companyId: invoice.companyId, snapshotHash: invoice.snapshotHash },
        data: { pdfReference: stored.reference, pdfHash: stored.hash },
      });
      repaired += 1;
      log({ ...base, outcome: 'repaired' satisfies Outcome, pdfHash: stored.hash });
    }
  } catch (error) {
    errors += 1;
    log({
      ...base,
      outcome: 'error' satisfies Outcome,
      reason: error instanceof Error ? error.message : 'échec réparation PDF',
    });
  }

  if (invoice.status !== 'ANNULEE') continue;
  const cancelBase = { kind: 'cancellation', id: invoice.id, number: invoice.number, companyId: invoice.companyId };
  try {
    if (!(await cancellationNeedsRepair(invoice.companyId, invoice.id, invoice.cancellationPdfHash))) {
      ok += 1;
      log({ ...cancelBase, outcome: 'ok' satisfies Outcome });
      continue;
    }
    const cancelledSnapshot = {
      ...(invoice.snapshot as Record<string, unknown>),
      cancellation: {
        cancelledAt: invoice.cancelledAt,
        reason: invoice.cancellationReason,
      },
    };
    const bytes = await renderDocumentPdf(cancelledSnapshot);
    const stored = await saveCancellationPdf(invoice.companyId, invoice.id, bytes);
    await prisma.invoice.updateMany({
      where: { id: invoice.id, companyId: invoice.companyId, snapshotHash: invoice.snapshotHash },
      data: { cancellationPdf: stored.reference, cancellationPdfHash: stored.hash },
    });
    repaired += 1;
    log({ ...cancelBase, outcome: 'repaired' satisfies Outcome, pdfHash: stored.hash });
  } catch (error) {
    errors += 1;
    log({
      ...cancelBase,
      outcome: 'error' satisfies Outcome,
      reason: error instanceof Error ? error.message : 'échec réparation PDF annulation',
    });
  }
}

log({ kind: 'summary', outcome: 'ok', repaired, ok, skipped, errors });
await prisma.$disconnect();
process.exit(errors > 0 ? 1 : 0);
