/**
 * Remplit un espace d'essai avec des données fictives réalistes (montants en F CFA).
 *
 * Le remplissage passe par l'API du serveur lui-même, avec le jeton de l'espace : numérotation,
 * calculs, PDF, immuabilité et audit suivent exactement la logique de production, sans la dupliquer.
 * Aucune donnée n'est personnelle : noms, adresses et identifiants sont fictifs.
 */
type Json = Record<string, unknown>;
type Call = <T = Json>(method: string, path: string, options?: { body?: unknown; headers?: Record<string, string> }) => Promise<T>;

interface Versioned { id: string; version: number }
interface LineInput { description: string; quantity: number; unitPrice: number }

const TAX_RATE_BASIS_PTS = 1_800;

function apiClient(baseUrl: string, accessToken: string): Call {
  return async <T>(method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Remplissage de l'espace d'essai : ${method} ${path} a répondu ${response.status}`);
    return await response.json() as T;
  };
}

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });

function toLines(lines: LineInput[]) {
  return lines.map((line) => ({
    description: line.description,
    quantityMilli: String(Math.round(line.quantity * 1_000)),
    unitPrice: String(line.unitPrice),
    taxRateBasisPts: TAX_RATE_BASIS_PTS,
  }));
}

const catalogue = {
  logo: { name: 'Création de logo', description: 'Trois pistes graphiques, une retenue et déclinée.', unit: 'forfait', unitPrice: 150_000 },
  charte: { name: 'Charte graphique complète', description: 'Couleurs, typographies, usages et gabarits.', unit: 'forfait', unitPrice: 450_000 },
  site: { name: 'Site vitrine (5 pages)', description: 'Conception, intégration et mise en ligne.', unit: 'forfait', unitPrice: 600_000 },
  maintenance: { name: 'Maintenance mensuelle', description: 'Mises à jour, sauvegardes et suivi.', unit: 'mois', unitPrice: 50_000 },
  photo: { name: 'Photographie de produit', description: 'Prise de vue et retouches, fond uni.', unit: 'photo', unitPrice: 25_000 },
} as const;

type CatalogKey = keyof typeof catalogue;
const lineOf = (key: CatalogKey, quantity = 1): LineInput => ({ description: catalogue[key].name, quantity, unitPrice: catalogue[key].unitPrice });

async function configureCompany(call: Call): Promise<void> {
  const current = await call<{ version: number }>('GET', '/company');
  await call('PUT', '/company', {
    headers: ifMatch(current.version),
    body: {
      name: 'Studio Aurore Communication',
      address: '12 avenue du Commerce, zone commerciale',
      phone: '70 12 34 56',
      email: 'contact@studio-aurore.example',
      taxIdentifiers: { IFU: '1234567A', RCCM: 'RC-2024-B-0001' },
      currency: 'XOF',
      decimals: 0,
      defaultTaxRateBasisPts: TAX_RATE_BASIS_PTS,
      timezone: 'Africa/Abidjan',
      quotePrefix: 'DEV',
      invoicePrefix: 'FAC',
      paymentDelayDays: 30,
      legalMentions: 'Espace de démonstration : les documents générés ici sont fictifs et n’ont aucune valeur légale.',
      footerText: 'Merci pour votre confiance.',
      paymentTerms: 'Paiement à 30 jours par virement ou mobile money.',
      paymentDetails: { Banque: 'Banque Exemple', IBAN: 'XX00 0000 0000 0000 0000' },
      language: 'fr',
    },
  });
}

async function createClients(call: Call) {
  const create = (body: Json) => call<Versioned>('POST', '/clients', { body });
  return {
    boulangerie: await create({ name: 'Boulangerie Le Fournil', email: 'commandes@lefournil.example', phone: '70 11 22 33', address: '8 rue du Marché', taxIdentifier: 'IFU 0012345A' }),
    cabinet: await create({ name: 'Cabinet Diallo & Associés', email: 'secretariat@diallo-associes.example', phone: '70 22 33 44', address: '25 boulevard des Affaires, 3e étage', taxIdentifier: 'IFU 0067890B' }),
    association: await create({ name: 'Association Horizon Solidaire', email: 'contact@horizon-solidaire.example', phone: '70 33 44 55', address: 'Maison des associations, salle 4' }),
    particulier: await create({ name: 'Fatou Traoré', email: 'fatou.traore@exemple.example', phone: '70 44 55 66' }),
  };
}

async function createProducts(call: Call): Promise<void> {
  for (const product of Object.values(catalogue)) {
    await call('POST', '/products', {
      body: { name: product.name, description: product.description, unit: product.unit, unitPrice: String(product.unitPrice), taxRateBasisPts: TAX_RATE_BASIS_PTS },
    });
  }
}

export async function seedSandboxData(baseUrl: string, accessToken: string): Promise<void> {
  const call = apiClient(baseUrl, accessToken);
  const today = isoDate(0);

  await configureCompany(call);
  const clients = await createClients(call);
  await createProducts(call);

  const draftQuote = (clientId: string, lines: LineInput[], validInDays: number, notes?: string) =>
    call<Versioned>('POST', '/quotes', { body: { clientId, validUntil: isoDate(validInDays), lines: toLines(lines), ...(notes ? { notes } : {}) } });
  const sendQuote = (quote: Versioned) => call<Versioned & { number: string }>('POST', `/quotes/${quote.id}/send`, { headers: ifMatch(quote.version) });
  const acceptQuote = (quote: Versioned) => call<Versioned>('POST', `/quotes/${quote.id}/accept`, { headers: ifMatch(quote.version), body: { acceptanceDate: today } });
  const convertQuote = (quote: Versioned) => call<Versioned>('POST', `/quotes/${quote.id}/convert`, { headers: ifMatch(quote.version) });
  const issueInvoice = (invoice: Versioned) => call<Versioned & { totalInclTax: string }>('POST', `/invoices/${invoice.id}/issue`, { headers: ifMatch(invoice.version) });
  const pay = (invoiceId: string, amount: bigint, method: string, reference?: string) =>
    call('POST', `/invoices/${invoiceId}/payments`, {
      headers: { 'Idempotency-Key': `essai-${invoiceId}-${method}` },
      body: { amount: amount.toString(), paymentDate: today, method, ...(reference ? { reference } : {}) },
    });

  // A. Devis accepté, facturé et entièrement payé.
  const quoteA = await acceptQuote(await sendQuote(await draftQuote(clients.boulangerie.id, [lineOf('logo'), lineOf('charte')], 30, 'Livraison des fichiers sources incluse.')));
  const invoiceA = await issueInvoice(await convertQuote(quoteA));
  await pay(invoiceA.id, BigInt(invoiceA.totalInclTax), 'VIREMENT', 'VIR-2026-0412');

  // B. Devis accepté, facturé, acompte de 40 % reçu.
  const quoteB = await acceptQuote(await sendQuote(await draftQuote(clients.cabinet.id, [lineOf('site'), lineOf('maintenance', 3)], 30)));
  const invoiceB = await issueInvoice(await convertQuote(quoteB));
  await pay(invoiceB.id, BigInt(invoiceB.totalInclTax) * 40n / 100n, 'MOBILE_MONEY', 'OM-88231');

  // C. Devis accepté dont la facture reste à émettre (brouillon).
  const quoteC = await acceptQuote(await sendQuote(await draftQuote(clients.association.id, [lineOf('photo', 20)], 20)));
  await convertQuote(quoteC);

  // D. Devis envoyé, en attente de réponse.
  await sendQuote(await draftQuote(clients.cabinet.id, [lineOf('charte')], 15));

  // E. Devis refusé par le client.
  const quoteE = await sendQuote(await draftQuote(clients.boulangerie.id, [lineOf('maintenance', 6)], 10));
  await call('POST', `/quotes/${quoteE.id}/refuse`, { headers: ifMatch(quoteE.version), body: { reason: 'Budget insuffisant ce trimestre.' } });

  // F. Devis encore en préparation.
  await draftQuote(clients.particulier.id, [lineOf('logo')], 30);
}
