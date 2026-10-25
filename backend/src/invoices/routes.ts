import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuthentication } from '../auth/authenticate.js';
import { prisma } from '../db/prisma.js';
import { invoiceIdFrom, invoiceListInput, problem, withVersion } from './common.js';
import { getInvoicePdf, issueInvoice } from './issue-route.js';
import { paymentsRouter } from '../payments/routes.js';
import { summarizePayments } from '../payments/summary.js';
import { cancelInvoice, getCancellationPdf } from './cancellation-routes.js';
import { createManualInvoice, deleteDraftInvoice, updateManualInvoice } from './draft-routes.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuthentication);
invoicesRouter.use('/:id/payments', paymentsRouter);

invoicesRouter.get('/', async (request: Request, response: Response) => {
  const parsed = invoiceListInput.safeParse(request.query);
  if (!parsed.success) return problem(response, 422, 'Paramètres invalides', parsed.error.flatten().fieldErrors);
  const { page, limit, status, search } = parsed.data; const companyId = request.auth!.companyId;
  const where = {
    companyId,
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { number: { contains: search, mode: 'insensitive' as const } },
      { client: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
    ] } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { client: { select: { id: true, name: true } } } }),
    prisma.invoice.count({ where }),
  ]);
  response.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

invoicesRouter.post('/', createManualInvoice);
invoicesRouter.put('/:id', updateManualInvoice);
invoicesRouter.delete('/:id', deleteDraftInvoice);
invoicesRouter.post('/:id/issue', issueInvoice);
invoicesRouter.post('/:id/cancel', cancelInvoice);
invoicesRouter.get('/:id/pdf', getInvoicePdf);
invoicesRouter.get('/:id/cancellation-pdf', getCancellationPdf);

invoicesRouter.get('/:id', async (request: Request, response: Response) => {
  const invoiceId = invoiceIdFrom(request, response); if (!invoiceId) return;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId: request.auth!.companyId }, include: {
    lines: { orderBy: { position: 'asc' } }, client: true,
    payments: true, company: { select: { timezone: true } },
  } });
  if (!invoice) return problem(response, 404, 'Facture introuvable');
  withVersion(response, invoice.version);
  const { payments, company, ...data } = invoice;
  response.json({ ...data, paymentSummary: summarizePayments(invoice.totalInclTax, invoice.dueDate, company.timezone, payments) });
});
