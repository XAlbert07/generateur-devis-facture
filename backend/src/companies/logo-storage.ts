import { createHash } from 'node:crypto';
import { getFile, putFile } from '../storage/file-store.js';

const hashPattern = /^[a-f0-9]{64}$/;

function logoReference(companyId: string, hash: string): string {
  if (!hashPattern.test(hash)) throw new Error('Empreinte de logo invalide');
  return `${companyId}/logos/${hash}.png`;
}

export async function saveCompanyLogo(companyId: string, bytes: Buffer) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const reference = logoReference(companyId, hash);
  await putFile(companyId, reference, bytes);
  return { hash, reference };
}

export async function readCompanyLogo(companyId: string, reference: string, expectedHash: string): Promise<Buffer> {
  const expectedReference = logoReference(companyId, expectedHash);
  if (reference !== expectedReference) throw new Error('Référence du logo invalide');
  const bytes = await getFile(companyId, expectedReference);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) throw new Error('Empreinte du logo incorrecte');
  return bytes;
}
