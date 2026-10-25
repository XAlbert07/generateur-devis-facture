# Plan — reste MVP technique et préparation production

État de départ : parcours métier MVP livré (auth §15, devis/factures/paiements,
PDF, UI, e2e, CI, `/ready`, runbook, audit, logs). Ce plan couvre **uniquement
les écarts encore ouverts** dans
[COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md](COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md)
et [ETAT_BACKEND_BASE_DE_DONNEES.md](ETAT_BACKEND_BASE_DE_DONNEES.md).

Les items hors MVP (§2 : avoirs, acomptes, e-mail auto, multi-utilisateurs UI,
multi-devises, etc.) restent **hors scope** sauf décision explicite.

## Objectif

Rendre le dépôt **prêt pour une mise en production contrôlée** : durcissement
transport, preuves d’exploitation, polish technique conception, puis
validation légale §17 (décision humaine, pas code seul).

## Ordre recommandé

| Vague | Thème | Priorité | Dépendances |
| --- | --- | --- | --- |
| A | Production minimale (TLS, restauration, dépendances) | Bloquant prod | Aucune |
| B | Intégrité métier / DB (immuabilité, courses, états) | Haut | Aucune |
| C | Qualité API et outillage (erreurs, lint, CI) | Moyen | Aucune |
| D | PDF et schéma finitions | Moyen / bas | Aucune |
| E | Légal §17 et ouverture rôles | Bloquant prod / optionnel | Décision métier |

Estimer **une vague à la fois** ; ne pas ouvrir E avant A.

---

## Vague A — Production minimale

### A1. HTTPS réel (reverse-proxy)

**But.** TLS terminé devant l’API ; cookies `Secure` + HSTS déjà prêts si
`NODE_ENV=production`.

**Livrables**

- Exemple de config (Caddy ou nginx) dans `conception/RUNBOOK.md` ou
  `deploy/`: proxy vers `localhost:3000`, redirection HTTP→HTTPS.
- Documenter `CORS_ORIGIN` en prod (origine HTTPS du frontend).
- Vérifier que le frontend est servi en HTTPS (même origine ou CORS explicite).

**Critère de sortie.** Une requête navigateur en HTTPS atteint `/api/v1/ready`
avec cookie de session `Secure` ; HSTS présent.

### A2. Exercice de restauration automatisé

**But.** Prouver que dump + restore + PDF sur disque récupèrent un état
utilisable (conception §18).

**Livrables**

- Script `backend/scripts/restore-drill.ts` (ou shell) qui :
  1. crée un dump (`pg_dump`) ;
  2. restaure dans une base jetable `*_restore` ;
  3. vérifie `SELECT 1` + présence d’au moins une table métier ;
  4. optionnel : contrôle qu’un PDF référencé existe sous `DOCUMENTS_DIR`.
- Entrée runbook : fréquence recommandée (mensuelle avant prod, puis périodique).
- Option CI : job manuel / nightly (pas bloquant à chaque PR).

**Critère de sortie.** Une commande documentée réussit localement ; journal
JSON ou code de sortie non nul en échec.

### A3. Audit des dépendances

**But.** Conception §15 : audit et mises à jour.

**Livrables**

- Étape CI `npm audit --audit-level=high` (ou `moderate` si le dépôt est propre).
- Politique : fail bloquant sur `high`/`critical` ; exceptions documentées.

**Critère de sortie.** La CI échoue sur vulnérabilité haute sans exception.

---

## Vague B — Intégrité métier et base

### B1. Immuabilité des documents émis / envoyés

**But.** Aujourd’hui l’immuabilité est seulement dans les routes ; un accès
SQL direct peut encore muter.

**Livrables**

- Triggers PostgreSQL (migration) interdisant `UPDATE`/`DELETE` sur
  `devis` / `facture` / lignes lorsque le statut n’est plus brouillon
  (sauf colonnes d’audit PDF / transition explicitement listées).
- Tests d’intégration qui prouvent le rejet SQL.

**Critère de sortie.** Tentative `UPDATE` d’une facture `EMISE` hors colonnes
autorisées → erreur ; routes métier inchangées.

### B2. Course paiement ↔ annulation

**But.** Matrice de concurrence conception §16.

**Livrables**

- Test PostgreSQL : N paiements + 1 annulation concurrente → exactement un
  gagnant cohérent (facture annulée **sans** paiement valide, ou paiements
  acceptés et annulation refusée).
- Ajuster le verrou `FOR UPDATE` si un trou apparaît.

**Critère de sortie.** Test vert et déterministe.

### B3. Alignement `expire` calculé

**But.** Enum DB `EXPIRE` legacy + machine `quote-state` encore « stockée ».

**Livrables**

- Ne plus accepter de transition `expire` écrite ; documentation + tests sur
  `shared/documents/state`.
- Décider : garder la valeur enum en lecture seule historique **ou** migration
  de nettoyage (préférer lecture seule au début).

**Critère de sortie.** Aucun code n’écrit `EXPIRE` ; affichage dérivé seul.

### B4. Échéance éditable au brouillon facture (optionnel métier)

**But.** Écart factures §8–10 : échéance non modifiable au brouillon.

**Livrables**

- Champ `dueDate` optionnel sur `PUT` brouillon manuel ; sinon calcul à
  l’émission depuis `paymentDelayDays`.
- Validation `date_echeance ≥ date_emission` déjà en CHECK.

**Critère de sortie.** Édition possible uniquement en `BROUILLON` ; émise
inchangée.

---

## Vague C — Qualité API et outillage

### C1. Uniformisation RFC 7807

**But.** Même forme `application/problem+json` (title, status, type, errors).

**Livrables**

- Helper unique `problem(response, …)` partagé (déjà partiel) généralisé.
- Revue rapide des routes auth/clients/products/quotes/invoices/payments.
- Test unitaire sur le helper + 1–2 asserts d’intégration.

**Critère de sortie.** Aucune erreur métier en `text/plain` ou JSON ad hoc.

### C2. Lint unifié

**Livrables**

- ESLint (flat config) TypeScript + React pour `backend/`, `frontend/`,
  `shared/` ; script `npm run lint` ; étape CI bloquante.
- Règles minimales (pas de refactor massif dans la même PR).

**Critère de sortie.** `npm run lint` vert en CI.

### C3. Isolation systématique

**But.** Filtre Prisma / `companyId` explicite partout.

**Livrables**

- Inventaire des routes sans test d’isolation ; compléter les manquants
  (paiements, company logo, dashboard si absents).
- Ne pas introduire multi-tenant complexe : garder le pattern actuel.

**Critère de sortie.** Liste des ressources critiques avec au moins un test
cross-tenant.

---

## Vague D — PDF et schéma finitions

### D1. Polices PDF embarquées

**But.** Remplacer Helvetica standard par polices embarquées (UTF-8 fiable).

**Livrables**

- Polices libres (ex. Liberation / Noto) sous `backend/assets/fonts/`.
- `pdf.ts` enregistre et utilise ces polices.
- Test de rendu contenant accents / caractères locaux.

**Critère de sortie.** PDF devis avec accents corrects ; hash stable à
contenu égal.

### D2. Champs schéma secondaires

**Livrables (par ticket séparé)**

- `Company.langue` (défaut `fr`) si l’UI/PDF en a besoin.
- Notes de devis si le parcours UI le demande.

**Critère de sortie.** Migration + lecture/écriture API ; pas de dette Zod.

### D3. Canonisation instantané (RFC 8785)

**But.** Écart hash §11/§13.

**Livrables**

- Aligner `shared/documents/snapshot` sur un canon JSON stable documenté
  (ou dépendance `canonicalize` / JCS) **sans** invalider les PDF déjà
  stockés : migration de re-hash ou double lecture temporaire.
- Tests de régression sur exemples figés.

**Critère de sortie.** Deux objets équivalents → même hash ; procédure de
migration documentée si re-hash nécessaire.

---

## Vague E — Légal et rôles

### E1. Checklist §17 (décision humaine)

**Pas d’implémentation code sans décisions.**

Checklist à remplir (document `conception/CHECKLIST_LEGAL_§17.md` à créer
lors de l’ouverture de la vague) :

1. Pays / zone fiscale cible.
2. Facture normalisée / électronique exigée ?
3. Annulation sans avoir autorisée ?
4. Mentions obligatoires → champs entreprise déjà présents.
5. Durée de conservation.
6. CGU / avertissement « ne remplace pas un conseil comptable ».

**Critère de sortie.** Checklist signée ; écarts éventuels transformés en
tickets (ex. interdire annulation → forcer avoir = hors MVP actuel).

### E2. Matrice de rôles (optionnel, hors MVP UI)

**Uniquement si** ouverture multi-utilisateurs décidée.

**Livrables.** Matrice rôle × action écrite, middleware d’autorisation,
UI d’invitation — **nouveau plan dédié**, pas ce document.

---

## Découpage des PR suggéré

1. `A2` restore-drill + runbook  
2. `A3` npm audit CI  
3. `A1` exemple proxy TLS + doc  
4. `B2` test course paiement/annulation (+ fix si besoin)  
5. `B3` expire calculé  
6. `B1` triggers immuabilité  
7. `C1` problem+json unifié  
8. `C2` lint + CI  
9. `C3` isolation manquante  
10. `D1` polices PDF  
11. `B4` / `D2` / `D3` selon besoin métier  
12. `E1` checklist légale (hors code)

Chaque PR met à jour COMPARAISON / ETAT (cases cochées) et le runbook si
une opération change.

## Hors scope explicite

- Avoirs, acomptes, relances e-mail, multi-devises, stockage S3.
- Multi-rôles UI tant que E2 n’est pas décidé.
- Remplacement bcrypt → Argon2id (option, pas requis pour fermer le MVP).

## Avancement

- [x] Vague A — Production minimale (A1, A2, A3)
  - [x] A1 : `deploy/Caddyfile` + `deploy/README.md` + runbook HTTPS
  - [x] A2 : `npm run ops:restore-drill` (prouvé localement)
  - [x] A3 : `npm run audit:deps` + CI + `AUDIT_EXCEPTIONS.json`
- [x] Vague B — Intégrité (B1, B2, B3 ; B4 optionnel reporté)
  - [x] B2 : test course paiement ↔ annulation (un seul gagnant)
  - [x] B3 : `expire` retiré des transitions écrites (`quote-state`)
  - [x] B1 : triggers UPDATE immuabilité devis/facture/lignes
  - [ ] B4 : échéance éditable au brouillon (optionnel, non fait)
- [x] Vague C — Qualité API / lint / isolation
  - [x] C1 : `problem()` RFC 7807 unifié (helper + gestionnaire global `app.ts`)
  - [x] C2 : `npm run lint` ESLint TypeScript+React (0 erreurs)
  - [x] C3 : isolation cross-tenant systématique (mutations devis/factures/paiements/clients/produits/entreprise)
- [x] Vague D — PDF polices + schéma / canonisation
  - [x] D1 : polices Liberation Sans embarquées dans PDFKit (`backend/assets/fonts/`)
  - [x] D2 : `Company.language` (défaut `fr`) + `Quote.notes` (migration `202610250003`)
  - [x] D3 : tri des clés par codepoint UTF-16 (RFC 8785 / JCS) dans `snapshot.ts`
- [ ] Vague E — Checklist légale (§17) ; rôles si décidé
  - [x] E1 : `conception/CHECKLIST_LEGAL_§17.md` créée — décision humaine requise
  - [ ] E2 : matrice de rôles (optionnel, uniquement si multi-utilisateurs décidé)

## Prochaine action concrète

Enchaîner sur la **vague E** : E1 (checklist légale §17) — décision humaine requise avant code.
