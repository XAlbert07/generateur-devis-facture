import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db/prisma.js';

/**
 * Stockage des fichiers (PDF émis, logos), selon DOCUMENTS_STORAGE :
 *  - `filesystem` (défaut) : répertoire DOCUMENTS_DIR, adapté au développement et à un
 *    serveur avec volume persistant ;
 *  - `database` : table PostgreSQL `fichier_stocke`, pour un hébergement au disque
 *    éphémère (Render gratuit, etc.).
 * Les références sont identiques dans les deux modes (`<entreprise>/<document>.pdf`).
 */
const root = path.resolve(process.env.DOCUMENTS_DIR ?? 'var/documents');

type StorageMode = 'filesystem' | 'database';

/** Une valeur inconnue est refusée : une faute de frappe ne doit pas renvoyer silencieusement sur un disque éphémère. */
export function storageMode(): StorageMode {
  const raw = (process.env.DOCUMENTS_STORAGE ?? 'filesystem').trim().toLowerCase();
  if (raw === 'filesystem' || raw === 'database') return raw;
  throw new Error('DOCUMENTS_STORAGE doit valoir filesystem ou database.');
}

function filesystemPath(reference: string): string {
  const target = path.resolve(root, ...reference.split('/'));
  if (path.relative(root, target).startsWith('..')) throw new Error('Référence de fichier invalide');
  return target;
}

export async function putFile(companyId: string, reference: string, bytes: Buffer): Promise<void> {
  if (storageMode() === 'database') {
    const data = new Uint8Array(bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await prisma.storedFile.upsert({
      where: { reference },
      create: { reference, companyId, sha256, bytes: data },
      update: { sha256, bytes: data },
    });
    return;
  }
  const target = filesystemPath(reference);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function getFile(companyId: string, reference: string): Promise<Buffer> {
  if (storageMode() === 'database') {
    const row = await prisma.storedFile.findFirst({ where: { reference, companyId }, select: { bytes: true } });
    if (!row) throw new Error('Fichier introuvable');
    return Buffer.from(row.bytes);
  }
  return readFile(filesystemPath(reference));
}
