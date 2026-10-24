import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { calculateQuote, type QuoteInput } from './document.js';
import { problem, quoteIdFrom, quoteInput, versionFrom, withVersion } from './common.js';

async function activeClient(companyId: string, clientId: string | null | undefined) {
  if (!clientId) return null;
  return prisma.client.findFirst({ where: { id: clientId, companyId, archivedAt: null } });
}

export async function createQuote(request: Request, response: Response): Promise<void> {
  const parsed = quoteInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Données de devis invalides', parsed.error.flatten().fieldErrors);
  const input = parsed.data as QuoteInput;
  if (input.clientId && !await activeClient(request.auth!.companyId, input.clientId)) return problem(response, 422, 'Client introuvable ou archivé');
  const calculated = calculateQuote(input);
  const quote = await prisma.quote.create({ data: {
    companyId: request.auth!.companyId, clientId: input.clientId ?? null,
    validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
    currency: (await prisma.company.findUniqueOrThrow({ where: { id: request.auth!.companyId }, select: { currency: true } })).currency,
    ...calculated, taxBreakdown: calculated.taxBreakdown as never, lines: { create: calculated.lines },
  }, include: { lines: { orderBy: { position: 'asc' } } } });
  withVersion(response, quote.version);
  response.status(201).json(quote);
}

export async function updateQuote(request: Request, response: Response): Promise<void> {
  const parsed = quoteInput.safeParse(request.body); const version = versionFrom(request);
  if (!parsed.success) return problem(response, 422, 'Données de devis invalides', parsed.error.flatten().fieldErrors);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const input = parsed.data as QuoteInput; const companyId = request.auth!.companyId;
  if (input.clientId && !await activeClient(companyId, input.clientId)) return problem(response, 422, 'Client introuvable ou archivé');
  const calculated = calculateQuote(input);
  const quote = await prisma.$transaction(async (tx) => {
    const changed = await tx.quote.updateMany({ where: { id: quoteId, companyId, version, status: 'BROUILLON' }, data: {
      clientId: input.clientId ?? null, validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
      ...calculated, taxBreakdown: calculated.taxBreakdown as never, version: { increment: 1 },
    } });
    if (!changed.count) return null;
    await tx.quoteLine.deleteMany({ where: { quoteId } });
    await tx.quoteLine.createMany({ data: calculated.lines.map((line) => ({ ...line, quoteId })) });
    return tx.quote.findUnique({ where: { id: quoteId }, include: { lines: { orderBy: { position: 'asc' } } } });
  });
  if (!quote) return problem(response, 409, 'Devis modifié, non brouillon ou introuvable');
  withVersion(response, quote.version); response.json(quote);
}

export async function deleteQuote(request: Request, response: Response): Promise<void> {
  const version = versionFrom(request); if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  const deleted = await prisma.quote.deleteMany({ where: { id: quoteId, companyId: request.auth!.companyId, version, status: 'BROUILLON' } });
  if (!deleted.count) return problem(response, 409, 'Devis modifié, non brouillon ou introuvable');
  response.status(204).send();
}
