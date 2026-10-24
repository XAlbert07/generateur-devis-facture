import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.DOCUMENTS_DIR ?? 'var/documents');

function documentPath(companyId: string, documentId: string, kind: 'quotes' | 'invoices' | 'cancellations' = 'quotes'): string {
  return path.join(root, companyId, ...(kind === 'quotes' ? [] : [kind]), `${documentId}.pdf`);
}

async function savePdf(companyId: string, documentId: string, bytes: Buffer, kind: 'quotes' | 'invoices' | 'cancellations') {
  const target = documentPath(companyId, documentId, kind);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return { reference: path.relative(root, target), hash: createHash('sha256').update(bytes).digest('hex') };
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

export async function readQuotePdf(companyId: string, quoteId: string): Promise<Buffer> {
  return readFile(documentPath(companyId, quoteId, 'quotes'));
}

export async function readInvoicePdf(companyId: string, invoiceId: string): Promise<Buffer> {
  return readFile(documentPath(companyId, invoiceId, 'invoices'));
}

export async function readCancellationPdf(companyId: string, invoiceId: string): Promise<Buffer> {
  return readFile(documentPath(companyId, invoiceId, 'cancellations'));
}

export function hashPdf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
