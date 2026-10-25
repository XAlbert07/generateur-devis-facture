import { expect, test, type Page } from '@playwright/test';

const stamp = Date.now();
const account = {
  name: 'Awa Kaboré',
  companyName: `Atelier E2E ${stamp}`,
  email: `e2e-${stamp}@example.com`,
  password: 'mot-de-passe-e2e-12',
};
const clientName = `Client E2E ${stamp}`;
const productName = `Prestation E2E ${stamp}`;
const productPrice = '25000';

async function fillLabeled(page: Page, label: string | RegExp, value: string) {
  await page.getByLabel(label).fill(value);
}

/** Lien de la nav principale (évite la marque « Devis & factures »). */
async function goNav(page: Page, name: string | RegExp) {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' }).first();
  await nav.getByRole('link', { name, exact: typeof name === 'string' }).click();
}

test.describe.configure({ mode: 'serial' });

test('parcours inscription → devis → facture → paiement → tableau de bord', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Créer votre espace.' })).toBeVisible();

  await fillLabeled(page, 'Votre nom', account.name);
  await fillLabeled(page, /Nom de l.entreprise/, account.companyName);
  await fillLabeled(page, 'Adresse e-mail', account.email);
  await fillLabeled(page, 'Mot de passe', account.password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page.getByRole('heading', { name: /Bonjour,/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).first()).toBeVisible();

  await goNav(page, 'Clients');
  await page.getByRole('button', { name: '＋ Nouveau client' }).click();
  await expect(page.getByRole('dialog', { name: 'Nouveau client' })).toBeVisible();
  await fillLabeled(page, 'Nom ou raison sociale', clientName);
  await fillLabeled(page, 'Adresse e-mail', `client-${stamp}@example.com`);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: clientName })).toBeVisible();

  await goNav(page, 'Produits & services');
  await page.getByRole('button', { name: '＋ Nouveau produit' }).click();
  await expect(page.getByRole('dialog', { name: 'Nouveau produit ou service' })).toBeVisible();
  await fillLabeled(page, 'Nom', productName);
  await fillLabeled(page, /Prix unitaire/, productPrice);
  await fillLabeled(page, 'Unité', 'forfait');
  await fillLabeled(page, /Taux de taxe/, '0');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(productName)).toBeVisible();

  await goNav(page, 'Devis');
  await page.getByRole('button', { name: '＋ Nouveau devis' }).click();
  await expect(page.getByRole('heading', { name: 'Créer un devis' })).toBeVisible();
  await page.getByLabel('Client').selectOption({ label: clientName });
  await page.getByLabel('Reprendre du catalogue').selectOption({ label: productName });
  await expect(page.getByLabel('Désignation')).not.toHaveValue('');
  await expect(page.getByLabel(/Prix unitaire/)).not.toHaveValue('');
  const saveQuote = page.getByRole('button', { name: 'Enregistrer le brouillon' });
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/v1/quotes') && response.request().method() === 'POST' && response.ok()),
    saveQuote.click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Devis', exact: true })).toBeVisible();
  const quoteRow = page.locator('tr', { hasText: clientName }).first();
  await expect(quoteRow.getByText('Brouillon', { exact: true })).toBeVisible();
  const quoteSearch = page.getByRole('textbox', { name: 'Rechercher un devis' });
  await quoteSearch.fill(clientName);
  await expect(page.getByText('1 devis', { exact: true })).toBeVisible();
  await quoteSearch.fill('');
  await expect(quoteRow.getByText('Brouillon', { exact: true })).toBeVisible();

  await quoteRow.getByRole('button', { name: 'Envoyer' }).click();
  await expect(quoteRow.getByText('Envoyé', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(quoteRow.getByRole('button', { name: 'PDF' })).toBeVisible();

  await quoteRow.getByRole('button', { name: 'Accepter' }).click();
  await expect(page.getByRole('dialog', { name: 'Enregistrer l’accord du client' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmer l’acceptation' }).click();
  await expect(quoteRow.getByText('Accepté', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: '＋ Nouveau devis' }).click();
  await page.getByLabel('Client').selectOption({ label: clientName });
  await page.getByLabel('Reprendre du catalogue').selectOption({ label: productName });
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByRole('heading', { name: 'Devis', exact: true })).toBeVisible();
  const cancellationRow = page.locator('tr', { hasText: clientName }).first();
  await expect(cancellationRow.getByText('Brouillon', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await cancellationRow.getByRole('button', { name: 'Envoyer' }).click();
  await expect(cancellationRow.getByText('Envoyé', { exact: true })).toBeVisible({ timeout: 20_000 });
  await cancellationRow.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByLabel('Motif', { exact: true }).fill('Erreur de saisie');
  await page.getByRole('button', { name: 'Confirmer l’annulation' }).click();
  await expect(cancellationRow.getByText('Annulé', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(cancellationRow.getByRole('button', { name: 'PDF d’annulation' })).toBeVisible();

  await goNav(page, 'Factures');
  await expect(page.getByRole('heading', { name: 'Factures', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Devis acceptés' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Créer la facture' }).click();
  await expect(page.getByText('Brouillon sans numéro')).toBeVisible({ timeout: 20_000 });

  const invoiceRow = page.locator('tr', { hasText: clientName }).first();
  page.once('dialog', (dialog) => dialog.accept());
  await invoiceRow.getByRole('button', { name: 'Émettre' }).click();
  await expect(invoiceRow.getByText('Émise', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(invoiceRow.getByRole('button', { name: 'PDF' })).toBeVisible();
  await expect(invoiceRow.getByRole('button', { name: 'Paiements' })).toBeVisible();
  const invoiceSearch = page.getByRole('textbox', { name: 'Rechercher une facture' });
  await invoiceSearch.fill(clientName);
  await expect(page.getByText('1 facture(s)', { exact: true })).toBeVisible();
  await invoiceSearch.fill('');
  await expect(invoiceRow.getByRole('button', { name: 'Paiements' })).toBeVisible();

  await invoiceRow.getByRole('button', { name: 'Paiements' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '＋ Enregistrer un paiement' }).click();
  await fillLabeled(page, /Montant/, productPrice);
  await page.getByRole('button', { name: 'Enregistrer le paiement' }).click();
  await expect(page.getByText('Payée', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Aucun paiement enregistré.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await goNav(page, 'Vue d’ensemble');
  await expect(page.getByRole('heading', { name: /Bonjour,/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Indicateurs financiers' })).toBeVisible();
  await expect(page.getByText('1 facture(s) émise(s)')).toBeVisible();
  await expect(page.getByRole('article', { name: /Facturé HT : 25[\s\u00a0\u202f]?000 XOF/ })).toBeVisible();
  await expect(page.getByRole('article', { name: /Encaissé : 25[\s\u00a0\u202f]?000 XOF/ })).toBeVisible();
});

test('l’éditeur permet de parcourir le catalogue au-delà des 100 premiers éléments', async ({ page }) => {
  await page.goto('/login');
  await fillLabeled(page, 'Adresse e-mail', account.email);
  await fillLabeled(page, 'Mot de passe', account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: /Bonjour,/ })).toBeVisible();

  const clientIds = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101'];
  const productIds = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000102'];
  await page.route('**/api/v1/clients**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!requestUrl.searchParams.has('page')) return route.continue();
    const currentPage = Number(requestUrl.searchParams.get('page'));
    await route.fulfill({ json: { data: [{ id: clientIds[currentPage - 1], name: `Client page ${currentPage}` }], meta: { totalPages: 2 } } });
  });
  await page.route('**/api/v1/products**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!requestUrl.searchParams.has('page')) return route.continue();
    const currentPage = Number(requestUrl.searchParams.get('page'));
    await route.fulfill({ json: { data: [{ id: productIds[currentPage - 1], name: `Produit page ${currentPage}`, description: null, unitPrice: '1000', unit: 'unité', taxRateBasisPts: 0 }], meta: { totalPages: 2 } } });
  });

  await goNav(page, 'Devis');
  await page.getByRole('button', { name: '＋ Nouveau devis' }).click();
  await page.getByLabel('Client').selectOption(clientIds[0]!);
  await page.getByRole('navigation', { name: 'Pages de clients dans le formulaire' }).getByRole('button', { name: '→' }).click();
  await expect(page.getByRole('navigation', { name: 'Pages de clients dans le formulaire' })).toContainText('Page 2 sur 2');
  await expect(page.getByLabel('Client')).toHaveValue(clientIds[0]!);
  await expect(page.getByRole('option', { name: 'Client page 2' })).toBeAttached();

  await page.getByLabel('Reprendre du catalogue').selectOption(productIds[0]!);
  await page.getByRole('navigation', { name: 'Pages du catalogue' }).getByRole('button', { name: '→' }).click();
  await expect(page.getByRole('navigation', { name: 'Pages du catalogue' })).toContainText('Page 2 sur 2');
  await expect(page.getByLabel('Reprendre du catalogue')).toHaveValue(productIds[0]!);
  await expect(page.getByRole('option', { name: 'Produit page 2' })).toBeAttached();
});

test('navigation mobile expose le catalogue et reste utilisable au clavier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await fillLabeled(page, 'Adresse e-mail', account.email);
  await fillLabeled(page, 'Mot de passe', account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: /Bonjour,/ })).toBeVisible();

  const mobileNav = page.locator('nav.mobile-nav');
  await expect(mobileNav.getByRole('link', { name: 'Produits', exact: true })).toBeVisible();
  await mobileNav.getByRole('link', { name: 'Produits', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Produits & services' })).toBeVisible();
  await expect(page.getByText(productName)).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
