import { createHash } from 'node:crypto';
import { getFile, putFile } from '../storage/file-store.js';

type PdfKind = 'quotes' | 'invoices' | 'cancellations' | 'quote-cancellations';

function documentReference(companyId: string, documentId: string, kind: PdfKind = 'quotes'): string {
  return [companyId, ...(kind === 'quotes' ? [] : [kind]), `${documentId}.pdf`].join('/');
}

// Les PDF de devis sont empreints par hashQuotePdf, ceux des factures par hashPdf.
const hashers: Record<PdfKind, (bytes: Buffer) => string> = {
  quotes: hashQuotePdf,
  'quote-cancellations': hashQuotePdf,
  invoices: hashPdf,
  cancellations: hashPdf,
};

async function savePdf(companyId: string, documentId: string, bytes: Buffer, kind: PdfKind) {
  const reference = documentReference(companyId, documentId, kind);
  await putFile(companyId, reference, bytes);
  return { reference, hash: hashers[kind](bytes) };
}

export function saveQuotePdf(companyId: string, quoteId: string, bytes: Buffer) {
  return savePdf(companyId, quoteId, bytes, 'quotes');
}

export function saveInvoicePdf(companyId: string, invoiceId: string, bytes: Buffer) {
  return savePdf(companyId, invoiceId, bytes, 'invoices');
}

export function saveCancellationPdf(companyId: string, invoiceId: string, bytes: Buffer) {
  return savePdf(companyId, invoiceId, bytes, 'cancellations');
}

export function saveQuoteCancellationPdf(companyId: string, quoteId: string, bytes: Buffer) {
  return savePdf(companyId, quoteId, bytes, 'quote-cancellations');
}

export async function readQuotePdf(companyId: string, quoteId: string): Promise<Buffer> {
  return getFile(companyId, documentReference(companyId, quoteId, 'quotes'));
}

export async function readInvoicePdf(companyId: string, invoiceId: string): Promise<Buffer> {
  return getFile(companyId, documentReference(companyId, invoiceId, 'invoices'));
}

export async function readCancellationPdf(companyId: string, invoiceId: string): Promise<Buffer> {
  return getFile(companyId, documentReference(companyId, invoiceId, 'cancellations'));
}

export async function readQuoteCancellationPdf(companyId: string, quoteId: string): Promise<Buffer> {
  return getFile(companyId, documentReference(companyId, quoteId, 'quote-cancellations'));
}

export function hashPdf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Empreinte d'un PDF de devis : SHA-256 du contenu, sans l'identifiant de fichier `/ID`
 * du trailer (dérivé des métadonnées de création). Un PDF régénéré depuis le même
 * instantané a ainsi la même empreinte que l'original.
 */
export function hashQuotePdf(bytes: Buffer): string {
  const normalized = bytes.toString('latin1').replace(/\/ID\s*\[[^\]]*\]/g, '/ID []');
  return createHash('sha256').update(normalized, 'latin1').digest('hex');
}
