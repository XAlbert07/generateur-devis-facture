import type { Request, Response } from 'express';
import { z } from 'zod';

const integer = z.string().regex(/^\d+$/, 'La valeur doit être une chaîne entière positive.').transform(BigInt);
const discount = z.object({
  type: z.enum(['POURCENTAGE', 'MONTANT_FIXE']),
  value: integer,
}).nullable().optional();

export const quoteInput = z.object({
  clientId: z.string().uuid().nullable().optional(),
  validUntil: z.string().date().nullable().optional(),
  globalDiscount: discount,
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(2_000),
    quantityMilli: integer.refine((value) => value > 0n, 'La quantité doit être positive.'),
    unitPrice: integer,
    taxRateBasisPts: z.number().int().min(0).max(10_000),
    discount,
  })).min(1).max(200),
});

export const listInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'CONVERTI', 'ANNULE']).optional(),
});

export function versionFrom(request: Request): number | undefined {
  const value = Number(request.header('if-match')?.replaceAll('"', ''));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export { startOfCompanyDay } from '../../../shared/documents/date-only.js';

export function quoteIdFrom(request: Request, response: Response): string | undefined {
  const parsed = z.string().uuid().safeParse(request.params.id);
  if (!parsed.success) {
    problem(response, 404, 'Devis introuvable');
    return undefined;
  }
  return parsed.data;
}

export function withVersion(response: Response, version: number): void {
  response.setHeader('ETag', `"${version}"`);
}

export function problem(response: Response, status: number, title: string, errors?: unknown): void {
  response.status(status).type('application/problem+json').json({ title, status, ...(errors === undefined ? {} : { errors }) });
}
