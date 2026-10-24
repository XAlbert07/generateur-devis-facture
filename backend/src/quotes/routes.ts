import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuthentication } from '../auth/authenticate.js';
import { prisma } from '../db/prisma.js';
import { listInput, problem, quoteIdFrom, withVersion } from './common.js';
import { createQuote, deleteQuote, updateQuote } from './draft-routes.js';
import { acceptQuote, cancelQuote, convertQuote, expireQuotes, getQuotePdf, refuseQuote, sendQuote } from './lifecycle-routes.js';

export const quotesRouter = Router();
quotesRouter.use(requireAuthentication);

quotesRouter.get('/', async (request: Request, response: Response) => {
  const parsed = listInput.safeParse(request.query);
  if (!parsed.success) return problem(response, 422, 'Paramètres invalides', parsed.error.flatten().fieldErrors);
  const { page, limit, status } = parsed.data; const companyId = request.auth!.companyId;
  await expireQuotes(companyId);
  const where = { companyId, ...(status ? { status } : {}) };
  const [data, total] = await Promise.all([
    prisma.quote.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { client: { select: { id: true, name: true } } } }),
    prisma.quote.count({ where }),
  ]);
  response.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

quotesRouter.post('/', createQuote);
quotesRouter.put('/:id', updateQuote);
quotesRouter.delete('/:id', deleteQuote);
quotesRouter.post('/:id/send', sendQuote);
quotesRouter.post('/:id/accept', acceptQuote);
quotesRouter.post('/:id/refuse', refuseQuote);
quotesRouter.post('/:id/cancel', cancelQuote);
quotesRouter.post('/:id/convert', convertQuote);
quotesRouter.get('/:id/pdf', getQuotePdf);

quotesRouter.get('/:id', async (request: Request, response: Response) => {
  const quoteId = quoteIdFrom(request, response); if (!quoteId) return;
  await expireQuotes(request.auth!.companyId);
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId: request.auth!.companyId }, include: { lines: { orderBy: { position: 'asc' } }, client: true } });
  if (!quote) return problem(response, 404, 'Devis introuvable');
  withVersion(response, quote.version); response.json(quote);
});
