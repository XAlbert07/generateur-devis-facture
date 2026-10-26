import { logError, logInfo } from '../http/logger.js';
import { buildSandbox, countPooledSandboxes } from './build.js';
import { sandboxConfig } from './config.js';
import { countActiveSandboxes, purgeExpiredSandboxes } from './purge.js';

const RETRY_AFTER_FAILURE_MS = 60_000;
let refill: Promise<void> | undefined;
let retryNotBefore = 0;

async function refillPool(baseUrl: string): Promise<void> {
  const config = sandboxConfig();
  await purgeExpiredSandboxes();
  while (await countPooledSandboxes() < config.poolSize) {
    if (await countActiveSandboxes() >= config.maxActive) return;
    const started = Date.now();
    await buildSandbox(baseUrl, { claimed: false, ttlHours: config.ttlHours });
    logInfo('sandbox_pool_refilled', { durationMs: Date.now() - started });
  }
}

/**
 * Complète le réservoir en arrière-plan, sans attendre. Appelé dès qu'un visiteur ouvre la page
 * de connexion (avant même son clic), et après chaque attribution. Un seul remplissage à la fois ;
 * après un échec, une minute de pause évite de saturer un serveur en difficulté.
 */
export function ensureSandboxPool(baseUrl: string): void {
  let config;
  try {
    config = sandboxConfig();
  } catch {
    return;
  }
  if (!config.enabled || config.poolSize === 0 || refill || Date.now() < retryNotBefore) return;
  refill = refillPool(baseUrl)
    .catch((error: unknown) => {
      retryNotBefore = Date.now() + RETRY_AFTER_FAILURE_MS;
      logError('sandbox_pool_refill_failed', { reason: error instanceof Error ? error.message : 'unknown' });
    })
    .finally(() => { refill = undefined; });
}

/** Attend la fin du remplissage en cours (tests et arrêt propre). */
export async function waitForSandboxPool(): Promise<void> {
  await refill;
}

export function resetSandboxPool(): void {
  retryNotBefore = 0;
}
