import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { calculateDocument, type DocumentInput } from '../documents/calculation.js';
import { invoiceIdFrom, problem, versionFrom, withVersion } from './common.js';

const integer = z.string().regex(/^\d+$/).transform(BigInt);
const discount = z.object({ type: z.enum(['POURCENTAGE', 'MONTANT_FIXE']), value: integer }).nullable().optional();
const invoiceDraftInput = z.object({
  clientId: z.string().uuid().nullable().optional(), globalDiscount: discount,
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(2_000),
    quantityMilli: integer.refine((value) => value > 0n), unitPrice: integer,
    taxRateBasisPts: z.number().int().min(0).max(10_000), discount,
  })).min(1).max(200),
});

async function activeClient(companyId: string, clientId: string | null | undefined) {
  if (!clientId) return true;
  return Boolean(await prisma.client.findFirst({ where: { id: clientId, companyId, archivedAt: null }, select: { id: true } }));
}

function calculate(input: DocumentInput, response: Response) {
  try { return calculateDocument(input); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    problem(response, 422, 'Remise ou montant de ligne invalide', { lines: error.message });
    return null;
  }
}

export async function createManualInvoice(request: Request, response: Response): Promise<void> {
  const parsed = invoiceDraftInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Données de facture invalides', parsed.error.flatten().fieldErrors);
  const companyId = request.auth!.companyId;
  const input = parsed.data as DocumentInput & { clientId?: string | null };
  if (!await activeClient(companyId, input.clientId)) return problem(response, 422, 'Client introuvable ou archivé');
  const calculated = calculate(input, response); if (!calculated) return;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { currency: true } });
  if (!company) return problem(response, 404, 'Entreprise introuvable');
  const invoice = await prisma.invoice.create({ data: {
    companyId, clientId: input.clientId ?? null, origin: 'MANUELLE', status: 'BROUILLON',
    currency: company.currency, ...calculated, taxBreakdown: calculated.taxBreakdown as never,
    lines: { create: calculated.lines },
  }, include: { lines: { orderBy: { position: 'asc' } } } });
  withVersion(response, invoice.version);
  response.status(201).json(invoice);
}

export async function updateManualInvoice(request: Request, response: Response): Promise<void> {
  const parsed = invoiceDraftInput.safeParse(request.body);
  const version = versionFrom(request);
  if (!parsed.success) return problem(response, 422, 'Données de facture invalides', parsed.error.flatten().fieldErrors);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const companyId = request.auth!.companyId;
  const input = parsed.data as DocumentInput & { clientId?: string | null };
  if (!await activeClient(companyId, input.clientId)) return problem(response, 422, 'Client introuvable ou archivé');
  const calculated = calculate(input, response); if (!calculated) return;
  const { lines, ...totals } = calculated;
  const invoice = await prisma.$transaction(async (tx) => {
    const changed = await tx.invoice.updateMany({
      where: { id: invoiceId, companyId, version, status: 'BROUILLON', origin: 'MANUELLE' },
      data: { clientId: input.clientId ?? null, ...totals, taxBreakdown: calculated.taxBreakdown as never, version: { increment: 1 } },
    });
    if (!changed.count) return null;
    await tx.invoiceLine.deleteMany({ where: { invoiceId } });
    await tx.invoiceLine.createMany({ data: lines.map((line) => ({ ...line, invoiceId })) });
    return tx.invoice.findFirst({ where: { id: invoiceId, companyId }, include: { lines: { orderBy: { position: 'asc' } } } });
  });
  if (!invoice) return problem(response, 409, 'Facture modifiée, non brouillon ou introuvable');
  withVersion(response, invoice.version); response.json(invoice);
}

export async function deleteDraftInvoice(request: Request, response: Response): Promise<void> {
  const version = versionFrom(request);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const companyId = request.auth!.companyId;
  const deleted = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "facture" WHERE "id" = ${invoiceId}::uuid AND "entreprise_id" = ${companyId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } });
    if (!invoice || invoice.status !== 'BROUILLON' || invoice.version !== version) return false;
    if (invoice.quoteId) {
      const reopened = await tx.quote.updateMany({
        where: { id: invoice.quoteId, companyId, status: 'CONVERTI' },
        data: { status: 'ACCEPTE', version: { increment: 1 } },
      });
      if (!reopened.count) return false;
    }
    await tx.invoice.delete({ where: { id: invoiceId } });
    return true;
  });
  if (!deleted) return problem(response, 409, 'Facture modifiée, non brouillon ou introuvable');
  response.status(204).send();
}
