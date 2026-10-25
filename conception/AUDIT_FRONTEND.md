# Audit Frontend — Générateur de Devis & Factures

> Audit réalisé le 2026-10-25.  
> Périmètre : tous les fichiers `.tsx` / `.ts` de `frontend/src/` et les tests e2e Playwright.

---

## Résumé des constats

| Catégorie | Nb |
|---|---|
| Fonctionnalités backend non exposées dans l'UI | 5 |
| Incohérences UX | 6 |
| Bugs / comportements incorrects | 4 |
| Fonctionnalités manquantes (sans backend) | 3 |
| Lacunes de couverture e2e | 7 |

---

## 1. Fonctionnalités backend existantes non exposées dans l'UI

### 1.1 Champ `notes` du devis (priorité haute)

- **Constat** : le backend supporte `Quote.notes` depuis la migration D2 (schéma Prisma, route `draft-routes.ts`, schéma Zod).  
  L'éditeur de devis ([`quote-editor.tsx`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-editor.tsx)) ne propose aucun champ `notes`. Le type [`QuoteFormValues`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-model.ts) ne contient pas `notes`. Le schéma Zod du formulaire ne le valide pas.  
- **Impact** : les notes ne peuvent jamais être saisies ni modifiées depuis l'interface. Le champ existe en base mais reste toujours `null`.  
- **Correction** : ajouter un `<textarea>` "Notes internes" dans la section "Informations du devis" de `quote-editor.tsx` et étendre `formSchema` + `QuoteFormValues`.

### 1.2 Champ `Company.language` (priorité basse)

- **Constat** : `Company.language` a été ajouté au schéma et à la route backend (D2), mais [`company-page.tsx`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/company/company-page.tsx) ni [`company-model.ts`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/company/company-model.ts) ne l'exposent.  
  Le type `CompanySettings` ne contient pas `language`.  
- **Impact** : la langue du document PDF ne peut pas être changée depuis l'interface.  
- **Correction** : ajouter un champ `<select>` (fr / en) dans la section "Devise et fiscalité" ; ajouter `language` à `CompanySettings` et au schéma Zod de `company-page.tsx`.

### 1.3 Accès direct au PDF d'annulation de devis depuis la liste

- **Constat** : la liste des devis ([`quote-page.tsx`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-page.tsx#L59)) affiche un bouton "PDF" pour les devis `ANNULE`, mais ce PDF est celui du devis original. L'API expose `/quotes/:id/cancellation-pdf` (analogue à `/invoices/:id/cancellation-pdf`).  
- **Impact** : l'utilisateur ne peut pas télécharger le document d'annulation du devis depuis l'UI (contrairement aux factures annulées qui ont un bouton "PDF d'annulation").  
- **Correction** : ajouter un bouton "PDF d'annulation" pour `quote.status === 'ANNULE'` dans `quote-page.tsx`.

> [!NOTE]
> À vérifier : la route `/quotes/:id/cancellation-pdf` existe-t-elle côté backend ? Si non, ce point concerne uniquement le backend.

### 1.4 Éditeur de devis : chargement tronqué à 100 clients / 100 produits

- **Constat** : [`quote-editor.tsx` L53-54](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-editor.tsx#L53-L54) charge les clients et produits avec `limit=100` sans pagination ni recherche.  
- **Impact** : si l'entreprise a plus de 100 clients ou 100 produits, les entrées au-delà de la limite n'apparaissent pas dans les menus déroulants de l'éditeur.  
- **Correction** : implémenter une recherche autocomplete (ex. `react-select` avec chargement à la demande) ou augmenter la limite et documenter la contrainte.

### 1.5 Bouton "Changer de mot de passe" absent de la navigation

- **Constat** : la page [`ChangePasswordPage`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/auth/auth-pages.tsx#L89) existe et la route `/changer-mot-de-passe` est déclarée dans [`App.tsx`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/App.tsx#L25). Mais aucun lien n'y pointe depuis l'interface normale (sidebar, profil, paramètres) — la page n'est accessible qu'à la connexion initiale forcée (`mustChangePassword = true`).  
- **Impact** : un utilisateur ne peut pas changer son mot de passe volontairement.  
- **Correction** : ajouter un lien/bouton "Changer de mot de passe" dans [`app-layout.tsx`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/layout/app-layout.tsx) (menu profil) ou dans `company-page.tsx`.

---

## 2. Incohérences UX

### 2.1 Absence de confirmation avant envoi d'un devis

- **Constat** : dans [`quote-page.tsx` L58](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-page.tsx#L58), le bouton "Envoyer" appelle directement `runAction(quote, 'send')` sans boîte de confirmation.  
  À l'inverse, l'émission d'une facture ([`invoice-page.tsx` L39](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/invoices/invoice-page.tsx#L39)) et la conversion d'un devis ([L35](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/invoices/invoice-page.tsx#L35)) utilisent toutes deux `window.confirm`.  
- **Impact** : une action irréversible (le passage BROUILLON → ENVOYE bloque la modification) s'exécute sans confirmation — risque d'erreur.  
- **Correction** : ajouter `window.confirm` ou une modale avant d'appeler `runAction(quote, 'send')`.

### 2.2 Libellé "Administrateur" figé dans le profil sidebar

- **Constat** : [`app-layout.tsx` L30](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/layout/app-layout.tsx#L30) affiche toujours le texte `Administrateur` sous le nom de l'utilisateur, quelle que soit la valeur de `session.role`.  
- **Impact** : si un rôle `COMPTABLE` ou autre est ajouté plus tard, le libellé sera toujours faux.  
- **Correction** : utiliser `session?.role` (avec mapping lisible si nécessaire).

### 2.3 Section "Devis acceptés" toujours visible même si vide

- **Constat** : dans [`invoice-page.tsx` L66-71](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/invoices/invoice-page.tsx#L66-L71), le panneau "Devis acceptés" s'affiche toujours, même lorsqu'il n'y a aucun devis à convertir. Seul le message "Les devis acceptés apparaîtront ici." remplace la liste.  
- **Impact** : encombrement visuel permanent sur la page Factures.  
- **Correction** : masquer la section ou la réduire en accordéon quand `accepted.data.length === 0`.

### 2.4 Bouton "Enregistrer un paiement" désactivé silencieusement quand solde = 0

- **Constat** : [`payment-manager.tsx` L51](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/payments/payment-manager.tsx#L51) désactive le bouton `disabled={list.summary.balance === '0'}` mais n'explique pas pourquoi à l'utilisateur.  
- **Impact** : confusion si l'utilisateur veut ajouter un acompte supplémentaire alors que la facture est entièrement soldée.  
- **Correction** : afficher un message explicatif ("Facture intégralement réglée") à la place du bouton désactivé.

### 2.5 Aucune barre de recherche sur la liste des devis

- **Constat** : les pages Clients ([`client-page.tsx` L9](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/clients/client-page.tsx#L9)) et Produits ([`product-page.tsx` L10](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/products/product-page.tsx#L10)) ont toutes deux une barre de recherche avec debounce 250 ms. La page Devis n'a qu'un filtre par statut, sans recherche par client ou par numéro.  
- **Impact** : incohérence UX ; retrouver un devis précis impose de parcourir les pages.  
- **Correction** : ajouter un champ recherche (par numéro ou par nom de client) dans la toolbar de `quote-page.tsx`, en passant le paramètre `search` à l'API.

### 2.6 Aucune barre de recherche sur la liste des factures

- **Constat** : même constat que 2.5 pour [`invoice-page.tsx`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/invoices/invoice-page.tsx) — seul un filtre par statut est disponible.  
- **Correction** : ajouter un champ recherche par numéro ou client.

---

## 3. Bugs / comportements incorrects

### 3.1 PDF accessible sans jeton d'authentification (navigation directe)

- **Constat** : les PDFs sont ouverts via `window.location.href = /api/v1/quotes/:id/pdf` ([`quote-page.tsx` L58-59](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-page.tsx#L58-L59), [`invoice-page.tsx` L76-77](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/invoices/invoice-page.tsx#L76-L77)). Le navigateur envoie le cookie de session → fonctionne en pratique (cookie HttpOnly + SameSite).  
  Cependant, si l'API requiert le header `X-CSRF-Token` pour les requêtes non-GET (ce n'est pas le cas ici pour GET), la navigation directe ignore le CSRF. Pour une requête GET pur, c'est acceptable.  
- **Statut** : **pas un bug actif** (les PDFs sont des GET), mais à documenter : les liens de téléchargement dépendent du cookie de session ; ils ne fonctionnent pas dans un contexte sans cookie (ex. API publique, token Bearer).

### 3.2 `acceptanceDate` initialisé sans fuseau horaire à l'ouverture de la page

- **Constat** : [`quote-page.tsx` L21](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-page.tsx#L21) initialise `acceptanceDate` avec `todayForTimezone()` (sans argument = UTC par défaut). La valeur corrigée n'est mise à jour qu'après le chargement de `/company` (L27). Si l'utilisateur ouvre la modale d'acceptation avant la fin du chargement de `/company`, la date proposée est en UTC et non dans le fuseau de l'entreprise.  
- **Impact** : risque de date d'acceptation décalée d'un jour pour les entreprises hors UTC (Afrique de l'Ouest = UTC+0 en hiver, pas concerné ; mais UTC+5 ou UTC+8 le seraient).  
- **Correction** : ne pas afficher le bouton "Accepter" tant que `company` n'est pas chargé, ou initialiser `acceptanceDate` dans le callback de chargement uniquement.

### 3.3 `product-page.tsx` — erreur de chargement de devise non bloquante mais silencieuse

- **Constat** : [`product-page.tsx` L14](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/products/product-page.tsx#L14) stocke l'erreur de chargement de `/company` dans `error`, mais le `catch` ne remet pas `loading` à `false` et n'utilise pas `AbortController` pour ce deuxième appel. Si l'appel `/company` échoue après que `/products` a réussi, le produit s'affichera avec la devise par défaut `XOF` / 0 décimales sans que l'utilisateur soit prévenu clairement.  
- **Correction** : unifier les deux appels dans un `Promise.all` avec `AbortController`, ou afficher une alerte visible si `/company` échoue.

### 3.4 Sélection de produit dans l'éditeur ne remet pas à zéro le champ `quantity`

- **Constat** : [`quote-line-editor.tsx` L13-19](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/quotes/quote-line-editor.tsx#L13-L19) — lors de la sélection d'un produit du catalogue, les champs `description`, `unitPrice` et `taxRate` sont mis à jour via `setValue`, mais `quantity` reste inchangée (peut être n'importe quelle valeur saisie précédemment).  
- **Impact** : comportement contre-intuitif si l'utilisateur change de produit après avoir saisi une quantité.  
- **Correction** : ajouter `setValue(\`lines.${index}.quantity\`, '1', { shouldValidate: true })` dans le `onChange`.

---

## 4. Fonctionnalités manquantes (sans équivalent backend identifié)

### 4.1 Tableau de bord — section "Devis en attente" non détaillée

- **Constat** : [`dashboard-page.tsx` L55-58](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/dashboard/dashboard-page.tsx#L55-L58) affiche le nombre de devis en attente (`pendingQuotes`) mais uniquement un lien vers `/devis`. Il n'y a pas de mini-liste des devis proches de leur échéance.  
- **Impact** : l'utilisateur ne voit pas quels devis urgents nécessitent une relance.  
- **Suggestion** : ajouter un appel à `/quotes?status=ENVOYE&limit=5&sortBy=validUntil` pour lister les 5 devis envoyés les plus proches de l'expiration (nécessite probablement un ajout backend de tri).

### 4.2 Absence de gestion multi-utilisateurs visible

- **Constat** : le concept de rôle (`session.role`) est présent dans `auth-context.tsx` et utilisé dans `company-page.tsx` (`isAdmin`), mais il n'existe aucune page d'administration des utilisateurs (inviter un collaborateur, changer son rôle, désactiver un compte).  
- **Impact** : si plusieurs utilisateurs doivent accéder à la même entreprise, il faut passer par la base de données directement.  
- **Suggestion** : page `/equipe` ou section dans Paramètres entreprise (décision à prendre en phase E2 selon le plan de production).

### 4.3 Aucun retour visuel sur l'état "facture en retard" depuis la liste des factures

- **Constat** : le dashboard indique un montant "En retard" (`overdue`), mais la liste des factures ([`invoice-page.tsx`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/src/invoices/invoice-page.tsx)) n'applique aucun badge ni couleur pour signaler visuellement les factures dont l'échéance est dépassée.  
- **Impact** : l'utilisateur ne peut pas identifier rapidement les factures en retard directement dans le tableau.  
- **Suggestion** : comparer `invoice.dueDate` avec la date du jour et appliquer une classe CSS `status-overdue` si dépassée.

---

## 5. Lacunes de couverture des tests e2e

Fichier : [`frontend/e2e/parcours-complet.spec.ts`](file:///home/devalbert/Téléchargements/Generateur-Devis-Facture/frontend/e2e/parcours-complet.spec.ts)

| Scénario | Couvert ? | Commentaire |
|---|---|---|
| Inscription + login + parcours complet (devis → facture → paiement) | ✅ | Testé |
| Navigation mobile (menu bas de page) | ✅ | Testé pour Produits uniquement |
| Refus d'un devis | ❌ | Jamais testé |
| Annulation d'un devis | ❌ | Jamais testé |
| Annulation d'une facture | ❌ | Jamais testé |
| Facture manuelle (sans devis source) | ❌ | Jamais testé |
| Changement de mot de passe | ❌ | Jamais testé |
| Paramètres entreprise (logo, TVA, préfixes) | ❌ | Jamais testé |
| Archivage d'un client | ❌ | Jamais testé |
| Archivage d'un produit | ❌ | Jamais testé |
| Pagination (devis, clients, produits) | ❌ | Jamais testé |
| Annulation d'un paiement (motif) | ❌ | Jamais testé |
| Recherche clients / produits | ❌ | Jamais testé |

---

## 6. Points positifs constatés

Ces éléments fonctionnent correctement et méritent d'être préservés :

- **CSRF** : `http.ts` lit le cookie `csrf_token` et l'envoie en header sur toutes les mutations — implémentation correcte.
- **Idempotence des paiements** : `payment-manager.tsx` génère une `paymentKey` (UUID) par formulaire ouvert — les nouvelles tentatives sont sûres.
- **Gestion du conflit optimiste (409)** : `company-page.tsx` détecte le code 409 et propose un bouton "Recharger" — UX exemplaire.
- **Annulation de requêtes** : `AbortController` utilisé dans tous les `useEffect` de chargement de liste — pas de fuite mémoire.
- **Calcul monétaire** : `format.ts` utilise exclusivement `BigInt` — pas de flottant.
- **Validation Zod côté formulaire** : tous les formulaires utilisent `zodResolver` — pas de validation ad-hoc fragile.
- **Accessibilité de base** : `role="dialog"`, `aria-modal`, `aria-label` présents sur toutes les modales.
- **mustChangePassword** : redirection automatique vers `/changer-mot-de-passe` si le flag est actif — flux fonctionnel.

---

## 7. Plan de correction suggéré

| # | Problème | Effort | Priorité |
|---|---|---|---|
| 1.1 | Champ `notes` devis dans l'UI | Faible | 🔴 Haute |
| 1.5 | Lien "Changer de mot de passe" dans la nav | Très faible | 🔴 Haute |
| 2.1 | Confirmation avant envoi devis | Très faible | 🔴 Haute |
| 3.2 | `acceptanceDate` sans fuseau avant chargement | Faible | 🟠 Moyenne |
| 3.4 | `quantity` non réinitialisée au changement de produit | Très faible | 🟠 Moyenne |
| 2.5 / 2.6 | Recherche devis / factures | Moyen | 🟠 Moyenne |
| 1.3 | Bouton PDF annulation devis | Très faible | 🟠 Moyenne |
| 1.4 | Pagination clients/produits dans l'éditeur | Moyen | 🟡 Basse |
| 2.2 | Libellé rôle figé à "Administrateur" | Très faible | 🟡 Basse |
| 2.3 | Section "Devis acceptés" toujours visible | Faible | 🟡 Basse |
| 2.4 | Bouton paiement désactivé sans explication | Très faible | 🟡 Basse |
| 4.3 | Badge "en retard" dans liste factures | Faible | 🟡 Basse |
| 1.2 | Champ `language` entreprise | Faible | 🟢 Optionnel |
| 4.1 | Mini-liste devis urgents dashboard | Moyen | 🟢 Optionnel |
| 4.2 | Gestion multi-utilisateurs | Élevé | 🟢 Phase E2 |
