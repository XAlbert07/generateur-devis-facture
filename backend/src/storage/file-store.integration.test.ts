import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? '';
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && databaseName.endsWith('_test');

describe.skipIf(!enabled)('stockage des fichiers dans PostgreSQL', () => {
  type Prisma = typeof import('../db/prisma.js').prisma;
  let prisma: Prisma;
  let store: typeof import('./file-store.js');
  let companyId: string;
  let otherCompanyId: string;
  const previousMode = process.env.DOCUMENTS_STORAGE;

  beforeAll(async () => {
    process.env.DOCUMENTS_STORAGE = 'database';
    ({ prisma } = await import('../db/prisma.js'));
    store = await import('./file-store.js');
    companyId = (await prisma.company.create({ data: { name: 'Stockage test A' } })).id;
    otherCompanyId = (await prisma.company.create({ data: { name: 'Stockage test B' } })).id;
  }, 30_000);

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId].filter(Boolean) } } });
    await prisma.$disconnect();
    if (previousMode === undefined) delete process.env.DOCUMENTS_STORAGE;
    else process.env.DOCUMENTS_STORAGE = previousMode;
  });

  it('restitue octet pour octet un contenu binaire et le remplace à la même référence', async () => {
    const reference = `${companyId}/binaire.pdf`;
    const original = randomBytes(256 * 1024);

    await store.putFile(companyId, reference, original);
    expect((await store.getFile(companyId, reference)).equals(original)).toBe(true);

    const remplacement = randomBytes(1024);
    await store.putFile(companyId, reference, remplacement);
    expect((await store.getFile(companyId, reference)).equals(remplacement)).toBe(true);
    expect(await prisma.storedFile.count({ where: { reference } })).toBe(1);
  });

  it("n'expose jamais le fichier d'une entreprise à une autre", async () => {
    const reference = `${companyId}/prive.pdf`;
    await store.putFile(companyId, reference, Buffer.from('confidentiel'));

    await expect(store.getFile(otherCompanyId, reference)).rejects.toThrow('Fichier introuvable');
  });

  it("supprime les fichiers avec leur entreprise", async () => {
    const temporary = (await prisma.company.create({ data: { name: 'Stockage test cascade' } })).id;
    await store.putFile(temporary, `${temporary}/a.pdf`, Buffer.from('a'));
    await store.putFile(temporary, `${temporary}/logos/b.png`, Buffer.from('b'));
    expect(await prisma.storedFile.count({ where: { companyId: temporary } })).toBe(2);

    await prisma.company.delete({ where: { id: temporary } });

    expect(await prisma.storedFile.count({ where: { companyId: temporary } })).toBe(0);
  });
});
