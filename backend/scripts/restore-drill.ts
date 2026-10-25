/**
 * Exercice de restauration (§18 / vague A2).
 * Dump la base source, restaure dans une base jetable, vérifie le schéma,
 * contrôle optionnellement DOCUMENTS_DIR, puis détruit la base jetable.
 *
 * Usage : npm run ops:restore-drill
 * Env : DATABASE_URL (source), RESTORE_DRILL_DB (défaut : <db>_restore_drill)
 */
import { spawnSync } from 'node:child_process';
import { access, constants, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), kind: 'restore_drill', ...entry }));
}

function parseDatabaseUrl(url: string): {
  user: string; password: string; host: string; port: string; database: string;
} {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!database) throw new Error('DATABASE_URL sans nom de base');
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname || '127.0.0.1',
    port: parsed.port || '5432',
    database,
  };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { env, encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} a échoué (${result.status}): ${detail}`);
  }
}

function psqlScalar(args: string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync('psql', [...args, '-tA'], { env, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`psql a échoué: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout ?? '').trim();
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  log({ outcome: 'error', reason: 'DATABASE_URL manquant' });
  process.exit(1);
}

const source = parseDatabaseUrl(databaseUrl);
if (source.database.endsWith('_restore_drill')) {
  log({ outcome: 'error', reason: 'La base source ne doit pas être la base de drill' });
  process.exit(1);
}

const restoreDb = process.env.RESTORE_DRILL_DB?.trim() || `${source.database}_restore_drill`;
const env = {
  ...process.env,
  PGPASSWORD: source.password,
  PGHOST: source.host,
  PGPORT: source.port,
  PGUSER: source.user,
};

const workDir = await mkdtemp(path.join(tmpdir(), 'restore-drill-'));
const dumpPath = path.join(workDir, 'backup.dump');

try {
  log({ outcome: 'start', source: source.database, restoreDb, host: source.host, port: source.port });

  run('pg_dump', ['-Fc', '-d', source.database, '-f', dumpPath], env);
  const dumpStat = await stat(dumpPath);
  log({ outcome: 'dumped', bytes: dumpStat.size });

  run('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${restoreDb.replaceAll("'", "''")}' AND pid <> pg_backend_pid();`,
  ], env);
  run('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS "${restoreDb}";`], env);
  run('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${restoreDb}";`], env);
  log({ outcome: 'database_created', restoreDb });

  run('pg_restore', ['-d', restoreDb, '--no-owner', '--no-acl', '--exit-on-error', dumpPath], env);
  log({ outcome: 'restored' });

  const tables = psqlScalar(['-d', restoreDb, '-c',
    `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`,
  ], env);
  const tableCount = Number(tables);
  if (!Number.isFinite(tableCount) || tableCount < 5) {
    throw new Error(`Trop peu de tables publiques après restore (${tables})`);
  }

  const required = ['entreprise', 'utilisateur', 'devis', 'facture', 'paiement'];
  for (const table of required) {
    const exists = psqlScalar(['-d', restoreDb, '-c',
      `SELECT to_regclass('public.${table}') IS NOT NULL;`,
    ], env);
    if (exists !== 't') throw new Error(`Table manquante après restore : ${table}`);
  }

  const companies = psqlScalar(['-d', restoreDb, '-c', 'SELECT count(*) FROM entreprise;'], env);
  log({
    outcome: 'verified',
    tableCount,
    companies: Number(companies),
    requiredTables: required,
  });

  const documentsDir = path.resolve(process.env.DOCUMENTS_DIR ?? 'var/documents');
  try {
    await access(documentsDir, constants.R_OK);
    const entries = await readdir(documentsDir);
    log({
      outcome: 'documents_ok',
      documentsDir,
      entries: entries.length,
      note: entries.length === 0
        ? 'Répertoire présent mais vide (PDF à sauvegarder séparément en prod)'
        : 'Répertoire lisible',
    });
  } catch {
    log({
      outcome: 'documents_missing',
      documentsDir,
      note: 'DOCUMENTS_DIR inaccessible — les PDF ne sont pas dans PostgreSQL',
    });
  }

  run('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${restoreDb.replaceAll("'", "''")}' AND pid <> pg_backend_pid();`,
  ], env);
  run('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS "${restoreDb}";`], env);
  log({ outcome: 'cleanup', restoreDb });
  log({ outcome: 'ok', summary: 'dump → restore → verify → drop réussis' });
} catch (error) {
  log({
    outcome: 'error',
    reason: error instanceof Error ? error.message : 'échec inconnu',
  });
  try {
    run('psql', ['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS "${restoreDb}";`], env);
  } catch {
    // ignore cleanup failure
  }
  process.exitCode = 1;
} finally {
  await rm(workDir, { recursive: true, force: true });
}
