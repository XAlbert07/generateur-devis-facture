/**
 * Audit npm avec allowlist d’advisories différées (majors Zod/Vitest/Prisma).
 * Usage : npm run audit:deps
 * Échoue (code 1) sur high/critical hors allowlist.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Via = string | { name?: string; url?: string; severity?: string };
type Advisory = { severity?: string; via?: Via[] };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowlistPath = path.join(root, 'conception', 'AUDIT_EXCEPTIONS.json');

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8')) as {
  deferredUntil?: string;
  advisories: Array<{ id: string; reason: string }>;
};
const allowed = new Set(allowlist.advisories.map((item) => item.id));

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
});
let report: { vulnerabilities?: Record<string, Advisory> };
try {
  report = JSON.parse(result.stdout || '{}') as typeof report;
} catch {
  console.error(JSON.stringify({
    level: 'error', message: 'audit_parse_failed', at: new Date().toISOString(),
  }));
  process.exit(1);
}

const found = new Map<string, { severity: string; packages: Set<string> }>();
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via === 'string') continue;
    const url = via.url ?? '';
    const match = url.match(/GHSA-[\w-]+/i);
    if (!match) continue;
    const id = match[0];
    const severity = via.severity ?? vuln.severity ?? 'unknown';
    if (severity !== 'high' && severity !== 'critical') continue;
    const entry = found.get(id) ?? { severity, packages: new Set<string>() };
    entry.packages.add(via.name ?? name);
    found.set(id, entry);
  }
}

const blockers = [...found.entries()]
  .filter(([id]) => !allowed.has(id))
  .map(([id, meta]) => ({
    id, severity: meta.severity, packages: [...meta.packages],
  }));

console.log(JSON.stringify({
  level: 'info',
  message: 'dependency_audit',
  at: new Date().toISOString(),
  deferredUntil: allowlist.deferredUntil ?? null,
  allowlisted: allowlist.advisories.length,
  highCriticalFound: found.size,
  blockers: blockers.length,
  details: blockers,
}));

if (blockers.length > 0) process.exit(1);
