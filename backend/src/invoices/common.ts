import type { Request, Response } from 'express';
import { z } from 'zod';
import { problem } from '../http/problem.js';

export const invoiceListInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['BROUILLON', 'EMISE', 'ANNULEE']).optional(),
  search: z.string().trim().max(160).optional(),
});

export function invoiceIdFrom(request: Request, response: Response): string | undefined {
  const parsed = z.string().uuid().safeParse(request.params.id);
  if (!parsed.success) {
    problem(response, 404, 'Facture introuvable');
    return undefined;
  }
  return parsed.data;
}

export function versionFrom(request: Request): number | undefined {
  const value = Number(request.header('if-match')?.replaceAll('"', ''));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function withVersion(response: Response, version: number): void {
  response.setHeader('ETag', `"${version}"`);
}

export { problem } from '../http/problem.js';
