import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? '';
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && databaseName.endsWith('_test');

describe.skipIf(!enabled)('GET /ready', () => {
  let server: Server | undefined;
  let apiUrl: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'postgres-integration-test-secret-at-least-32-chars';
    const { createApp } = await import('../app.js');
    const { prisma } = await import('../db/prisma.js');
    await prisma.$connect();
    const httpServer = createApp().listen(0, '127.0.0.1');
    server = httpServer;
    await new Promise<void>((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Serveur sans adresse');
    apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error) => (error ? reject(error) : resolve()));
    });
    const { prisma } = await import('../db/prisma.js');
    await prisma.$disconnect();
  });

  it('répond 200 quand PostgreSQL est joignable', async () => {
    const health = await fetch(`${apiUrl}/health`);
    expect(health.status).toBe(200);
    const ready = await fetch(`${apiUrl}/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({ status: 'ready', database: 'up' });
  });
});
