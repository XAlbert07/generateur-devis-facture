import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { hashSnapshot } from '../../../shared/documents/snapshot.js';
import { addDateOnlyDays, companyCalendarYear, startOfCompanyDay } from '../../../shared/documents/date-only.js';
import { recordAudit } from '../audit/record.js';
import { renderDocumentPdf } from '../quotes/pdf.js';
import { hashPdf, readInvoicePdf, saveInvoicePdf } from '../quotes/pdf-storage.js';
import { invoiceIdFrom, problem, versionFrom, withVersion } from './common.js';

const issueInclude = {
  lines: { orderBy: { position: 'asc' as const } },
  company: { select: {
    id: true, name: true, address: true, phone: true, email: true, taxIdentifiers: true, logoReference: true, logoHash: true,
    currency: true, decimals: true, timezone: true, invoicePrefix: true, paymentDelayDays: true,
    legalMentions: true, footerText: true, paymentTerms: true, paymentDetails: true,
  } },
  client: { select: { id: true, name: true, email: true, phone: true, address: true, taxIdentifier: true } },
} satisfies Prisma.InvoiceInclude;

export async function issueInvoice(request: Request, response: Response): Promise<void> {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const version = versionFrom(request);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const companyId = request.auth!.companyId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "facture" WHERE "id" = ${invoiceId}::uuid AND "entreprise_id" = ${companyId}::uuid FOR UPDATE`;
    const current = await tx.invoice.findFirst({ where: { id: invoiceId, companyId }, include: issueInclude });
    if (!current) return { kind: 'conflict' as const };
    if (current.status === 'EMISE') return { kind: 'ok' as const, invoice: current, newlyIssued: false };
    if (current.status !== 'BROUILLON' || current.version !== version) return { kind: 'conflict' as const };
    if (!current.clientId || !current.client) return { kind: 'missing-client' as const };
    const activeClient = await tx.client.findFirst({
      where: { id: current.clientId, companyId, archivedAt: null }, select: { id: true },
    });
    if (!activeClient) return { kind: 'missing-client' as const };

    const issueDate = startOfCompanyDay(current.company.timezone);
    const dueDate = addDateOnlyDays(issueDate, current.company.paymentDelayDays);
    const year = companyCalendarYear(current.company.timezone, issueDate);
    const sequence = await tx.documentSequence.upsert({
      where: { companyId_type_year: { companyId, type: 'FACTURE', year } },
      create: { companyId, type: 'FACTURE', year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const number = `${current.company.invoicePrefix}-${year}-${String(sequence.lastNumber).padStart(5, '0')}`;
    const document = {
      id: current.id, number, status: 'EMISE', origin: current.origin,
      issueDate, dueDate, currency: current.currency,
      subtotalExclTax: current.subtotalExclTax, globalDiscount: current.globalDiscount,
      totalExclTax: current.totalExclTax, totalTax: current.totalTax, totalInclTax: current.totalInclTax,
      taxBreakdown: current.taxBreakdown, lines: current.lines,
    };
    const snapshot = {
      version: 1, documentType: 'FACTURE', document,
      company: current.company, client: current.client, sourceQuoteSnapshot: current.snapshot,
    };
    const changed = await tx.invoice.updateMany({ where: { id: invoiceId, companyId, version, status: 'BROUILLON' }, data: {
      number, status: 'EMISE', issueDate, dueDate,
      snapshot: snapshot as never, snapshotVersion: 1, snapshotHash: hashSnapshot(snapshot),
      version: { increment: 1 },
    } });
    if (!changed.count) return { kind: 'conflict' as const };
    return { kind: 'ok' as const, invoice: await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } }), newlyIssued: true };
  });

  if (result.kind === 'missing-client') return problem(response, 422, 'Un client actif est obligatoire pour émettre la facture');
  if (result.kind === 'conflict') return problem(response, 409, 'Facture non brouillon, version obsolète ou introuvable');
  if (result.newlyIssued) {
    try {
      const bytes = await renderDocumentPdf(result.invoice.snapshot);
      const stored = await saveInvoicePdf(companyId, invoiceId, bytes);
      await prisma.invoice.updateMany({ where: { id: invoiceId, companyId, snapshotHash: result.invoice.snapshotHash }, data: { pdfReference: stored.reference, pdfHash: stored.hash } });
    } catch (error) {
      // L'instantané a été émis durablement; GET /pdf peut reconstruire le fichier.
      console.error('PDF de la facture indisponible après émission', error);
    }
  }
  if (result.newlyIssued) {
    await recordAudit(request, {
      action: 'invoice.issue', companyId, userId: request.auth!.userId,
      resource: 'invoice', resourceId: invoiceId, metadata: { number: result.invoice.number },
    });
  }
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, include: { lines: { orderBy: { position: 'asc' } } } });
  if (!invoice) return problem(response, 500, 'Facture émise introuvable');
  withVersion(response, invoice.version);
  response.json(invoice);
}

export async function getInvoicePdf(request: Request, response: Response): Promise<void> {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const companyId = request.auth!.companyId;
  const draft = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId, status: 'BROUILLON' },
    include: issueInclude,
  });
  if (draft) {
    const { company, client, ...document } = draft;
    const live = {
      version: 1, documentType: 'FACTURE' as const,
      document: { ...document, number: document.number ?? 'BROUILLON', status: 'BROUILLON' },
      company, client,
    };
    const bytes = await renderDocumentPdf(live, { draft: true });
    response.status(200).type('application/pdf')
      .setHeader('Content-Disposition', `inline; filename="facture-${invoiceId}-brouillon.pdf"`)
      .setHeader('Cache-Control', 'no-store')
      .send(bytes);
    return;
  }
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, select: {
    id: true, status: true, snapshot: true, snapshotHash: true, pdfHash: true,
  } });
  if (!invoice) return problem(response, 404, 'Facture introuvable');
  if (!['EMISE', 'ANNULEE'].includes(invoice.status) || !invoice.snapshot || !invoice.snapshotHash) return problem(response, 409, 'Le PDF est disponible après l’émission de la facture');
  if (hashSnapshot(invoice.snapshot) !== invoice.snapshotHash) return problem(response, 409, 'L’instantané de la facture ne correspond plus à son empreinte');
  let bytes: Buffer;
  try {
    bytes = await readInvoicePdf(companyId, invoiceId);
    if (!invoice.pdfHash || hashPdf(bytes) !== invoice.pdfHash) throw new Error('Empreinte PDF incorrecte');
  } catch {
    bytes = await renderDocumentPdf(invoice.snapshot);
    const stored = await saveInvoicePdf(companyId, invoiceId, bytes);
    await prisma.invoice.updateMany({ where: { id: invoiceId, companyId, snapshotHash: invoice.snapshotHash }, data: { pdfReference: stored.reference, pdfHash: stored.hash } });
  }
  response.status(200).type('application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="facture-${invoiceId}.pdf"`).send(bytes);
}
