import { createHash } from 'node:crypto';

/** Sérialisation stable et compatible JSON pour les instantanés métier. */
export function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

export function hashSnapshot(snapshot: unknown): string {
  return createHash('sha256').update(JSON.stringify(jsonValue(snapshot))).digest('hex');
}
