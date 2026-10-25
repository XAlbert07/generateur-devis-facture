import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { recordAudit } from '../audit/record.js';
import { invoiceIdFrom, problem, withVersion } from '../invoices/common.js';
import { hashSnapshot } from '../../../shared/documents/snapshot.js';
import { summarizePayments } from './summary.js';

const createInput = z.object({
  amount: z.string().regex(/^[1-9]\d*$/, 'Le montant doit être un entier strictement positif.').transform(BigInt),
  paymentDate: z.string().date(),
  method: z.enum(['VIREMENT', 'ESPECES', 'CHEQUE', 'MOBILE_MONEY', 'CARTE', 'AUTRE']),
  reference: z.string().trim().max(250).nullable().optional(),
});
const cancelInput = z.object({ reason: z.string().trim().min(3).max(500) });
const paymentIdSchema = z.string().uuid();

export const paymentsRouter = Router({ mergeParams: true });

paymentsRouter.get('/', async (request: Request, response: Response) => {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const companyId = request.auth!.companyId;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, include: {
    payments: { orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] }, company: { select: { timezone: true } },
  } });
  if (!invoice) return problem(response, 404, 'Facture introuvable');
  const summary = summarizePayments(invoice.totalInclTax, invoice.dueDate, invoice.company.timezone, invoice.payments);
  withVersion(response, invoice.version);
  response.json({ data: invoice.payments, summary });
});

paymentsRouter.post('/', async (request: Request, response: Response) => {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const key = request.header('idempotency-key');
  if (!key) return problem(response, 400, 'En-tête Idempotency-Key requis');
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) return problem(response, 400, 'Idempotency-Key invalide');
  const parsed = createInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Données de paiement invalides', parsed.error.flatten().fieldErrors);
  const paymentDate = new Date(`${parsed.data.paymentDate}T00:00:00.000Z`);
  if (paymentDate.toISOString().slice(0, 10) !== parsed.data.paymentDate) return problem(response, 422, 'Date de paiement invalide');
  const input = { ...parsed.data, reference: parsed.data.reference ?? null };
  const requestHash = hashSnapshot({ ...input, amount: input.amount.toString() });
  const companyId = request.auth!.companyId;
  const userId = request.auth!.userId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "facture" WHERE "id" = ${invoiceId}::uuid AND "entreprise_id" = ${companyId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } });
    if (!invoice) return { kind: 'not-found' as const };
    const previous = await tx.payment.findFirst({ where: {
      invoiceId, idempotencyKey: key, idempotencyExpiresAt: { gt: new Date() },
    }, orderBy: { createdAt: 'desc' } });
    if (previous) return previous.requestHash === requestHash
      ? { kind: 'replay' as const, payment: previous, version: invoice.version }
      : { kind: 'key-conflict' as const };
    if (invoice.status !== 'EMISE') return { kind: 'invoice-state' as const };
    const aggregate = await tx.payment.aggregate({ where: { invoiceId, cancelledAt: null }, _sum: { amount: true } });
    const paid = aggregate._sum.amount ?? 0n;
    if (input.amount + paid > invoice.totalInclTax) return { kind: 'overpayment' as const };
    const payment = await tx.payment.create({ data: {
      invoiceId, amount: input.amount, paymentDate, method: input.method,
      reference: input.reference, idempotencyKey: key, requestHash, createdByUserId: userId,
      idempotencyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    } });
    const updated = await tx.invoice.updateMany({ where: { id: invoiceId, companyId, status: 'EMISE' }, data: { version: { increment: 1 } } });
    if (!updated.count) throw new Error('La facture a changé pendant l’enregistrement du paiement');
    return { kind: 'created' as const, payment, version: invoice.version + 1 };
  });

  if (result.kind === 'not-found') return problem(response, 404, 'Facture introuvable');
  if (result.kind === 'invoice-state') return problem(response, 409, 'Les paiements exigent une facture émise');
  if (result.kind === 'overpayment') return problem(response, 409, 'Le paiement dépasse le solde restant');
  if (result.kind === 'key-conflict') return problem(response, 409, 'Idempotency-Key déjà utilisée avec une autre requête');
  if (result.kind === 'created') {
    await recordAudit(request, {
      action: 'payment.create', companyId, userId,
      resource: 'payment', resourceId: result.payment.id, metadata: { invoiceId },
    });
  }
  withVersion(response, result.version);
  response.status(result.kind === 'created' ? 201 : 200).json(result.payment);
});

paymentsRouter.post('/:paymentId/cancel', async (request: Request, response: Response) => {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const parsedId = paymentIdSchema.safeParse(request.params.paymentId);
  if (!parsedId.success) return problem(response, 404, 'Paiement introuvable');
  const parsed = cancelInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Motif d’annulation invalide', parsed.error.flatten().fieldErrors);
  const companyId = request.auth!.companyId;
  const userId = request.auth!.userId;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "facture" WHERE "id" = ${invoiceId}::uuid AND "entreprise_id" = ${companyId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } });
    if (!invoice) return { kind: 'not-found' as const };
    if (invoice.status !== 'EMISE') return { kind: 'invoice-state' as const };
    const payment = await tx.payment.findFirst({ where: { id: parsedId.data, invoiceId } });
    if (!payment) return { kind: 'payment-not-found' as const };
    if (payment.cancelledAt) return { kind: 'replay' as const, payment, version: invoice.version };
    const changed = await tx.payment.updateMany({ where: { id: payment.id, invoiceId, cancelledAt: null }, data: {
      cancelledAt: new Date(), cancelledByUserId: userId, cancellationReason: parsed.data.reason,
    } });
    if (!changed.count) throw new Error('Le paiement a changé pendant son annulation');
    await tx.invoice.updateMany({ where: { id: invoiceId, companyId, status: 'EMISE' }, data: { version: { increment: 1 } } });
    return { kind: 'cancelled' as const, payment: await tx.payment.findUniqueOrThrow({ where: { id: payment.id } }), version: invoice.version + 1 };
  });

  if (result.kind === 'not-found') return problem(response, 404, 'Facture introuvable');
  if (result.kind === 'payment-not-found') return problem(response, 404, 'Paiement introuvable');
  if (result.kind === 'invoice-state') return problem(response, 409, 'La facture doit être émise pour annuler un paiement');
  if (result.kind === 'cancelled') {
    await recordAudit(request, {
      action: 'payment.cancel', companyId, userId,
      resource: 'payment', resourceId: result.payment.id, metadata: { invoiceId },
    });
  }
  withVersion(response, result.version);
  response.status(200).json(result.payment);
});
