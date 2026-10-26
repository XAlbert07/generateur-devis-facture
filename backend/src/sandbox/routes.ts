import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuthentication } from '../auth/authenticate.js';
import { clientIp, setAccessCookie, setCsrfCookie, setRefreshCookie } from '../auth/cookies.js';
import { newCsrfToken } from '../auth/csrf.js';
import { issueRefreshToken } from '../auth/refresh-tokens.js';
import { createAccessToken } from '../auth/tokens.js';
import { prisma } from '../db/prisma.js';
import { logError, logInfo } from '../http/logger.js';
import { problem } from '../http/problem.js';
import { buildSandbox, claimPooledSandbox, type SandboxIdentity } from './build.js';
import { sandboxConfig } from './config.js';
import { refundIpSlot, releaseSlot, takeIpSlot, tryAcquireSlot } from './limits.js';
import { ensureSandboxPool } from './pool.js';
import { countActiveSandboxes, purgeExpiredSandboxes } from './purge.js';

export const sandboxRouter = Router();

/** Le remplissage s'adresse au serveur lui-même, sur le port qui a reçu la requête. */
function loopbackUrl(request: Request): string {
  return `http://127.0.0.1:${request.socket.localPort ?? Number(process.env.PORT ?? 3000)}`;
}

/**
 * Public : indique si le bouton « Essayer la démo » doit être proposé. Cet appel est aussi le
 * signal qu'un visiteur arrive : on en profite pour compléter le réservoir avant son clic.
 */
sandboxRouter.get('/', (request: Request, response: Response) => {
  const { enabled } = sandboxConfig();
  if (enabled) ensureSandboxPool(loopbackUrl(request));
  response.json({ enabled });
});

/** Authentifié : indique si l'espace courant est un espace d'essai, et quand il disparaîtra. */
sandboxRouter.get('/session', requireAuthentication, async (request: Request, response: Response) => {
  const company = await prisma.company.findUnique({
    where: { id: request.auth!.companyId },
    select: { sandboxExpiresAt: true },
  });
  response.json({ sandbox: Boolean(company?.sandboxExpiresAt), expiresAt: company?.sandboxExpiresAt?.toISOString() ?? null });
});

/** Public : ouvre une session administrateur dans un espace d'essai rempli de données fictives. */
sandboxRouter.post('/', async (request: Request, response: Response) => {
  const config = sandboxConfig();
  if (!config.enabled) {
    problem(response, 404, 'Les espaces d’essai ne sont pas disponibles');
    return;
  }
  const ip = clientIp(request);
  if (!takeIpSlot(ip, config.maxPerIpPerHour)) {
    problem(response, 429, 'Trop d’espaces d’essai créés depuis votre connexion. Réessayez plus tard.');
    return;
  }

  const started = Date.now();
  const baseUrl = loopbackUrl(request);
  let identity: SandboxIdentity | null;
  let source: 'pool' | 'built' = 'pool';
  let preparing = false;
  try {
    identity = await claimPooledSandbox(config.ttlHours);
    if (!identity) {
      // Réservoir vide : préparation à la demande, plus lente, mais bornée.
      source = 'built';
      if (!tryAcquireSlot(config.maxConcurrent)) {
        refundIpSlot(ip);
        problem(response, 503, 'Plusieurs espaces d’essai sont en préparation. Réessayez dans un instant.');
        return;
      }
      preparing = true;
      await purgeExpiredSandboxes();
      if (await countActiveSandboxes() >= config.maxActive) {
        refundIpSlot(ip);
        problem(response, 503, 'Toutes les places de démonstration sont occupées. Réessayez dans quelques minutes.');
        return;
      }
      identity = await buildSandbox(baseUrl, { claimed: true, ttlHours: config.ttlHours });
    }

    const refresh = await issueRefreshToken(identity.userId);
    setAccessCookie(response, createAccessToken({ userId: identity.userId, companyId: identity.companyId, role: 'ADMINISTRATEUR' }));
    setRefreshCookie(response, refresh.raw);
    setCsrfCookie(response, newCsrfToken());
    response.status(201).json({
      user: { id: identity.userId, name: identity.userName, email: identity.userEmail, mustChangePassword: false },
      company: { id: identity.companyId, name: identity.companyName },
      role: 'ADMINISTRATEUR',
    });
    logInfo('sandbox_opened', { requestId: response.locals.requestId, source, durationMs: Date.now() - started });
    ensureSandboxPool(baseUrl); // remplace l'espace attribué, sans faire attendre le visiteur
  } catch (error) {
    refundIpSlot(ip);
    logError('sandbox_open_failed', { requestId: response.locals.requestId, reason: error instanceof Error ? error.message : 'unknown' });
    problem(response, 503, 'Impossible de préparer l’espace d’essai pour le moment.');
  } finally {
    if (preparing) releaseSlot();
  }
});
