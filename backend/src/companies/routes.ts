import type { Request, Response } from 'express';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuthentication } from '../auth/authenticate.js';
import { prisma } from '../db/prisma.js';
import { companyLogoRouter } from './logo-routes.js';

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const jsonTextMap = z.record(z.string().trim().min(1).max(80), z.string().trim().max(500)).nullable();
const companyInput = z.object({
  name: z.string().trim().min(2).max(160),
  address: nullableText(1_000), phone: nullableText(40),
  email: z.string().trim().email().max(320).nullable(),
  taxIdentifiers: jsonTextMap,
  currency: z.string().regex(/^[A-Z]{3}$/), decimals: z.number().int().min(0).max(6),
  defaultTaxRateBasisPts: z.number().int().min(0).max(10_000),
  timezone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat('fr-FR', { timeZone: value }); return true; } catch { return false; }
  }, 'Fuseau horaire invalide'),
  quotePrefix: z.string().trim().regex(/^[A-Z0-9]{1,12}$/),
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9]{1,12}$/),
  paymentDelayDays: z.number().int().min(0).max(3_650),
  legalMentions: nullableText(4_000), footerText: nullableText(2_000),
  paymentTerms: nullableText(2_000), paymentDetails: jsonTextMap,
});

function versionFrom(request: Request): number | undefined {
  const value = Number(request.header('if-match')?.replaceAll('"', ''));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function problem(response: Response, status: number, title: string, errors?: unknown): void {
  response.status(status).type('application/problem+json').json({ title, status, ...(errors ? { errors } : {}) });
}

export const companiesRouter = Router();
companiesRouter.use(requireAuthentication);
companiesRouter.use('/logo', companyLogoRouter);

companiesRouter.get('/', async (request: Request, response: Response) => {
  const company = await prisma.company.findUnique({ where: { id: request.auth!.companyId } });
  if (!company) return problem(response, 404, 'Entreprise introuvable');
  response.setHeader('ETag', `"${company.version}"`).json({ ...company, currency: company.currency.trim() });
});

companiesRouter.put('/', async (request: Request, response: Response) => {
  if (request.auth!.role !== 'ADMINISTRATEUR') return problem(response, 403, 'Droits administrateur requis');
  const version = versionFrom(request);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const parsed = companyInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Paramètres d’entreprise invalides', parsed.error.flatten().fieldErrors);
  const { taxIdentifiers, paymentDetails, ...input } = parsed.data;
  const changed = await prisma.company.updateMany({
    where: { id: request.auth!.companyId, version },
    data: {
      ...input,
      taxIdentifiers: taxIdentifiers === null ? Prisma.DbNull : taxIdentifiers as Prisma.InputJsonValue,
      paymentDetails: paymentDetails === null ? Prisma.DbNull : paymentDetails as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });
  if (!changed.count) return problem(response, 409, 'Entreprise modifiée ou introuvable');
  const company = await prisma.company.findUniqueOrThrow({ where: { id: request.auth!.companyId } });
  response.setHeader('ETag', `"${company.version}"`).json({ ...company, currency: company.currency.trim() });
});
