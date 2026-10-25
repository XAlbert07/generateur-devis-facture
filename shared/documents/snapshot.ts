import { createHash } from 'node:crypto';

/**
 * Sérialisation déterministe alignée sur RFC 8785 / JCS pour les instantanés métier.
 * Les clés des objets sont triées par ordre lexicographique UTF-16 (comparaison native JS),
 * ce qui est requis par JCS et garantit un résultat identique quel que soit l'environnement.
 */
export function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

export function hashSnapshot(snapshot: unknown): string {
  return createHash('sha256').update(JSON.stringify(jsonValue(snapshot))).digest('hex');
}
