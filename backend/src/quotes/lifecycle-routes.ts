import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { acceptanceDateError, companyCalendarYear, startOfCompanyDay } from '../../../shared/documents/date-only.js';
import { hashSnapshot, quoteSnapshot } from './document.js';
import { problem, quoteIdFrom, versionFrom, withVersion } from './common.js';
import { recordAudit } from '../audit/record.js';
import { renderQuotePdf } from './pdf.js';
import { hashQuotePdf, readQuoteCancellationPdf, readQuotePdf, saveQuoteCancellationPdf, saveQuotePdf } from './pdf-storage.js';

const quoteInclude = {
  lines: { orderBy: { position: 'asc' as const } },
  company: { select: {
    id: true, name: true, address: true, phone: true, email: true, taxIdentifiers: true, logoReference: true, logoHash: true,
    currency: true, decimals: true, timezone: true, quotePrefix: true, legalMentions: true,
    footerText: true, paymentTerms: true, paymentDetails: true,
  } },
  client: { select: { id: true, name: true, email: true, phone: true, address: true, taxIdentifier: true } },
} satisfies Prisma.QuoteInclude;

/** Motif d’annulation : obligatoire (§7). Motif de refus : facultatif. */
const cancelReasonInput = z.object({ reason: z.string().trim().min(3).max(500) });
const refuseReasonInput = z.object({ reason: z.string().trim().max(500).optional() });

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
    const year = companyCalendarYear(current.company.timezone);
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
  await recordAudit(request, {
    action: 'quote.send', companyId, userId: request.auth!.userId,
    resource: 'quote', resourceId: quote.id, metadata: { number: quote.number },
  });
  const result = await prisma.quote.findFirst({ where: { id: quote.id, companyId } });
  if (!result) return problem(response, 500, 'Le devis envoyé est introuvable');
  withVersion(response, result.version); response.json(result);
}

export async function acceptQuote(request: Request, response: Response): Promise<void> {
  const version = requiredVersion(request, response); if (!version) return;
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const raw = request.body?.acceptanceDate;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return problem(response, 422, 'La date d’acceptation est requise (YYYY-MM-DD)');
  const acceptanceDate = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(acceptanceDate.getTime()) || acceptanceDate.toISOString().slice(0, 10) !== raw) {
    return problem(response, 422, 'La date d’acceptation doit être une date calendaire valide');
  }
  const companyId = request.auth!.companyId;
  const timezone = (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))?.timezone ?? 'UTC';

  // Statut stocké ENVOYE même si la validité est dépassée : l’expiration est un
  // affichage (§7). L’intervalle de date porte la conformité métier.
  const current = await prisma.quote.findFirst({
    where: { id: quoteId, companyId, version, status: 'ENVOYE' },
    select: { sentAt: true, validUntil: true },
  });
  if (!current?.sentAt) return problem(response, 409, 'Transition interdite, version obsolète ou devis introuvable');

  const today = startOfCompanyDay(timezone);
  const windowError = acceptanceDateError({
    acceptanceDate, sentAt: current.sentAt, validUntil: current.validUntil, today, timeZone: timezone,
  });
  if (windowError) return problem(response, 422, windowError);

  const recordedAt = new Date();
  const changed = await prisma.quote.updateMany({
    where: { id: quoteId, companyId, version, status: 'ENVOYE' },
    data: { status: 'ACCEPTE', acceptanceDate, acceptanceRecordedAt: recordedAt, version: { increment: 1 } },
  });
  if (!changed.count) return problem(response, 409, 'Transition interdite, version obsolète ou devis introuvable');
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: { orderBy: { position: 'asc' } } } });
  withVersion(response, quote.version); response.json(quote);
}

export async function refuseQuote(request: Request, response: Response): Promise<void> {
  const version = requiredVersion(request, response); if (!version) return;
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const parsed = refuseReasonInput.safeParse(request.body ?? {});
  if (!parsed.success) return problem(response, 422, 'Motif de refus invalide', parsed.error.flatten().fieldErrors);
  const companyId = request.auth!.companyId;
  const reason = parsed.data.reason?.trim() ? parsed.data.reason.trim() : null;
  // Un devis envoyé reste refusible même après la date de validité (§7).
  const changed = await prisma.quote.updateMany({
    where: { id: quoteId, companyId, version, status: 'ENVOYE' },
    data: {
      status: 'REFUSE', refusedAt: new Date(), refusalReason: reason, version: { increment: 1 },
    },
  });
  if (!changed.count) return problem(response, 409, 'Transition interdite, version obsolète ou devis introuvable');
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: { orderBy: { position: 'asc' } } } });
  withVersion(response, quote.version); response.json(quote);
}

export async function cancelQuote(request: Request, response: Response): Promise<void> {
  const version = requiredVersion(request, response); if (!version) return;
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const parsed = cancelReasonInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Motif d’annulation invalide', parsed.error.flatten().fieldErrors);
  const companyId = request.auth!.companyId;
  const userId = request.auth!.userId;

  const current = await prisma.quote.findFirst({
    where: { id: quoteId, companyId, version, status: { in: ['ENVOYE', 'ACCEPTE'] } },
    select: { status: true },
  });
  if (!current) return problem(response, 409, 'Transition interdite, version obsolète ou devis introuvable');
  if (current.status === 'ACCEPTE') {
    const linked = await prisma.invoice.findFirst({ where: { quoteId, companyId }, select: { id: true } });
    if (linked) return problem(response, 409, 'Un devis accepté lié à une facture ne peut pas être annulé');
  }

  const changed = await prisma.quote.updateMany({
    where: { id: quoteId, companyId, version, status: current.status },
    data: {
      status: 'ANNULE', cancelledAt: new Date(), cancelledByUserId: userId,
      cancellationReason: parsed.data.reason, version: { increment: 1 },
    },
  });
  if (!changed.count) return problem(response, 409, 'Transition interdite, version obsolète ou devis introuvable');
  const cancelled = await prisma.quote.findFirst({ where: { id: quoteId, companyId }, select: {
    snapshot: true, snapshotHash: true, cancelledAt: true, cancellationReason: true,
  } });
  if (cancelled?.snapshot && cancelled.snapshotHash && cancelled.cancelledAt && cancelled.cancellationReason) {
    try {
      const bytes = await renderQuotePdf({
        ...(cancelled.snapshot as Record<string, unknown>),
        cancellation: { cancelledAt: cancelled.cancelledAt, reason: cancelled.cancellationReason },
      });
      const stored = await saveQuoteCancellationPdf(companyId, quoteId, bytes);
      await prisma.quote.updateMany({ where: { id: quoteId, companyId, snapshotHash: cancelled.snapshotHash }, data: {
        cancellationPdf: stored.reference, cancellationPdfHash: stored.hash,
      } });
    } catch (error) {
      console.error('PDF d’annulation du devis indisponible', error);
    }
  }
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: { orderBy: { position: 'asc' } } } });
  withVersion(response, quote.version); response.json(quote);
}

/**
 * L’état « expire » est calculé (§7), pas stocké. Conservé comme no-op pour
 * les appels existants (liste, détail, tableau de bord) ; le filtre et l’UI
 * dérivent l’affichage de `ENVOYE` + `date_validite`.
 */
export async function expireQuotes(_companyId: string): Promise<void> {
  // Intentionnellement vide : ne plus muter ENVOYE → EXPIRE.
}

export async function getQuotePdf(request: Request, response: Response): Promise<void> {
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const companyId = request.auth!.companyId;
  const draft = await prisma.quote.findFirst({ where: { id: quoteId, companyId, status: 'BROUILLON' }, include: quoteInclude });
  if (draft) {
    const { company, client, ...document } = draft;
    const live = quoteSnapshot({ ...document, number: document.number ?? 'BROUILLON', status: 'BROUILLON' }, company, client);
    const bytes = await renderQuotePdf(live.snapshot, { draft: true });
    response.status(200).type('application/pdf')
      .setHeader('Content-Disposition', `inline; filename="devis-${quoteId}-brouillon.pdf"`)
      .setHeader('Cache-Control', 'no-store')
      .send(bytes);
    return;
  }
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId }, select: { id: true, companyId: true, status: true, snapshot: true, snapshotHash: true, pdfHash: true } });
  if (!quote) return problem(response, 404, 'Devis introuvable');
  if (!quote.snapshot || !quote.snapshotHash || !['ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'CONVERTI', 'ANNULE'].includes(quote.status)) return problem(response, 409, 'Le PDF est disponible après l’envoi du devis');
  if (hashSnapshot(quote.snapshot) !== quote.snapshotHash) return problem(response, 409, 'L’instantané du devis ne correspond plus à son empreinte');
  let bytes: Buffer;
  try {
    bytes = await readQuotePdf(companyId, quoteId);
    if (!quote.pdfHash || hashQuotePdf(bytes) !== quote.pdfHash) throw new Error('Empreinte du PDF invalide');
  } catch {
    bytes = await renderQuotePdf(quote.snapshot);
    const stored = await saveQuotePdf(companyId, quoteId, bytes);
    await prisma.quote.updateMany({ where: { id: quoteId, companyId, snapshotHash: quote.snapshotHash }, data: { pdfReference: stored.reference, pdfHash: stored.hash } });
  }
  response.status(200).type('application/pdf').setHeader('Content-Disposition', `attachment; filename="devis-${quoteId}.pdf"`).send(bytes);
}

export async function getQuoteCancellationPdf(request: Request, response: Response): Promise<void> {
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const companyId = request.auth!.companyId;
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId }, select: {
    id: true, number: true, status: true, snapshot: true, snapshotHash: true,
    cancellationPdfHash: true, cancelledAt: true, cancellationReason: true,
  } });
  if (!quote) return problem(response, 404, 'Devis introuvable');
  if (quote.status !== 'ANNULE' || !quote.snapshot || !quote.snapshotHash || !quote.cancelledAt || !quote.cancellationReason) {
    return problem(response, 409, 'Le PDF est disponible après l’annulation');
  }
  if (hashSnapshot(quote.snapshot) !== quote.snapshotHash) return problem(response, 409, 'L’instantané du devis ne correspond plus à son empreinte');

  let bytes: Buffer;
  try {
    bytes = await readQuoteCancellationPdf(companyId, quoteId);
    if (!quote.cancellationPdfHash || hashQuotePdf(bytes) !== quote.cancellationPdfHash) throw new Error('Empreinte PDF d’annulation incorrecte');
  } catch {
    bytes = await renderQuotePdf({
      ...(quote.snapshot as Record<string, unknown>),
      cancellation: { cancelledAt: quote.cancelledAt, reason: quote.cancellationReason },
    });
    const stored = await saveQuoteCancellationPdf(companyId, quoteId, bytes);
    await prisma.quote.updateMany({ where: { id: quoteId, companyId, snapshotHash: quote.snapshotHash }, data: {
      cancellationPdf: stored.reference, cancellationPdfHash: stored.hash,
    } });
  }
  response.status(200).type('application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="devis-${quote.number ?? quoteId}-annule.pdf"`)
    .send(bytes);
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
  if (result.created) {
    await recordAudit(request, {
      action: 'quote.convert', companyId, userId: request.auth!.userId,
      resource: 'invoice', resourceId: result.invoice.id, metadata: { quoteId },
    });
  }
  response.status(result.created ? 201 : 200).json(result.invoice);
}
