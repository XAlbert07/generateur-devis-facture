import express, { type NextFunction, type Request, type Response } from 'express';
import { authRouter } from './auth/routes.js';
import { clientsRouter } from './clients/routes.js';
import { productsRouter } from './products/routes.js';
import { quotesRouter } from './quotes/routes.js';
import { invoicesRouter } from './invoices/routes.js';
import { dashboardRouter } from './dashboard/routes.js';
import { companiesRouter } from './companies/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('json replacer', (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/v1/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/clients', clientsRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/quotes', quotesRouter);
  app.use('/api/v1/invoices', invoicesRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/company', companiesRouter);

  app.use((_request, response) => {
    response.status(404).type('application/problem+json').json({
      type: 'https://httpstatuses.com/404',
      title: 'Ressource introuvable',
      status: 404,
    });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    // Aucun détail interne, notamment de base de données, ne sort de l'API.
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).type('application/problem+json').json({ title: 'Fichier trop volumineux', status: 413 });
      return;
    }
    console.error(error);
    response.status(500).type('application/problem+json').json({
      type: 'https://httpstatuses.com/500',
      title: 'Erreur interne du serveur',
      status: 500,
    });
  });

  return app;
}
