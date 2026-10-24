import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.DOCUMENTS_DIR ?? 'var/documents');
const hashPattern = /^[a-f0-9]{64}$/;

function logoPath(companyId: string, hash: string): string {
  if (!hashPattern.test(hash)) throw new Error('Empreinte de logo invalide');
  return path.join(root, companyId, 'logos', `${hash}.png`);
}

export async function saveCompanyLogo(companyId: string, bytes: Buffer) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const target = logoPath(companyId, hash);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return { hash, reference: path.relative(root, target).split(path.sep).join('/') };
}

export async function readCompanyLogo(companyId: string, reference: string, expectedHash: string): Promise<Buffer> {
  const target = logoPath(companyId, expectedHash);
  const expectedReference = path.relative(root, target).split(path.sep).join('/');
  if (reference !== expectedReference) throw new Error('Référence du logo invalide');
  const bytes = await readFile(target);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) throw new Error('Empreinte du logo incorrecte');
  return bytes;
}
