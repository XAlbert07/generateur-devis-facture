import express, { type NextFunction, type Request, type Response } from 'express';
import { authRouter } from './auth/routes.js';
import { requireCsrf } from './auth/csrf.js';
import { clientsRouter } from './clients/routes.js';
import { productsRouter } from './products/routes.js';
import { quotesRouter } from './quotes/routes.js';
import { invoicesRouter } from './invoices/routes.js';
import { dashboardRouter } from './dashboard/routes.js';
import { companiesRouter } from './companies/routes.js';
import { healthRouter } from './health/routes.js';
import { requestLogging, logError } from './http/logger.js';
import { problem } from './http/problem.js';
import { securityHeaders } from './http/security.js';
import { sandboxRouter } from './sandbox/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('json replacer', (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  app.use(requestLogging);
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  // Public et sans cookie (comme l'inscription) : monté avant la protection CSRF.
  app.use('/api/v1/sandbox', sandboxRouter);
  app.use('/api/v1', requireCsrf);

  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/clients', clientsRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/quotes', quotesRouter);
  app.use('/api/v1/invoices', invoicesRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/company', companiesRouter);

  app.use((_request, response) => {
    problem(response, 404, 'Ressource introuvable');
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    // Aucun détail interne, notamment de base de données, ne sort de l'API.
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      problem(response, 413, 'Fichier trop volumineux');
      return;
    }
    logError('unhandled_error', {
      requestId: response.locals.requestId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    problem(response, 500, 'Erreur interne du serveur');
  });

  return app;
}
