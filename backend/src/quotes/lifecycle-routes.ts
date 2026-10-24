import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { hashSnapshot, quoteSnapshot } from './document.js';
import { problem, quoteIdFrom, startOfCompanyDay, versionFrom, withVersion } from './common.js';
import { renderQuotePdf } from './pdf.js';
import { hashPdf, readQuotePdf, saveQuotePdf } from './pdf-storage.js';

const quoteInclude = {
  lines: { orderBy: { position: 'asc' as const } },
  company: { select: {
    id: true, name: true, address: true, phone: true, email: true, taxIdentifiers: true, logoReference: true, logoHash: true,
    currency: true, decimals: true, timezone: true, quotePrefix: true, legalMentions: true,
    footerText: true, paymentTerms: true, paymentDetails: true,
  } },
  client: { select: { id: true, name: true, email: true, phone: true, address: true, taxIdentifier: true } },
} satisfies Prisma.QuoteInclude;

function requiredVersion(request: Request, response: Response): number | undefined {
  const version = versionFrom(request);
  if (!version) problem(response, 428, 'En-tête If-Match requis');
  return version;
}

export async function sendQuote(request: Request, response: Response): Promise<void> {
  const version = requiredVersion(request, response); if (!version) return;
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const companyId = request.auth!.companyId;
  const quote = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "devis" WHERE "id" = ${quoteId}::uuid AND "entreprise_id" = ${companyId}::uuid FOR UPDATE`;
    const current = await tx.quote.findFirst({ where: { id: quoteId, companyId, version, status: 'BROUILLON' }, include: quoteInclude });
    if (!current || !current.clientId || (current.validUntil && current.validUntil < startOfCompanyDay(current.company.timezone))) return null;
    const year = new Date().getUTCFullYear();
    const sequence = await tx.documentSequence.upsert({
      where: { companyId_type_year: { companyId, type: 'DEVIS', year } },
      create: { companyId, type: 'DEVIS', year, lastNumber: 1 }, update: { lastNumber: { increment: 1 } },
    });
    const number = `${current.company.quotePrefix ?? 'DEV'}-${year}-${String(sequence.lastNumber).padStart(5, '0')}`;
    const { company, client, ...document } = current;
    const frozen = quoteSnapshot({ ...document, number, status: 'ENVOYE' }, company, client);
    const changed = await tx.quote.updateMany({ where: { id: current.id, version, status: 'BROUILLON' }, data: {
      number, status: 'ENVOYE', sentAt: new Date(), snapshot: frozen.snapshot as never,
      snapshotVersion: 1, snapshotHash: frozen.hash, version: { increment: 1 },
    } });
    if (!changed.count) return null;
    return tx.quote.findUnique({ where: { id: current.id }, include: { lines: { orderBy: { position: 'asc' } } } });
  });
  if (!quote) return problem(response, 409, 'Le devis doit être un brouillon avec un client actif et non modifié');
  try {
    const pdf = await renderQuotePdf(quote.snapshot);
    const stored = await saveQuotePdf(companyId, quote.id, pdf);
    await prisma.quote.updateMany({ where: { id: quote.id, companyId, snapshotHash: quote.snapshotHash }, data: { pdfReference: stored.reference, pdfHash: stored.hash } });
  } catch (error) {
    // Le snapshot est durable et GET /pdf sait réparer un fichier manquant.
    console.error('PDF du devis indisponible après envoi', error);
  }
  const result = await prisma.quote.findFirst({ where: { id: quote.id, companyId } });
  if (!result) return problem(response, 500, 'Le devis envoyé est introuvable');
  withVersion(response, result.version); response.json(result);
}

async function changeStatus(request: Request, response: Response, from: 'ENVOYE' | 'ACCEPTE', to: 'ACCEPTE' | 'REFUSE' | 'ANNULE', acceptanceDate?: Date | null): Promise<void> {
  const version = requiredVersion(request, response); if (!version) return;
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const timezone = (await prisma.company.findUnique({ where: { id: request.auth!.companyId }, select: { timezone: true } }))?.timezone ?? 'UTC';
  if (from === 'ENVOYE') {
    await prisma.quote.updateMany({ where: { id: quoteId, companyId: request.auth!.companyId, status: 'ENVOYE', validUntil: { lt: startOfCompanyDay(timezone) } }, data: { status: 'EXPIRE', version: { increment: 1 } } });
  }
  const changed = await prisma.quote.updateMany({ where: { id: quoteId, companyId: request.auth!.companyId, version, status: from }, data: {
    status: to, acceptanceDate: acceptanceDate ?? null, version: { increment: 1 },
  } });
  if (!changed.count) return problem(response, 409, 'Transition interdite, version obsolète ou devis introuvable');
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: { orderBy: { position: 'asc' } } } });
  withVersion(response, quote.version); response.json(quote);
}

export async function acceptQuote(request: Request, response: Response): Promise<void> {
  const raw = request.body?.acceptanceDate;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return problem(response, 422, 'La date d’acceptation est requise (YYYY-MM-DD)');
  const acceptanceDate = new Date(`${raw}T00:00:00.000Z`);
  const timezone = (await prisma.company.findUnique({ where: { id: request.auth!.companyId }, select: { timezone: true } }))?.timezone ?? 'UTC';
  if (!Number.isFinite(acceptanceDate.getTime()) || acceptanceDate.toISOString().slice(0, 10) !== raw || acceptanceDate > startOfCompanyDay(timezone)) return problem(response, 422, 'La date d’acceptation doit être une date passée ou celle du jour');
  return changeStatus(request, response, 'ENVOYE', 'ACCEPTE', acceptanceDate);
}

export async function refuseQuote(request: Request, response: Response): Promise<void> {
  return changeStatus(request, response, 'ENVOYE', 'REFUSE');
}

export async function cancelQuote(request: Request, response: Response): Promise<void> {
  return changeStatus(request, response, 'ENVOYE', 'ANNULE');
}

export async function expireQuotes(companyId: string): Promise<void> {
  const timezone = (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))?.timezone ?? 'UTC';
  await prisma.quote.updateMany({ where: { companyId, status: 'ENVOYE', validUntil: { lt: startOfCompanyDay(timezone) } }, data: { status: 'EXPIRE', version: { increment: 1 } } });
}

export async function getQuotePdf(request: Request, response: Response): Promise<void> {
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const companyId = request.auth!.companyId;
  let quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId }, select: { id: true, companyId: true, status: true, snapshot: true, snapshotHash: true, pdfHash: true } });
  if (!quote) return problem(response, 404, 'Devis introuvable');
  if (!quote.snapshot || !quote.snapshotHash || !['ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'CONVERTI', 'ANNULE'].includes(quote.status)) return problem(response, 409, 'Le PDF est disponible après l’envoi du devis');
  if (hashSnapshot(quote.snapshot) !== quote.snapshotHash) return problem(response, 409, 'L’instantané du devis ne correspond plus à son empreinte');
  let bytes: Buffer;
  try {
    bytes = await readQuotePdf(companyId, quoteId);
    if (!quote.pdfHash || hashPdf(bytes) !== quote.pdfHash) throw new Error('Empreinte du PDF invalide');
  } catch {
    bytes = await renderQuotePdf(quote.snapshot);
    const stored = await saveQuotePdf(companyId, quoteId, bytes);
    await prisma.quote.updateMany({ where: { id: quoteId, companyId, snapshotHash: quote.snapshotHash }, data: { pdfReference: stored.reference, pdfHash: stored.hash } });
    quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId }, select: { id: true, companyId: true, status: true, snapshot: true, snapshotHash: true, pdfHash: true } });
  }
  response.status(200).type('application/pdf').setHeader('Content-Disposition', `attachment; filename="devis-${quoteId}.pdf"`).send(bytes);
}

export async function convertQuote(request: Request, response: Response): Promise<void> {
  const version = requiredVersion(request, response); if (!version) return;
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const companyId = request.auth!.companyId;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "devis" WHERE "id" = ${quoteId}::uuid AND "entreprise_id" = ${companyId}::uuid FOR UPDATE`;
    const previous = await tx.invoice.findFirst({ where: { quoteId, companyId }, include: { lines: { orderBy: { position: 'asc' } } } });
    if (previous) return { invoice: previous, created: false };
    const quote = await tx.quote.findFirst({ where: { id: quoteId, companyId, status: 'ACCEPTE', version }, include: { lines: { orderBy: { position: 'asc' } } } });
    if (!quote || !quote.snapshot || !quote.snapshotHash) return null;
    const snapshot = { version: 1, origin: 'DEVIS', quoteSnapshot: quote.snapshot, acceptanceDate: quote.acceptanceDate };
    const invoice = await tx.invoice.create({ data: {
      companyId, clientId: quote.clientId, quoteId, status: 'BROUILLON', origin: 'DEVIS', currency: quote.currency,
      subtotalExclTax: quote.subtotalExclTax, globalDiscount: quote.globalDiscount,
      totalExclTax: quote.totalExclTax, totalTax: quote.totalTax, totalInclTax: quote.totalInclTax,
      ...(quote.taxBreakdown !== null ? { taxBreakdown: quote.taxBreakdown as never } : {}), snapshot: snapshot as never,
      snapshotVersion: 1, snapshotHash: hashSnapshot(snapshot),
      lines: { create: quote.lines.map(({ id: _id, quoteId: _quoteId, ...line }) => line) },
    }, include: { lines: { orderBy: { position: 'asc' } } } });
    const changed = await tx.quote.updateMany({ where: { id: quoteId, companyId, status: 'ACCEPTE', version }, data: { status: 'CONVERTI', version: { increment: 1 } } });
    if (!changed.count) throw new Error('État du devis modifié pendant la conversion');
    return { invoice, created: true };
  });
  if (!result) return problem(response, 409, 'Seul un devis accepté et envoyé peut être converti');
  response.status(result.created ? 201 : 200).json(result.invoice);
}
