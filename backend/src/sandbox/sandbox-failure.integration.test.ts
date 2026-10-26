import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Le remplissage échoue : l'espace créé juste avant ne doit laisser aucune trace.
vi.mock('./seed.js', () => ({ seedSandboxData: vi.fn().mockRejectedValue(new Error('échec simulé')) }));

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? '';
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && databaseName.endsWith('_test');

describe.skipIf(!enabled)('échec de la préparation d’un espace d’essai', () => {
  let server: Server | undefined;
  let apiUrl: string;
  let prisma: typeof import('../db/prisma.js').prisma;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'postgres-integration-test-secret-at-least-32-chars';
    process.env.SANDBOX_ENABLED = 'true';
    process.env.SANDBOX_POOL_SIZE = '0';
    const { createApp } = await import('../app.js');
    ({ prisma } = await import('../db/prisma.js'));
    await prisma.$connect();
    const httpServer = createApp().listen(0, '127.0.0.1');
    server = httpServer;
    await new Promise<void>((resolve, reject) => { httpServer.once('listening', resolve); httpServer.once('error', reject); });
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Serveur sans adresse');
    apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => { if (!server) return resolve(); server.close((error) => (error ? reject(error) : resolve())); });
    process.env = savedEnv;
  });

  it('répond 503, supprime ce qui a été créé et ne pose aucun cookie', async () => {
    const before = await prisma.company.count({ where: { sandboxExpiresAt: { not: null } } });
    const usersBefore = await prisma.user.count({ where: { email: { endsWith: '@demo.invalid' } } });

    const response = await fetch(`${apiUrl}/sandbox`, { method: 'POST', headers: { 'X-Forwarded-For': '198.51.100.7' } });

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect((await response.json() as { title: string }).title).toMatch(/Impossible de préparer/);
    expect(await prisma.company.count({ where: { sandboxExpiresAt: { not: null } } })).toBe(before);
    expect(await prisma.user.count({ where: { email: { endsWith: '@demo.invalid' } } })).toBe(usersBefore);
  }, 60_000);

  it('rend sa place à l’adresse du visiteur : un nouvel essai n’est pas bloqué', async () => {
    process.env.SANDBOX_MAX_PER_IP_PER_HOUR = '1';
    const first = await fetch(`${apiUrl}/sandbox`, { method: 'POST', headers: { 'X-Forwarded-For': '198.51.100.8' } });
    const second = await fetch(`${apiUrl}/sandbox`, { method: 'POST', headers: { 'X-Forwarded-For': '198.51.100.8' } });
    expect([first.status, second.status]).toEqual([503, 503]);
  }, 60_000);
});
