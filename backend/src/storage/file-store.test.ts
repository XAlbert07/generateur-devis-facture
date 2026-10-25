import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
const findFirst = vi.fn();
vi.mock('../db/prisma.js', () => ({ prisma: { storedFile: { upsert, findFirst } } }));

const companyId = '11111111-1111-4111-8111-111111111111';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';

let documentsDir: string;

async function loadStore() {
  vi.resetModules();
  return import('./file-store.js');
}

describe('stockage des fichiers', () => {
  beforeEach(async () => {
    documentsDir = await mkdtemp(path.join(os.tmpdir(), 'devis-store-'));
    process.env.DOCUMENTS_DIR = documentsDir;
    delete process.env.DOCUMENTS_STORAGE;
    upsert.mockReset();
    findFirst.mockReset();
  });

  afterEach(async () => {
    delete process.env.DOCUMENTS_DIR;
    delete process.env.DOCUMENTS_STORAGE;
    await rm(documentsDir, { recursive: true, force: true });
  });

  describe('mode filesystem (défaut)', () => {
    it('écrit puis relit un fichier, et peut le remplacer', async () => {
      const { putFile, getFile } = await loadStore();
      const reference = `${companyId}/doc.pdf`;

      await putFile(companyId, reference, Buffer.from('premier'));
      expect((await getFile(companyId, reference)).toString()).toBe('premier');

      await putFile(companyId, reference, Buffer.from('remplacé'));
      expect((await getFile(companyId, reference)).toString()).toBe('remplacé');
      expect(upsert).not.toHaveBeenCalled();
    });

    it('refuse une référence qui sort du répertoire de documents', async () => {
      const { putFile, getFile } = await loadStore();

      await expect(putFile(companyId, '../evasion.pdf', Buffer.from('x'))).rejects.toThrow('Référence de fichier invalide');
      await expect(getFile(companyId, `${companyId}/../../etc/passwd`)).rejects.toThrow('Référence de fichier invalide');
    });

    it('échoue quand le fichier est absent', async () => {
      const { getFile } = await loadStore();

      await expect(getFile(companyId, `${companyId}/absent.pdf`)).rejects.toThrow();
    });
  });

  describe('mode database', () => {
    beforeEach(() => {
      process.env.DOCUMENTS_STORAGE = 'database';
    });

    it('enregistre le contenu, son empreinte et son entreprise sans toucher au disque', async () => {
      const { putFile } = await loadStore();
      const bytes = Buffer.from('%PDF-1.7 contenu');
      const reference = `${companyId}/doc.pdf`;

      await putFile(companyId, reference, bytes);

      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0]![0] as {
        where: { reference: string };
        create: { companyId: string; sha256: string; bytes: Uint8Array };
      };
      expect(call.where).toEqual({ reference });
      expect(call.create.companyId).toBe(companyId);
      expect(call.create.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(Buffer.from(call.create.bytes).equals(bytes)).toBe(true);
    });

    it('relit le contenu en filtrant par entreprise', async () => {
      const { getFile } = await loadStore();
      findFirst.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) });

      const bytes = await getFile(companyId, `${companyId}/doc.pdf`);

      expect(Buffer.isBuffer(bytes)).toBe(true);
      expect([...bytes]).toEqual([1, 2, 3]);
      expect(findFirst.mock.calls[0]![0]).toMatchObject({ where: { reference: `${companyId}/doc.pdf`, companyId } });
    });

    it("échoue quand le fichier n'existe pas pour cette entreprise", async () => {
      const { getFile } = await loadStore();
      findFirst.mockResolvedValue(null);

      await expect(getFile(otherCompanyId, `${companyId}/doc.pdf`)).rejects.toThrow('Fichier introuvable');
    });
  });

  it('refuse une valeur inconnue de DOCUMENTS_STORAGE plutôt que de retomber sur le disque', async () => {
    process.env.DOCUMENTS_STORAGE = 'db';
    const { putFile, storageMode } = await loadStore();

    expect(() => storageMode()).toThrow('DOCUMENTS_STORAGE doit valoir filesystem ou database.');
    await expect(putFile(companyId, `${companyId}/doc.pdf`, Buffer.from('x'))).rejects.toThrow('DOCUMENTS_STORAGE');
  });

  it('construit les mêmes références pour les devis, factures et annulations', async () => {
    const { saveQuotePdf, saveInvoicePdf, saveCancellationPdf, saveQuoteCancellationPdf, hashPdf } = await import('../quotes/pdf-storage.js');
    vi.resetModules();
    const bytes = Buffer.from('%PDF');

    expect((await saveQuotePdf(companyId, 'd1', bytes)).reference).toBe(`${companyId}/d1.pdf`);
    expect((await saveInvoicePdf(companyId, 'd1', bytes)).reference).toBe(`${companyId}/invoices/d1.pdf`);
    expect((await saveCancellationPdf(companyId, 'd1', bytes)).reference).toBe(`${companyId}/cancellations/d1.pdf`);
    expect((await saveQuoteCancellationPdf(companyId, 'd1', bytes)).reference).toBe(`${companyId}/quote-cancellations/d1.pdf`);
    expect((await saveQuotePdf(companyId, 'd1', bytes)).hash).toBe(hashPdf(bytes));
  });
});
