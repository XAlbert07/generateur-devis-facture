import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? '';
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && databaseName.endsWith('_test');

describe.skipIf(!enabled)('réservoir d’espaces d’essai préparés d’avance', () => {
  type Prisma = typeof import('../db/prisma.js').prisma;
  let prisma: Prisma;
  let purge: typeof import('./purge.js');
  let pool: typeof import('./pool.js');
  let build: typeof import('./build.js');
  let limits: typeof import('./limits.js');
  let server: Server | undefined;
  let apiUrl: string;
  let documentsDir: string;
  let ipCounter = 100;
  const savedEnv = { ...process.env };

  const nextIp = () => `203.0.113.${ipCounter++}`;
  const open = (ip = nextIp()) => fetch(`${apiUrl}/sandbox`, { method: 'POST', headers: { 'X-Forwarded-For': ip } });
  const cookieOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ');

  beforeAll(async () => {
    documentsDir = await mkdtemp(path.join(os.tmpdir(), 'devis-pool-'));
    process.env.DOCUMENTS_DIR = documentsDir;
    process.env.JWT_SECRET ??= 'postgres-integration-test-secret-at-least-32-chars';
    process.env.SANDBOX_ENABLED = 'true';
    process.env.SANDBOX_POOL_SIZE = '2';
    const { createApp } = await import('../app.js');
    ({ prisma } = await import('../db/prisma.js'));
    purge = await import('./purge.js');
    pool = await import('./pool.js');
    build = await import('./build.js');
    limits = await import('./limits.js');
    await prisma.$connect();
    await purge.purgeAllSandboxes();
    const httpServer = createApp().listen(0, '127.0.0.1');
    server = httpServer;
    await new Promise<void>((resolve, reject) => { httpServer.once('listening', resolve); httpServer.once('error', reject); });
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Serveur sans adresse');
    apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
  }, 60_000);

  beforeEach(() => { limits.resetSandboxLimits(); pool.resetSandboxPool(); });

  afterAll(async () => {
    await pool.waitForSandboxPool();
    await purge.purgeAllSandboxes();
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => { if (!server) return resolve(); server.close((error) => (error ? reject(error) : resolve())); });
    await rm(documentsDir, { recursive: true, force: true });
    process.env = savedEnv;
  }, 60_000);

  it('prépare le réservoir dès l’ouverture de la page, avant tout clic', async () => {
    expect(await build.countPooledSandboxes()).toBe(0);

    expect(await (await fetch(`${apiUrl}/sandbox`)).json()).toEqual({ enabled: true });
    await pool.waitForSandboxPool();

    expect(await build.countPooledSandboxes()).toBe(2);
    const pooled = await prisma.company.findMany({ where: { sandboxReadyAt: { not: null }, sandboxClaimedAt: null } });
    for (const company of pooled) {
      expect(await prisma.quote.count({ where: { companyId: company.id } })).toBe(6);
      expect(await prisma.invoice.count({ where: { companyId: company.id } })).toBe(3);
      expect((company.sandboxExpiresAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(70 * 3_600_000); // attente longue avant attribution
    }
  }, 120_000);

  it('un clic attribue un espace déjà prêt, puis le réservoir se reconstitue', async () => {
    const poolIds = new Set((await prisma.company.findMany({ where: { sandboxReadyAt: { not: null }, sandboxClaimedAt: null } })).map((company) => company.id));
    expect(poolIds.size).toBe(2);

    const started = Date.now();
    const response = await open();
    const elapsed = Date.now() - started;
    const body = await response.json() as { company: { id: string }; role: string };

    expect(response.status).toBe(201);
    expect(poolIds.has(body.company.id)).toBe(true);
    expect(elapsed).toBeLessThan(2_000); // aucune préparation : l'espace existait déjà
    const claimed = await prisma.company.findUniqueOrThrow({ where: { id: body.company.id } });
    expect(claimed.sandboxClaimedAt).not.toBeNull();
    const hoursLeft = ((claimed.sandboxExpiresAt?.getTime() ?? 0) - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(11);
    expect(hoursLeft).toBeLessThanOrEqual(12); // la durée de vie démarre à l'attribution

    const quotes = await (await fetch(`${apiUrl}/quotes?limit=50`, { headers: { Cookie: cookieOf(response) } })).json() as { data: unknown[] };
    expect(quotes.data).toHaveLength(6);

    await pool.waitForSandboxPool();
    expect(await build.countPooledSandboxes()).toBe(2);
  }, 120_000);

  it('deux visiteurs simultanés reçoivent deux espaces différents', async () => {
    const [first, second] = await Promise.all([open(), open()]);
    const ids = [(await first.json() as { company: { id: string } }).company.id, (await second.json() as { company: { id: string } }).company.id];

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(new Set(ids).size).toBe(2);
    await pool.waitForSandboxPool();
    expect(await build.countPooledSandboxes()).toBe(2);
  }, 120_000);

  it('n’attribue jamais un espace dont la préparation n’est pas terminée', async () => {
    await pool.waitForSandboxPool();
    await purge.purgeAllSandboxes();
    process.env.SANDBOX_POOL_SIZE = '0'; // pas de réservoir : le visiteur déclenche une préparation à la demande
    const unfinished = await prisma.company.create({
      data: { name: 'Préparation interrompue', sandboxExpiresAt: new Date(Date.now() + 3_600_000), sandboxClaimedAt: null, sandboxReadyAt: null },
    });

    const response = await open();
    const body = await response.json() as { company: { id: string } };

    expect(response.status).toBe(201);
    expect(body.company.id).not.toBe(unfinished.id);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: unfinished.id } })).sandboxClaimedAt).toBeNull();

    // Une fois son délai dépassé, l'espace incomplet est purgé comme n'importe quel espace expiré.
    await prisma.company.update({ where: { id: unfinished.id }, data: { sandboxExpiresAt: new Date(Date.now() - 1_000) } });
    expect(await purge.purgeExpiredSandboxes()).toBe(1);
    expect(await prisma.company.count({ where: { id: unfinished.id } })).toBe(0);
    process.env.SANDBOX_POOL_SIZE = '2';
  }, 120_000);

  it('ne dépasse jamais le plafond d’espaces actifs en reconstituant le réservoir', async () => {
    await purge.purgeAllSandboxes();
    process.env.SANDBOX_MAX_ACTIVE = '1';
    await fetch(`${apiUrl}/sandbox`);
    await pool.waitForSandboxPool();

    expect(await build.countPooledSandboxes()).toBe(1);
    delete process.env.SANDBOX_MAX_ACTIVE;
  }, 120_000);
});
