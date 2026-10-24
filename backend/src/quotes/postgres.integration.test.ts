import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? '';
const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && databaseName.endsWith('_test');

describe.skipIf(!enabled)('parcours devis PostgreSQL', () => {
  let prisma: typeof import('../db/prisma.js').prisma;
  let server: Server | undefined;
  let companyId: string;
  let otherCompanyId: string;
  let userId: string;
  let otherUserId: string;
  let clientId: string;
  let apiUrl: string;
  let token: string;
  let otherToken: string;
  let documentsDir: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'postgres-integration-test-secret-at-least-32-chars';
    documentsDir = await mkdtemp(path.join(tmpdir(), 'devis-postgres-integration-'));
    process.env.DOCUMENTS_DIR = documentsDir;
    const [{ prisma: sharedPrisma }, { createAccessToken }, { createApp }] = await Promise.all([
      import('../db/prisma.js'), import('../auth/tokens.js'), import('../app.js'),
    ]);
    prisma = sharedPrisma;
    await prisma.$connect();
    const company = await prisma.company.create({ data: { name: 'Integration devis' } });
    companyId = company.id;
    const user = await prisma.user.create({ data: { name: 'Test', email: `quotes-${company.id}@example.test`, passwordHash: 'unused' } });
    userId = user.id;
    await prisma.companyMembership.create({ data: { companyId, userId, role: 'ADMINISTRATEUR' } });
    const client = await prisma.client.create({ data: { companyId, name: 'Client test' } });
    clientId = client.id;
    token = createAccessToken({ companyId, userId, role: 'ADMINISTRATEUR' });
    const otherCompany = await prisma.company.create({ data: { name: 'Autre entreprise de test' } });
    otherCompanyId = otherCompany.id;
    const otherUser = await prisma.user.create({ data: { name: 'Autre test', email: `quotes-other-${otherCompany.id}@example.test`, passwordHash: 'unused' } });
    otherUserId = otherUser.id;
    await prisma.companyMembership.create({ data: { companyId: otherCompanyId, userId: otherUserId, role: 'ADMINISTRATEUR' } });
    otherToken = createAccessToken({ companyId: otherCompanyId, userId: otherUserId, role: 'ADMINISTRATEUR' });
    const httpServer = createApp().listen(0, '127.0.0.1');
    server = httpServer;
    await new Promise<void>((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Serveur de test sans adresse TCP');
    apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    if (companyId) {
      await prisma.payment.deleteMany({ where: { invoice: { companyId } } });
      await prisma.invoice.deleteMany({ where: { companyId } });
      await prisma.quote.deleteMany({ where: { companyId } });
      await prisma.documentSequence.deleteMany({ where: { companyId } });
      await prisma.client.deleteMany({ where: { companyId } });
      await prisma.companyMembership.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    if (otherCompanyId) {
      await prisma.companyMembership.deleteMany({ where: { companyId: otherCompanyId } });
      await prisma.company.delete({ where: { id: otherCompanyId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (otherUserId) await prisma.user.delete({ where: { id: otherUserId } });
    await prisma.$disconnect();
    const serverToClose = server;
    if (serverToClose) await new Promise<void>((resolve, reject) => serverToClose.close((error) => error ? reject(error) : resolve()));
    if (documentsDir) await rm(documentsDir, { recursive: true, force: true });
  }, 30_000);

  it('vérifie le cycle devis, facture et paiements sous PostgreSQL', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const validUntil = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const created = await fetch(`${apiUrl}/quotes`, { method: 'POST', headers, body: JSON.stringify({
      clientId, validUntil, lines: [{ description: 'Prestation', quantityMilli: '1000', unitPrice: '2500', taxRateBasisPts: 0 }],
    }) });
    expect(created.status).toBe(201);
    const draft = await created.json() as { id: string; version: number };
    const crossTenantRead = await fetch(`${apiUrl}/quotes/${draft.id}`, { headers: { Authorization: `Bearer ${otherToken}` } });
    expect(crossTenantRead.status).toBe(404);
    const sent = await fetch(`${apiUrl}/quotes/${draft.id}/send`, { method: 'POST', headers: { ...headers, 'If-Match': `"${draft.version}"` } });
    expect(sent.status).toBe(200);
    const sentQuote = await sent.json() as { version: number; snapshotHash: string | null };
    expect(sentQuote.snapshotHash).toMatch(/^[a-f0-9]{64}$/);

    const pdf = await fetch(`${apiUrl}/quotes/${draft.id}/pdf`, { headers });
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    const today = new Date().toISOString().slice(0, 10);
    const accepted = await fetch(`${apiUrl}/quotes/${draft.id}/accept`, { method: 'POST', headers: { ...headers, 'If-Match': `"${sentQuote.version}"` }, body: JSON.stringify({ acceptanceDate: today }) });
    expect(accepted.status).toBe(200);
    const acceptedQuote = await accepted.json() as { version: number };

    const expiringDraft = await fetch(`${apiUrl}/quotes`, { method: 'POST', headers, body: JSON.stringify({
      clientId, validUntil, lines: [{ description: 'Service expirant', quantityMilli: '1000', unitPrice: '500', taxRateBasisPts: 0 }],
    }) });
    const expiring = await expiringDraft.json() as { id: string; version: number };
    const expiringSend = await fetch(`${apiUrl}/quotes/${expiring.id}/send`, { method: 'POST', headers: { ...headers, 'If-Match': `"${expiring.version}"` } });
    const sentExpiring = await expiringSend.json() as { version: number };
    const yesterday = new Date(Date.now() - 86_400_000);
    await prisma.quote.update({ where: { id: expiring.id }, data: { validUntil: new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate())) } });
    const expiredAcceptance = await fetch(`${apiUrl}/quotes/${expiring.id}/accept`, { method: 'POST', headers: { ...headers, 'If-Match': `"${sentExpiring.version}"` }, body: JSON.stringify({ acceptanceDate: today }) });
    expect(expiredAcceptance.status).toBe(409);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: expiring.id } })).status).toBe('EXPIRE');

    const conversionHeaders = { ...headers, 'If-Match': `"${acceptedQuote.version}"` };
    const conversions = await Promise.all([1, 2].map(() => fetch(`${apiUrl}/quotes/${draft.id}/convert`, { method: 'POST', headers: conversionHeaders })));
    expect(conversions.map((response) => response.status).sort()).toEqual([200, 201]);
    const invoices = await Promise.all(conversions.map((response) => response.json() as Promise<{ id: string; version: number }>));
    expect(invoices[0]!.id).toBe(invoices[1]!.id);
    expect(await prisma.invoice.count({ where: { quoteId: draft.id, companyId } })).toBe(1);

    const invoiceId = invoices[0]!.id;
    expect((await fetch(`${apiUrl}/invoices/${invoiceId}`, { headers })).status).toBe(200);
    const otherTenantInvoice = await fetch(`${apiUrl}/invoices/${invoiceId}`, { headers: { Authorization: `Bearer ${otherToken}` } });
    expect(otherTenantInvoice.status).toBe(404);
    const issueHeaders = { ...headers, 'If-Match': `"${invoices[0]!.version}"` };
    const issued = await fetch(`${apiUrl}/invoices/${invoiceId}/issue`, { method: 'POST', headers: issueHeaders });
    expect(issued.status).toBe(200);
    const issuedInvoice = await issued.json() as { number: string; status: string; issueDate: string; dueDate: string; pdfHash: string | null; version: number };
    expect(issuedInvoice.status).toBe('EMISE');
    expect(issuedInvoice.number).toMatch(/^FAC-\d{4}-\d{5}$/);
    expect(issuedInvoice.pdfHash).toMatch(/^[a-f0-9]{64}$/);
    const repeatedIssue = await fetch(`${apiUrl}/invoices/${invoiceId}/issue`, { method: 'POST', headers: issueHeaders });
    expect((await repeatedIssue.json() as { number: string }).number).toBe(issuedInvoice.number);
    const invoicePdf = await fetch(`${apiUrl}/invoices/${invoiceId}/pdf`, { headers });
    expect(invoicePdf.status).toBe(200);
    const originalInvoicePdf = Buffer.from(await invoicePdf.arrayBuffer());
    expect(originalInvoicePdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((Date.parse(issuedInvoice.dueDate) - Date.parse(issuedInvoice.issueDate)) / 86_400_000).toBe(30);
    expect((await fetch(`${apiUrl}/invoices`, { headers })).status).toBe(200);

    const paymentsUrl = `${apiUrl}/invoices/${invoiceId}/payments`;
    const firstPaymentBody = { amount: '1000', paymentDate: today, method: 'ESPECES' };
    const firstKey = `payment-${draft.id}`;
    const firstPaymentResponse = await fetch(paymentsUrl, { method: 'POST', headers: { ...headers, 'Idempotency-Key': firstKey }, body: JSON.stringify(firstPaymentBody) });
    expect(firstPaymentResponse.status).toBe(201);
    const firstPayment = await firstPaymentResponse.json() as { id: string; createdByUserId: string };
    expect(firstPayment.createdByUserId).toBe(userId);
    const otherTenantPayments = await fetch(paymentsUrl, { headers: { Authorization: `Bearer ${otherToken}` } });
    expect(otherTenantPayments.status).toBe(404);
    const replay = await fetch(paymentsUrl, { method: 'POST', headers: { ...headers, 'Idempotency-Key': firstKey }, body: JSON.stringify(firstPaymentBody) });
    expect(replay.status).toBe(200);
    expect((await replay.json() as { id: string }).id).toBe(firstPayment.id);
    const reusedKey = await fetch(paymentsUrl, { method: 'POST', headers: { ...headers, 'Idempotency-Key': firstKey }, body: JSON.stringify({ ...firstPaymentBody, amount: '1001' }) });
    expect(reusedKey.status).toBe(409);

    const concurrentPayments = await Promise.all(['payment-race-a', 'payment-race-b'].map((key) => fetch(paymentsUrl, {
      method: 'POST', headers: { ...headers, 'Idempotency-Key': key },
      body: JSON.stringify({ amount: '1500', paymentDate: today, method: 'VIREMENT' }),
    })));
    expect(concurrentPayments.map((response) => response.status).sort()).toEqual([201, 409]);
    const createdRaceResponse = concurrentPayments.find((response) => response.status === 201)!;
    const racePayment = await createdRaceResponse.json() as { id: string };
    const fullSummary = await (await fetch(paymentsUrl, { headers })).json() as { summary: { paid: string; balance: string; status: string } };
    expect(fullSummary.summary).toMatchObject({ paid: '2500', balance: '0', status: 'PAYEE' });
    const cancelWithActivePayments = await fetch(`${apiUrl}/invoices/${invoiceId}/cancel`, {
      method: 'POST', headers: { ...headers, 'If-Match': `"${issuedInvoice.version}"` }, body: JSON.stringify({ reason: 'Ne doit pas passer' }),
    });
    expect(cancelWithActivePayments.status).toBe(409);
    const extraPayment = await fetch(paymentsUrl, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'payment-overflow' }, body: JSON.stringify({ amount: '1', paymentDate: today, method: 'AUTRE' }) });
    expect(extraPayment.status).toBe(409);

    const cancelFirst = await fetch(`${paymentsUrl}/${firstPayment.id}/cancel`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Saisie en double' }) });
    expect(cancelFirst.status).toBe(200);
    expect((await cancelFirst.json() as { cancelledByUserId: string }).cancelledByUserId).toBe(userId);
    const cancelRace = await fetch(`${paymentsUrl}/${racePayment.id}/cancel`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Correction de test' }) });
    expect(cancelRace.status).toBe(200);
    await prisma.payment.update({ where: { id: firstPayment.id }, data: { idempotencyExpiresAt: new Date(Date.now() - 1_000) } });
    const expiredKeyReuse = await fetch(paymentsUrl, { method: 'POST', headers: { ...headers, 'Idempotency-Key': firstKey }, body: JSON.stringify(firstPaymentBody) });
    expect(expiredKeyReuse.status).toBe(201);
    const replacementPayment = await expiredKeyReuse.json() as { id: string };
    expect(replacementPayment.id).not.toBe(firstPayment.id);
    const replacementCancel = await fetch(`${paymentsUrl}/${replacementPayment.id}/cancel`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Test de nouvelle clé expirée' }) });
    expect(replacementCancel.status).toBe(200);
    const finalSummary = await (await fetch(paymentsUrl, { headers })).json() as { summary: { paid: string; balance: string; status: string } };
    expect(finalSummary.summary).toMatchObject({ paid: '0', balance: '2500', status: 'IMPAYEE' });

    const dashboardResponse = await fetch(`${apiUrl}/dashboard/summary`, { headers });
    expect(dashboardResponse.status).toBe(200);
    const dashboard = await dashboardResponse.json() as { amounts: Record<string, string>; counts: Record<string, number> };
    expect(dashboard.amounts).toMatchObject({ billedExcludingTax: '2500', paid: '0', outstanding: '2500', overdue: '0' });
    expect(dashboard.counts).toMatchObject({ issuedInvoices: 1, pendingQuotes: 0 });
    const otherDashboard = await (await fetch(`${apiUrl}/dashboard/summary`, { headers: { Authorization: `Bearer ${otherToken}` } })).json() as { amounts: Record<string, string> };
    expect(otherDashboard.amounts.outstanding).toBe('0');

    const invoiceBeforeCancel = await (await fetch(`${apiUrl}/invoices/${invoiceId}`, { headers })).json() as { version: number };
    const cancelled = await fetch(`${apiUrl}/invoices/${invoiceId}/cancel`, {
      method: 'POST', headers: { ...headers, 'If-Match': `"${invoiceBeforeCancel.version}"` }, body: JSON.stringify({ reason: 'Facture créée par erreur' }),
    });
    expect(cancelled.status).toBe(200);
    const cancelledInvoice = await cancelled.json() as { status: string; cancellationPdfHash: string | null; cancellationReason: string; cancelledAt: string | null; cancelledByUserId: string | null };
    expect(cancelledInvoice).toMatchObject({ status: 'ANNULEE', cancellationReason: 'Facture créée par erreur', cancelledByUserId: userId });
    expect(cancelledInvoice.cancelledAt).toBeTruthy();
    expect(cancelledInvoice.cancellationPdfHash).toMatch(/^[a-f0-9]{64}$/);
    const repeatedCancel = await fetch(`${apiUrl}/invoices/${invoiceId}/cancel`, {
      method: 'POST', headers: { ...headers, 'If-Match': `"${invoiceBeforeCancel.version}"` }, body: JSON.stringify({ reason: 'Nouvelle raison ignorée' }),
    });
    expect(repeatedCancel.status).toBe(200);
    expect((await repeatedCancel.json() as { cancellationReason: string }).cancellationReason).toBe('Facture créée par erreur');
    const originalAfterCancel = Buffer.from(await (await fetch(`${apiUrl}/invoices/${invoiceId}/pdf`, { headers })).arrayBuffer());
    expect(originalAfterCancel.equals(originalInvoicePdf)).toBe(true);
    const cancellationPdf = await fetch(`${apiUrl}/invoices/${invoiceId}/cancellation-pdf`, { headers });
    expect(cancellationPdf.status).toBe(200);
    expect(Buffer.from(await cancellationPdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    const paymentAfterCancel = await fetch(paymentsUrl, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'cancelled-invoice-payment' }, body: JSON.stringify({ amount: '1', paymentDate: today, method: 'AUTRE' }) });
    expect(paymentAfterCancel.status).toBe(409);
  }, 30_000);

  it('crée, modifie et supprime les factures brouillon', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const invoiceUrl = `${apiUrl}/invoices`;
    const input = (unitPrice: string) => ({
      clientId,
      lines: [{ description: 'Intervention manuelle', quantityMilli: '1000', unitPrice, taxRateBasisPts: 0 }],
    });
    const createdResponse = await fetch(invoiceUrl, { method: 'POST', headers, body: JSON.stringify(input('2500')) });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string; version: number; status: string; origin: string; totalInclTax: string };
    expect(created).toMatchObject({ version: 1, status: 'BROUILLON', origin: 'MANUELLE', totalInclTax: '2500' });

    const wrongTenant = await fetch(`${invoiceUrl}/${created.id}`, { headers: { Authorization: `Bearer ${otherToken}` } });
    expect(wrongTenant.status).toBe(404);
    const missingVersion = await fetch(`${invoiceUrl}/${created.id}`, { method: 'PUT', headers, body: JSON.stringify(input('3000')) });
    expect(missingVersion.status).toBe(428);

    const competingUpdates = await Promise.all(['3000', '4000'].map((price) => fetch(`${invoiceUrl}/${created.id}`, {
      method: 'PUT', headers: { ...headers, 'If-Match': '"1"' }, body: JSON.stringify(input(price)),
    })));
    expect(competingUpdates.map((result) => result.status).sort()).toEqual([200, 409]);
    const staleUpdate = await fetch(`${invoiceUrl}/${created.id}`, {
      method: 'PUT', headers: { ...headers, 'If-Match': '"1"' }, body: JSON.stringify(input('5000')),
    });
    expect(staleUpdate.status).toBe(409);

    const currentResponse = await fetch(`${invoiceUrl}/${created.id}`, { headers });
    const current = await currentResponse.json() as { version: number; totalInclTax: string; lines: Array<{ unitPrice: string }> };
    expect(['3000', '4000']).toContain(current.totalInclTax);
    expect(current.lines[0]?.unitPrice).toBe(current.totalInclTax);
    const invalidDiscount = await fetch(`${invoiceUrl}/${created.id}`, {
      method: 'PUT', headers: { ...headers, 'If-Match': `"${current.version}"` },
      body: JSON.stringify({ ...input('4000'), lines: [{ ...input('4000').lines[0]!, discount: { type: 'MONTANT_FIXE', value: '4001' } }] }),
    });
    expect(invalidDiscount.status).toBe(422);

    const deleted = await fetch(`${invoiceUrl}/${created.id}`, {
      method: 'DELETE', headers: { ...headers, 'If-Match': `"${current.version}"` },
    });
    expect(deleted.status).toBe(204);
    expect((await fetch(`${invoiceUrl}/${created.id}`, { headers })).status).toBe(404);

    const validUntil = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const quoteResponse = await fetch(`${apiUrl}/quotes`, { method: 'POST', headers, body: JSON.stringify({
      clientId, validUntil, lines: [{ description: 'Prestation convertible', quantityMilli: '1000', unitPrice: '7000', taxRateBasisPts: 0 }],
    }) });
    const quote = await quoteResponse.json() as { id: string; version: number };
    const sent = await fetch(`${apiUrl}/quotes/${quote.id}/send`, { method: 'POST', headers: { ...headers, 'If-Match': `"${quote.version}"` } });
    const sentQuote = await sent.json() as { version: number };
    const accepted = await fetch(`${apiUrl}/quotes/${quote.id}/accept`, {
      method: 'POST', headers: { ...headers, 'If-Match': `"${sentQuote.version}"` },
      body: JSON.stringify({ acceptanceDate: new Date().toISOString().slice(0, 10) }),
    });
    const acceptedQuote = await accepted.json() as { version: number };
    const converted = await fetch(`${apiUrl}/quotes/${quote.id}/convert`, {
      method: 'POST', headers: { ...headers, 'If-Match': `"${acceptedQuote.version}"` },
    });
    expect(converted.status).toBe(201);
    const convertedInvoice = await converted.json() as { id: string; version: number; origin: string };
    expect(convertedInvoice.origin).toBe('DEVIS');

    const deletedConverted = await fetch(`${invoiceUrl}/${convertedInvoice.id}`, {
      method: 'DELETE', headers: { ...headers, 'If-Match': `"${convertedInvoice.version}"` },
    });
    expect(deletedConverted.status).toBe(204);
    const reopenedQuote = await (await fetch(`${apiUrl}/quotes/${quote.id}`, { headers })).json() as { status: string; version: number };
    expect(reopenedQuote.status).toBe('ACCEPTE');
    const reconverted = await fetch(`${apiUrl}/quotes/${quote.id}/convert`, {
      method: 'POST', headers: { ...headers, 'If-Match': `"${reopenedQuote.version}"` },
    });
    expect(reconverted.status).toBe(201);
    expect((await reconverted.json() as { id: string }).id).not.toBe(convertedInvoice.id);
  }, 30_000);

  it('isole les paramètres d’entreprise et fige le logo dans le PDF émis', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const companyUrl = `${apiUrl}/company`;
    const settings = {
      name: 'Atelier Test', address: 'Rue des Artisans, Ouagadougou', phone: '+22670000000',
      email: 'facturation@example.test', taxIdentifiers: { IFU: '00012345' },
      currency: 'XOF', decimals: 0, defaultTaxRateBasisPts: 1_800, timezone: 'Africa/Ouagadougou',
      quotePrefix: 'DEV', invoicePrefix: 'FAC', paymentDelayDays: 15,
      legalMentions: 'Régime simplifié', footerText: 'Merci pour votre confiance.',
      paymentTerms: 'Paiement sous quinze jours.', paymentDetails: { banque: 'Compte test 123' },
    };
    const initial = await fetch(companyUrl, { headers });
    expect(initial.status).toBe(200);
    const missingVersion = await fetch(companyUrl, { method: 'PUT', headers, body: JSON.stringify(settings) });
    expect(missingVersion.status).toBe(428);
    const updated = await fetch(companyUrl, {
      method: 'PUT', headers: { ...headers, 'If-Match': initial.headers.get('etag')! }, body: JSON.stringify(settings),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json() as { address: string; defaultTaxRateBasisPts: number }).address).toBe(settings.address);

    const sharpModule = await import('sharp');
    const logoBytes = await sharpModule.default({
      create: { width: 32, height: 24, channels: 4, background: { r: 10, g: 80, b: 160, alpha: 1 } },
    }).png().toBuffer();
    const logoHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png', 'If-Match': updated.headers.get('etag')! };
    const upload = await fetch(`${companyUrl}/logo`, { method: 'PUT', headers: logoHeaders, body: logoBytes });
    expect(upload.status).toBe(200);
    const uploaded = await upload.json() as { logoHash: string; version: number };
    expect(uploaded.logoHash).toMatch(/^[a-f0-9]{64}$/);
    const logoResponse = await fetch(`${companyUrl}/logo`, { headers: { Authorization: `Bearer ${token}` } });
    expect(logoResponse.status).toBe(200);
    expect(logoResponse.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await logoResponse.arrayBuffer()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const invalidLogo = await fetch(`${companyUrl}/logo`, {
      method: 'PUT', headers: { ...logoHeaders, 'If-Match': `"${uploaded.version}"` }, body: Buffer.from('not an image'),
    });
    expect(invalidLogo.status).toBe(422);
    const otherTenantLogo = await fetch(`${companyUrl}/logo`, { headers: { Authorization: `Bearer ${otherToken}` } });
    expect(otherTenantLogo.status).toBe(404);

    const invoiceResponse = await fetch(`${apiUrl}/invoices`, { method: 'POST', headers, body: JSON.stringify({
      clientId, lines: [{ description: 'Service avec logo', quantityMilli: '1000', unitPrice: '9000', taxRateBasisPts: 1_800 }],
    }) });
    const invoice = await invoiceResponse.json() as { id: string; version: number };
    const issued = await fetch(`${apiUrl}/invoices/${invoice.id}/issue`, {
      method: 'POST', headers: { ...headers, 'If-Match': `"${invoice.version}"` },
    });
    expect(issued.status).toBe(200);
    const issuedInvoice = await issued.json() as { snapshot: { company: Record<string, unknown> } };
    expect(issuedInvoice.snapshot.company).toMatchObject({
      address: settings.address, taxIdentifiers: settings.taxIdentifiers,
      logoHash: uploaded.logoHash, paymentTerms: settings.paymentTerms, footerText: settings.footerText,
    });
    const pdfResponse = await fetch(`${apiUrl}/invoices/${invoice.id}/pdf`, { headers });
    expect(pdfResponse.status).toBe(200);
    const originalPdf = Buffer.from(await pdfResponse.arrayBuffer());
    expect(originalPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(originalPdf.toString('latin1')).toContain('/Subtype /Image');

    const latestSettings = await fetch(companyUrl, { headers });
    const changedSettings = { ...settings, address: 'Nouvelle adresse' };
    const changeAddress = await fetch(companyUrl, {
      method: 'PUT', headers: { ...headers, 'If-Match': latestSettings.headers.get('etag')! },
      body: JSON.stringify(changedSettings),
    });
    expect(changeAddress.status).toBe(200);
    const existingPdf = Buffer.from(await (await fetch(`${apiUrl}/invoices/${invoice.id}/pdf`, { headers })).arrayBuffer());
    expect(existingPdf.equals(originalPdf)).toBe(true);

    const deletedLogo = await fetch(`${companyUrl}/logo`, {
      method: 'DELETE', headers: { ...headers, 'If-Match': changeAddress.headers.get('etag')! },
    });
    expect(deletedLogo.status).toBe(200);
    expect((await fetch(`${companyUrl}/logo`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
  }, 30_000);
});
