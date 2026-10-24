import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { hashSnapshot } from '../../../shared/documents/snapshot.js';
import { renderDocumentPdf } from '../quotes/pdf.js';
import { hashPdf, readCancellationPdf, saveCancellationPdf } from '../quotes/pdf-storage.js';
import { invoiceIdFrom, problem, versionFrom, withVersion } from './common.js';

const reasonInput = z.object({ reason: z.string().trim().min(3).max(500) });

export async function cancelInvoice(request: Request, response: Response): Promise<void> {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const version = versionFrom(request);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const parsed = reasonInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Motif d’annulation invalide', parsed.error.flatten().fieldErrors);
  const companyId = request.auth!.companyId;
  const userId = request.auth!.userId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "facture" WHERE "id" = ${invoiceId}::uuid AND "entreprise_id" = ${companyId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId }, include: {
      payments: { where: { cancelledAt: null }, select: { id: true } },
    } });
    if (!invoice) return { kind: 'not-found' as const };
    if (invoice.status === 'ANNULEE') return { kind: 'already-cancelled' as const };
    if (invoice.status !== 'EMISE') return { kind: 'state-conflict' as const };
    if (invoice.payments.length) return { kind: 'payments-exist' as const };
    if (!invoice.snapshot || !invoice.snapshotHash) return { kind: 'snapshot-missing' as const };
    const cancelledAt = new Date();
    const changed = await tx.invoice.updateMany({ where: { id: invoiceId, companyId, status: 'EMISE', version }, data: {
      status: 'ANNULEE', cancelledAt, cancelledByUserId: userId,
      cancellationReason: parsed.data.reason, version: { increment: 1 },
    } });
    if (!changed.count) return { kind: 'state-conflict' as const };
    return { kind: 'cancelled' as const };
  });

  if (result.kind === 'not-found') return problem(response, 404, 'Facture introuvable');
  if (result.kind === 'state-conflict') return problem(response, 409, 'Seule une facture émise peut être annulée');
  if (result.kind === 'payments-exist') return problem(response, 409, 'Un paiement valide existe; un avoir est nécessaire');
  if (result.kind === 'snapshot-missing') return problem(response, 409, 'Instantané de facture manquant');

  if (result.kind === 'cancelled') {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, select: {
      snapshot: true, snapshotHash: true, cancelledAt: true, cancellationReason: true,
    } });
    if (invoice?.snapshot && invoice.cancelledAt && invoice.cancellationReason) {
      try {
        const bytes = await renderDocumentPdf({
          ...(invoice.snapshot as Record<string, unknown>),
          cancellation: { cancelledAt: invoice.cancelledAt, reason: invoice.cancellationReason },
        });
        const stored = await saveCancellationPdf(companyId, invoiceId, bytes);
        await prisma.invoice.updateMany({ where: { id: invoiceId, companyId, snapshotHash: invoice.snapshotHash }, data: {
          cancellationPdf: stored.reference, cancellationPdfHash: stored.hash,
        } });
      } catch (error) {
        console.error('PDF d’annulation indisponible', error);
      }
    }
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
  if (!invoice) return problem(response, 500, 'Facture annulée introuvable');
  withVersion(response, invoice.version);
  response.json(invoice);
}

export async function getCancellationPdf(request: Request, response: Response): Promise<void> {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const companyId = request.auth!.companyId;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, select: {
    id: true, number: true, status: true, snapshot: true, snapshotHash: true,
    cancellationPdfHash: true, cancelledAt: true, cancellationReason: true,
  } });
  if (!invoice) return problem(response, 404, 'Facture introuvable');
  if (invoice.status !== 'ANNULEE' || !invoice.snapshot || !invoice.snapshotHash || !invoice.cancelledAt || !invoice.cancellationReason) return problem(response, 409, 'Le PDF est disponible après l’annulation');
  if (hashSnapshot(invoice.snapshot) !== invoice.snapshotHash) return problem(response, 409, 'L’instantané de la facture ne correspond plus à son empreinte');

  let bytes: Buffer;
  try {
    bytes = await readCancellationPdf(companyId, invoiceId);
    if (!invoice.cancellationPdfHash || hashPdf(bytes) !== invoice.cancellationPdfHash) throw new Error('Empreinte PDF d’annulation incorrecte');
  } catch {
    bytes = await renderDocumentPdf({
      ...(invoice.snapshot as Record<string, unknown>),
      cancellation: { cancelledAt: invoice.cancelledAt, reason: invoice.cancellationReason },
    });
    const stored = await saveCancellationPdf(companyId, invoiceId, bytes);
    await prisma.invoice.updateMany({ where: { id: invoiceId, companyId, snapshotHash: invoice.snapshotHash }, data: {
      cancellationPdf: stored.reference, cancellationPdfHash: stored.hash,
    } });
  }
  response.status(200).type('application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="facture-${invoice.number ?? invoiceId}-annulee.pdf"`).send(bytes);
}
