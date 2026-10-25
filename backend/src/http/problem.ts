import type { Response } from 'express';

export type ProblemErrors = unknown;

/**
 * Réponse d’erreur RFC 7807 (`application/problem+json`).
 * `type` pointe vers le statut HTTP standard ; `errors` pour le détail Zod/champs.
 */
export function problem(
  response: Response,
  status: number,
  title: string,
  errors?: ProblemErrors,
): void {
  response.status(status).type('application/problem+json').json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    ...(errors === undefined ? {} : { errors }),
  });
}
