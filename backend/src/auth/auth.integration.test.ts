import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? '';
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && databaseName.endsWith('_test');

function cookieHeader(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((item) => item.split(';')[0]).filter(Boolean).join('; ');
}

describe.skipIf(!enabled)('authentification PostgreSQL', () => {
  let prisma: typeof import('../db/prisma.js').prisma;
  let server: Server | undefined;
  let apiUrl: string;
  let documentsDir: string;
  const email = `auth-${Date.now()}@example.test`;
  const password = 'mot-de-passe-auth-12';

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'postgres-integration-test-secret-at-least-32-chars';
    documentsDir = await mkdtemp(path.join(tmpdir(), 'auth-postgres-'));
    process.env.DOCUMENTS_DIR = documentsDir;
    const [{ prisma: sharedPrisma }, { createApp }] = await Promise.all([
      import('../db/prisma.js'), import('../app.js'),
    ]);
    prisma = sharedPrisma;
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
    if (prisma) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
        await prisma.loginAttempt.deleteMany({ where: { email } });
        const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
        if (membership) {
          await prisma.companyMembership.delete({ where: { id: membership.id } });
          await prisma.company.delete({ where: { id: membership.companyId } });
        }
        await prisma.user.delete({ where: { id: user.id } });
      }
      await prisma.$disconnect();
    }
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (documentsDir) await rm(documentsDir, { recursive: true, force: true });
  }, 30_000);

  it('inscrit, rafraîchit avec rotation, verrouille après échecs et force le changement de mot de passe', async () => {
    const register = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Auth Test', email, password, companyName: 'Cie Auth' }),
    });
    expect(register.status).toBe(201);
    let cookies = cookieHeader(register);
    expect(cookies).toMatch(/access_token=/);
    expect(cookies).toMatch(/refresh_token=/);
    expect(cookies).toMatch(/csrf_token=/);
    const csrfOf = (jar: string) => jar.match(/csrf_token=([^;]+)/)?.[1] ?? '';

    const firstRefresh = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: cookies, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfOf(cookies) },
    });
    expect(firstRefresh.status).toBe(200);
    const oldRefresh = cookies.match(/refresh_token=([^;]+)/)?.[1];
    cookies = cookieHeader(firstRefresh);
    const newRefresh = cookies.match(/refresh_token=([^;]+)/)?.[1];
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(oldRefresh);

    const reuse = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `refresh_token=${oldRefresh}; csrf_token=${csrfOf(cookies)}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfOf(cookies),
      },
    });
    expect(reuse.status).toBe(401);

    for (let index = 0; index < 5; index += 1) {
      const failed = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'mauvais-mot-de-passe' }),
      });
      expect(failed.status).toBe(401);
    }
    const locked = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(locked.status).toBe(429);

    await prisma.user.update({ where: { email }, data: { lockedUntil: null, mustChangePassword: true } });
    await prisma.loginAttempt.deleteMany({ where: { email } });
    const login = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    cookies = cookieHeader(login);
    const csrf = cookies.match(/csrf_token=([^;]+)/)?.[1];
    const clientsBlocked = await fetch(`${apiUrl}/clients?page=1&limit=1`, {
      headers: { Cookie: cookies, 'X-CSRF-Token': csrf ?? '' },
    });
    expect(clientsBlocked.status).toBe(403);

    const changed = await fetch(`${apiUrl}/auth/change-password`, {
      method: 'POST',
      headers: { Cookie: cookies, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' },
      body: JSON.stringify({ currentPassword: password, newPassword: 'nouveau-mot-de-passe-12' }),
    });
    expect(changed.status).toBe(200);
    cookies = cookieHeader(changed);
    const csrf2 = cookies.match(/csrf_token=([^;]+)/)?.[1];
    const clientsOk = await fetch(`${apiUrl}/clients?page=1&limit=1`, {
      headers: { Cookie: cookies, 'X-CSRF-Token': csrf2 ?? '' },
    });
    expect(clientsOk.status).toBe(200);
  }, 60_000);
});
