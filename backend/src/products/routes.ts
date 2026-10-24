import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication } from '../auth/authenticate.js';
import { prismaForCompany } from '../db/company-prisma.js';

const identifier = z.string().uuid();
const amount = z.string().regex(/^\d+$/, 'Le montant doit être une chaîne entière positive.').transform((value) => BigInt(value));
const productInput = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(2_000).nullable().optional(),
  unitPrice: amount,
  unit: z.string().trim().min(1).max(30).default('unité'),
  taxRateBasisPts: z.number().int().min(0).max(10_000),
}).transform((value) => ({ ...value, description: value.description ?? null }));
const listInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).optional(),
});

function versionFrom(request: Request): number | undefined {
  const value = Number(request.header('if-match')?.replaceAll('"', ''));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function withVersion(response: Response, version: number): void {
  response.setHeader('ETag', `"${version}"`);
}

function problem(response: Response, status: number, title: string, errors?: unknown): void {
  response.status(status).type('application/problem+json').json({ title, status, ...(errors ? { errors } : {}) });
}

export const productsRouter = Router();
productsRouter.use(requireAuthentication);

productsRouter.get('/', async (request: Request, response: Response) => {
  const parsed = listInput.safeParse(request.query);
  if (!parsed.success) return problem(response, 422, 'Paramètres invalides', parsed.error.flatten().fieldErrors);
  const { page, limit, search } = parsed.data;
  const db = prismaForCompany(request.auth!.companyId);
  const where = { archivedAt: null, ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) };
  const [data, total] = await Promise.all([
    db.product.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
    db.product.count({ where }),
  ]);
  response.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

productsRouter.post('/', async (request: Request, response: Response) => {
  const parsed = productInput.safeParse(request.body);
  if (!parsed.success) return problem(response, 422, 'Données invalides', parsed.error.flatten().fieldErrors);
  const product = await prismaForCompany(request.auth!.companyId).product.create({ data: parsed.data as never });
  withVersion(response, product.version);
  response.status(201).json(product);
});

productsRouter.get('/:id', async (request: Request, response: Response) => {
  const id = identifier.safeParse(request.params.id);
  if (!id.success) return problem(response, 404, 'Produit ou service introuvable');
  const product = await prismaForCompany(request.auth!.companyId).product.findUnique({ where: { id: id.data } });
  if (!product) return problem(response, 404, 'Produit ou service introuvable');
  withVersion(response, product.version);
  response.json(product);
});

productsRouter.put('/:id', async (request: Request, response: Response) => {
  const id = identifier.safeParse(request.params.id);
  const input = productInput.safeParse(request.body);
  const version = versionFrom(request);
  if (!id.success) return problem(response, 404, 'Produit ou service introuvable');
  if (!input.success) return problem(response, 422, 'Données invalides', input.error.flatten().fieldErrors);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const db = prismaForCompany(request.auth!.companyId);
  const changed = await db.product.updateMany({
    where: { id: id.data, version }, data: { ...input.data, version: { increment: 1 } } as never,
  });
  if (!changed.count) return problem(response, 409, 'Produit modifié ou introuvable');
  const product = await db.product.findUniqueOrThrow({ where: { id: id.data } });
  withVersion(response, product.version);
  response.json(product);
});

productsRouter.post('/:id/archive', async (request: Request, response: Response) => {
  const id = identifier.safeParse(request.params.id);
  const version = versionFrom(request);
  if (!id.success) return problem(response, 404, 'Produit ou service introuvable');
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const changed = await prismaForCompany(request.auth!.companyId).product.updateMany({
    where: { id: id.data, version, archivedAt: null }, data: { archivedAt: new Date(), version: { increment: 1 } },
  });
  if (!changed.count) return problem(response, 409, 'Produit modifié, archivé ou introuvable');
  response.status(204).send();
});
