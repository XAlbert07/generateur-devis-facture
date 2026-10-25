import { createHash } from 'node:crypto';
import { getFile, putFile } from '../storage/file-store.js';

type PdfKind = 'quotes' | 'invoices' | 'cancellations' | 'quote-cancellations';

function documentReference(companyId: string, documentId: string, kind: PdfKind = 'quotes'): string {
  return [companyId, ...(kind === 'quotes' ? [] : [kind]), `${documentId}.pdf`].join('/');
}

async function savePdf(companyId: string, documentId: string, bytes: Buffer, kind: PdfKind) {
  const reference = documentReference(companyId, documentId, kind);
  await putFile(companyId, reference, bytes);
  return { reference, hash: hashPdf(bytes) };
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
