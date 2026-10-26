/**
 * Espaces d'essai (démo pour les visiteurs) : un clic crée une entreprise isolée, remplie de
 * données fictives, supprimée automatiquement à l'expiration. Désactivé par défaut.
 */
export interface SandboxConfig {
  readonly enabled: boolean;
  /** Durée de vie d'un espace d'essai, en heures. */
  readonly ttlHours: number;
  /** Nombre maximal d'espaces d'essai simultanés (protège le stockage de la base). */
  readonly maxActive: number;
  /** Nombre maximal d'espaces créés par une même adresse IP et par heure. */
  readonly maxPerIpPerHour: number;
  /** Nombre maximal d'espaces préparés en même temps (protège le processeur). */
  readonly maxConcurrent: number;
  /**
   * Nombre d'espaces complets préparés d'avance. Sur un hébergement à processeur lent, préparer
   * un espace prend plusieurs secondes : le réservoir rend le clic du visiteur instantané. 0 = désactivé.
   */
  readonly poolSize: number;
}

function integerFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} doit être un entier compris entre ${min} et ${max}.`);
  }
  return value;
}

/** Lue à chaque appel : une valeur invalide est refusée plutôt qu'ignorée. */
export function sandboxConfig(): SandboxConfig {
  const raw = (process.env.SANDBOX_ENABLED ?? 'false').trim().toLowerCase();
  if (raw !== 'true' && raw !== 'false') throw new Error('SANDBOX_ENABLED doit valoir true ou false.');
  return {
    enabled: raw === 'true',
    ttlHours: integerFromEnv('SANDBOX_TTL_HOURS', 12, 1, 168),
    maxActive: integerFromEnv('SANDBOX_MAX_ACTIVE', 30, 1, 1_000),
    maxPerIpPerHour: integerFromEnv('SANDBOX_MAX_PER_IP_PER_HOUR', 3, 1, 100),
    maxConcurrent: integerFromEnv('SANDBOX_MAX_CONCURRENT', 2, 1, 10),
    poolSize: integerFromEnv('SANDBOX_POOL_SIZE', 2, 0, 5),
  };
}
