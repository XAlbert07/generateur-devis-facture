import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication } from '../auth/authenticate.js';
import { prismaForCompany } from '../db/company-prisma.js';
import { problem } from '../http/problem.js';

const identifier = z.string().uuid();
const clientInput = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  address: z.string().trim().min(3).max(1_000).nullable().optional(),
  taxIdentifier: z.string().trim().min(2).max(80).nullable().optional(),
}).transform((value) => ({
  name: value.name,
  email: value.email ?? null,
  phone: value.phone ?? null,
  address: value.address ?? null,
  taxIdentifier: value.taxIdentifier ?? null,
}));
const listInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).optional(),
});

function versionFrom(request: Request): number | undefined {
  const header = request.header('if-match');
  if (!header) return undefined;
  const value = Number(header.replaceAll('"', ''));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function sendVersion(response: Response, version: number): void {
  response.setHeader('ETag', `"${version}"`);
}

function notFound(response: Response): void {
  problem(response, 404, 'Client introuvable');
}

function invalid(response: Response, errors: unknown): void {
  problem(response, 422, 'Données invalides', errors);
}

export const clientsRouter = Router();
clientsRouter.use(requireAuthentication);

clientsRouter.get('/', async (request: Request, response: Response) => {
  const parsed = listInput.safeParse(request.query);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const { page, limit, search } = parsed.data;
  const db = prismaForCompany(request.auth!.companyId);
  const where = {
    archivedAt: null,
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };
  const [data, total] = await Promise.all([
    db.client.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
    db.client.count({ where }),
  ]);
  response.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

clientsRouter.post('/', async (request: Request, response: Response) => {
  const parsed = clientInput.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const db = prismaForCompany(request.auth!.companyId);
  const client = await db.client.create({ data: parsed.data as never });
  sendVersion(response, client.version);
  response.status(201).json(client);
});

clientsRouter.get('/:id', async (request: Request, response: Response) => {
  const parsed = identifier.safeParse(request.params.id);
  if (!parsed.success) return notFound(response);
  const db = prismaForCompany(request.auth!.companyId);
  const client = await db.client.findUnique({ where: { id: parsed.data } });
  if (!client) return notFound(response);
  sendVersion(response, client.version);
  response.json(client);
});

clientsRouter.put('/:id', async (request: Request, response: Response) => {
  const id = identifier.safeParse(request.params.id);
  const input = clientInput.safeParse(request.body);
  const version = versionFrom(request);
  if (!id.success) return notFound(response);
  if (!input.success) return invalid(response, input.error.flatten().fieldErrors);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const db = prismaForCompany(request.auth!.companyId);
  const existing = await db.client.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!existing) return notFound(response);
  const changed = await db.client.updateMany({
    where: { id: id.data, version }, data: { ...input.data, version: { increment: 1 } } as never,
  });
  if (changed.count === 0) return problem(response, 409, 'Client modifié concurrentement');
  const client = await db.client.findUniqueOrThrow({ where: { id: id.data } });
  sendVersion(response, client.version);
  response.json(client);
});

clientsRouter.post('/:id/archive', async (request: Request, response: Response) => {
  const id = identifier.safeParse(request.params.id);
  const version = versionFrom(request);
  if (!id.success) return notFound(response);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const db = prismaForCompany(request.auth!.companyId);
  const existing = await db.client.findUnique({ where: { id: id.data }, select: { id: true, archivedAt: true } });
  if (!existing) return notFound(response);
  const changed = await db.client.updateMany({
    where: { id: id.data, version, archivedAt: null }, data: { archivedAt: new Date(), version: { increment: 1 } },
  });
  if (changed.count === 0) return problem(response, 409, 'Client modifié ou déjà archivé');
  response.status(204).send();
});
