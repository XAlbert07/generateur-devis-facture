import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/prisma.js';
import { problem } from '../http/problem.js';

export const healthRouter = Router();

healthRouter.get('/health', (_request: Request, response: Response) => {
  response.status(200).json({ status: 'ok' });
});

/** Prêt à servir du trafic : dépendance PostgreSQL joignable. */
healthRouter.get('/ready', async (_request: Request, response: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.status(200).json({ status: 'ready', database: 'up' });
  } catch {
    problem(response, 503, 'Base de données injoignable');
  }
});
