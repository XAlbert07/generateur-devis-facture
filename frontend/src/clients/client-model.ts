import { z } from 'zod';

export type Client = { id: string; version: number; name: string; email: string | null; phone: string | null; address: string | null; taxIdentifier: string | null };
export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Saisissez au moins 2 caractères.').max(160),
  email: z.union([z.literal(''), z.string().email('Adresse e-mail invalide.')]),
  phone: z.string().max(40), address: z.string().max(1_000), taxIdentifier: z.string().max(80),
});
