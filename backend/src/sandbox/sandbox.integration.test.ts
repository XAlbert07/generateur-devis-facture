import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? '';
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && databaseName.endsWith('_test');

interface SandboxBody { title?: string; role?: string; company: { id: string; name: string }; user: { id: string; email: string } }
interface Created { status: number; cookie: string; body: SandboxBody }

describe.skipIf(!enabled)('espaces d’essai sous PostgreSQL', () => {
  type Prisma = typeof import('../db/prisma.js').prisma;
  let prisma: Prisma;
  let purge: typeof import('./purge.js');
  let limits: typeof import('./limits.js');
  let server: Server | undefined;
  let apiUrl: string;
  let documentsDir: string;
  let ipCounter = 10;
  const savedEnv = { ...process.env };
  const extraUserEmails: string[] = [];
  let realCompanyId: string | undefined;

  const nextIp = () => `203.0.113.${ipCounter++}`;

  async function createSandbox(ip = nextIp()): Promise<Created> {
    const response = await fetch(`${apiUrl}/sandbox`, { method: 'POST', headers: { 'X-Forwarded-For': ip } });
    const cookie = response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ');
    return { status: response.status, cookie, body: await response.json() as SandboxBody };
  }

  const get = (cookie: string, route: string) => fetch(`${apiUrl}${route}`, { headers: { Cookie: cookie } });

  beforeAll(async () => {
    documentsDir = await mkdtemp(path.join(os.tmpdir(), 'devis-sandbox-'));
    process.env.DOCUMENTS_DIR = documentsDir;
    process.env.JWT_SECRET ??= 'postgres-integration-test-secret-at-least-32-chars';
    process.env.SANDBOX_ENABLED = 'true';
    process.env.SANDBOX_POOL_SIZE = '0';
    const { createApp } = await import('../app.js');
    ({ prisma } = await import('../db/prisma.js'));
    purge = await import('./purge.js');
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

  beforeEach(() => {
    limits.resetSandboxLimits();
    process.env.SANDBOX_ENABLED = 'true';
    delete process.env.SANDBOX_MAX_ACTIVE;
    delete process.env.SANDBOX_MAX_PER_IP_PER_HOUR;
  });

  afterAll(async () => {
    await purge.purgeAllSandboxes();
    if (realCompanyId) {
      await prisma.client.deleteMany({ where: { companyId: realCompanyId } });
      await prisma.company.delete({ where: { id: realCompanyId } });
    }
    for (const email of extraUserEmails) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;
      const memberships = await prisma.companyMembership.findMany({ where: { userId: user.id } });
      await prisma.auditEvent.deleteMany({ where: { companyId: { in: memberships.map((membership) => membership.companyId) } } });
      await prisma.companyMembership.deleteMany({ where: { userId: user.id } });
      await prisma.company.deleteMany({ where: { id: { in: memberships.map((membership) => membership.companyId) } } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => { if (!server) return resolve(); server.close((error) => (error ? reject(error) : resolve())); });
    await rm(documentsDir, { recursive: true, force: true });
    process.env = savedEnv;
  }, 60_000);

  it('annonce si la démo est proposée', async () => {
    expect(await (await fetch(`${apiUrl}/sandbox`)).json()).toEqual({ enabled: true });
    process.env.SANDBOX_ENABLED = 'false';
    expect(await (await fetch(`${apiUrl}/sandbox`)).json()).toEqual({ enabled: false });
    expect((await createSandbox()).status).toBe(404);
  });

  describe('un espace créé', () => {
    let first: Created;
    let second: Created;

    beforeAll(async () => {
      process.env.SANDBOX_ENABLED = 'true';
      limits.resetSandboxLimits();
      first = await createSandbox();
      second = await createSandbox();
    }, 180_000);

    it('ouvre une session administrateur sans identifiants', () => {
      expect(first.status).toBe(201);
      expect(first.cookie).toMatch(/access_token=/);
      expect(first.cookie).toMatch(/refresh_token=/);
      expect(first.cookie).toMatch(/csrf_token=/);
      expect(first.body).toMatchObject({ role: 'ADMINISTRATEUR', company: { name: 'Studio Aurore Communication' } });
      expect(first.body.user.email).toMatch(/^visiteur-[a-f0-9]+@demo\.invalid$/);
    });

    it('contient des devis dans chaque état, des factures et des paiements', async () => {
      const quotes = await (await get(first.cookie, '/quotes?limit=50')).json() as { data: Array<{ status: string }> };
      const byStatus = Object.fromEntries([...new Set(quotes.data.map((quote) => quote.status))].map((status) => [status, quotes.data.filter((quote) => quote.status === status).length]));
      expect(byStatus).toEqual({ CONVERTI: 3, ENVOYE: 1, REFUSE: 1, BROUILLON: 1 });

      const invoices = await (await get(first.cookie, '/invoices?limit=50')).json() as { data: Array<{ id: string; status: string }> };
      expect(invoices.data.map((invoice) => invoice.status).sort()).toEqual(['BROUILLON', 'EMISE', 'EMISE']);

      const paymentStatuses: string[] = [];
      for (const invoice of invoices.data.filter((item) => item.status === 'EMISE')) {
        const payments = await (await get(first.cookie, `/invoices/${invoice.id}/payments`)).json() as { summary: { status: string } };
        paymentStatuses.push(payments.summary.status);
      }
      expect(paymentStatuses.sort()).toEqual(['PARTIELLEMENT_PAYEE', 'PAYEE']);

      expect((await get(first.cookie, '/clients')).status).toBe(200);
      expect((await get(first.cookie, '/products')).status).toBe(200);
      expect((await get(first.cookie, '/dashboard/summary')).status).toBe(200);
    });

    it('fournit de vrais PDF pour les documents émis', async () => {
      const quotes = await (await get(first.cookie, '/quotes?limit=50&status=ENVOYE')).json() as { data: Array<{ id: string; status: string }> };
      const sent = quotes.data.find((quote) => quote.status === 'ENVOYE');
      expect(sent).toBeDefined();
      const quotePdf = await get(first.cookie, `/quotes/${sent!.id}/pdf`);
      expect(quotePdf.status).toBe(200);
      expect(Buffer.from(await quotePdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

      const invoices = await (await get(first.cookie, '/invoices?limit=50')).json() as { data: Array<{ id: string; status: string }> };
      const issued = invoices.data.find((invoice) => invoice.status === 'EMISE');
      const invoicePdf = await get(first.cookie, `/invoices/${issued!.id}/pdf`);
      expect(invoicePdf.status).toBe(200);
      expect(Buffer.from(await invoicePdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('est signalé comme espace d’essai avec une date d’expiration', async () => {
      const session = await (await get(first.cookie, '/sandbox/session')).json() as { sandbox: boolean; expiresAt: string };
      expect(session.sandbox).toBe(true);
      const hoursLeft = (Date.parse(session.expiresAt) - Date.now()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(11);
      expect(hoursLeft).toBeLessThanOrEqual(12);
    });

    it('reste invisible depuis un autre espace d’essai', async () => {
      const firstQuotes = await (await get(first.cookie, '/quotes?limit=50')).json() as { data: Array<{ id: string }> };
      const secondQuotes = await (await get(second.cookie, '/quotes?limit=50')).json() as { data: Array<{ id: string }> };
      const secondIds = new Set(secondQuotes.data.map((quote) => quote.id));
      expect(firstQuotes.data.every((quote) => !secondIds.has(quote.id))).toBe(true);
      expect((await get(second.cookie, `/quotes/${firstQuotes.data[0]!.id}`)).status).toBe(404);
    });

    it('n’est jamais signalé pour une vraie entreprise', async () => {
      const email = `reelle-${Date.now()}@example.test`;
      extraUserEmails.push(email);
      const registered = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Albert Réel', email, password: 'Un-mot-de-passe-solide-2026!', companyName: 'Entreprise réelle' }),
      });
      expect(registered.status).toBe(201);
      const cookie = registered.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ');
      expect(await (await get(cookie, '/sandbox/session')).json()).toEqual({ sandbox: false, expiresAt: null });
    });

    it('est supprimé en entier à l’expiration, sans toucher à une vraie entreprise', async () => {
      const companyId = first.body.company.id;
      const userId = first.body.user.id;
      const real = await prisma.company.create({ data: { name: 'Entreprise réelle de contrôle' } });
      realCompanyId = real.id;
      await prisma.client.create({ data: { companyId: real.id, name: 'Client réel à préserver' } });

      // Une entreprise ordinaire ne peut pas être purgée, même désignée explicitement.
      expect(await purge.purgeSandboxCompanies([real.id])).toBe(0);
      expect(await prisma.client.count({ where: { companyId: real.id } })).toBe(1);

      expect(await prisma.invoice.count({ where: { companyId } })).toBeGreaterThan(0);
      await prisma.company.update({ where: { id: companyId }, data: { sandboxExpiresAt: new Date(Date.now() - 60_000) } });
      expect(await purge.purgeExpiredSandboxes()).toBe(1);

      expect(await prisma.company.count({ where: { id: companyId } })).toBe(0);
      expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
      for (const count of await Promise.all([
        prisma.companyMembership.count({ where: { companyId } }),
        prisma.client.count({ where: { companyId } }),
        prisma.product.count({ where: { companyId } }),
        prisma.quote.count({ where: { companyId } }),
        prisma.invoice.count({ where: { companyId } }),
        prisma.payment.count({ where: { invoice: { companyId } } }),
        prisma.documentSequence.count({ where: { companyId } }),
        prisma.auditEvent.count({ where: { companyId } }),
        prisma.refreshToken.count({ where: { userId } }),
      ])) expect(count).toBe(0);

      // Le deuxième espace, non expiré, est intact.
      expect((await get(second.cookie, '/quotes')).status).toBe(200);
      expect(await prisma.company.count({ where: { id: real.id } })).toBe(1);
    }, 60_000);
  });

  it('limite les créations par adresse IP, puis par nombre d’espaces actifs', async () => {
    process.env.SANDBOX_MAX_PER_IP_PER_HOUR = '1';
    const ip = nextIp();
    expect((await createSandbox(ip)).status).toBe(201);
    const second = await createSandbox(ip);
    expect(second.status).toBe(429);
    expect(second.body.title).toMatch(/Trop d’espaces d’essai/);

    process.env.SANDBOX_MAX_ACTIVE = '1';
    delete process.env.SANDBOX_MAX_PER_IP_PER_HOUR;
    const full = await createSandbox();
    expect(full.status).toBe(503);
    expect(full.body.title).toMatch(/places de démonstration/);
  }, 120_000);
});
