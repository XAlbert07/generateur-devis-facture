/**
 * Garde-fous mémoire (une seule instance de l'API) contre l'abus de la création d'espaces d'essai.
 * Le plafond global d'espaces actifs, lui, est vérifié en base : il survit aux redémarrages.
 */
const WINDOW_MS = 60 * 60 * 1000;
const hitsByIp = new Map<string, number[]>();
let running = 0;

/** Réserve une création pour cette adresse ; faux si elle a atteint sa limite horaire. */
export function takeIpSlot(ip: string, limit: number, now = Date.now()): boolean {
  const recent = (hitsByIp.get(ip) ?? []).filter((timestamp) => timestamp > now - WINDOW_MS);
  if (recent.length >= limit) {
    hitsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  hitsByIp.set(ip, recent);
  if (hitsByIp.size > 5_000) {
    for (const [key, timestamps] of hitsByIp) {
      if (timestamps.every((timestamp) => timestamp <= now - WINDOW_MS)) hitsByIp.delete(key);
    }
  }
  return true;
}

/** Rend la place réservée quand la création a échoué pour une raison indépendante du visiteur. */
export function refundIpSlot(ip: string): void {
  const hits = hitsByIp.get(ip);
  hits?.pop();
}

/** Limite le nombre de préparations simultanées. */
export function tryAcquireSlot(max: number): boolean {
  if (running >= max) return false;
  running += 1;
  return true;
}

export function releaseSlot(): void {
  running = Math.max(0, running - 1);
}

export function resetSandboxLimits(): void {
  hitsByIp.clear();
  running = 0;
}
