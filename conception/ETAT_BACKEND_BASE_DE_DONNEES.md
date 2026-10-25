# État du backend et de la base de données

Audit du checkout au 24 octobre 2026, comparé à la conception v2.0 et aux
routes, modèles Prisma, migrations et tests présents.

## Verdict

Le backend couvre le parcours devis → facture → paiements, les factures
manuelles, les paramètres d'entreprise, les PDF avec logo et le durcissement
auth §15. Six migrations sont reproductibles (audit devis, CHECK, auth).

**Le backend et la base couvrent l’essentiel du MVP technique.** Restent
surtout l’exercice de restauration automatisé, HTTPS devant le proxy, et les
validations légales §17. Détail dans
[COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md](COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md).

## Déjà présent

- Inscription atomique utilisateur/entreprise/appartenance, connexion, refresh
  rotatif, lecture de session, déconnexion, changement de mot de passe ;
  cookies + CSRF ; verrouillage après échecs ; script opérateur
  `reset-password` avec `mustChangePassword` appliqué côté serveur.
- Clients et produits : liste paginée/recherche, création, modification
  optimiste par `If-Match`, archivage.
- Devis : brouillon, calcul partagé, envoi et numéro, PDF figé, expiration,
  acceptation, refus, annulation et conversion atomique/idempotente.
- Factures issues d'un devis : liste/détail, émission et numérotation, échéance,
  instantané/PDF vérifiable; annulation auditée si aucun paiement valide.
- Paiements : création idempotente, contrôle de solde sous verrou, annulation
  par marquage, résumé calculé.
- Tableau de bord isolé par entreprise; modèles pour entreprise, membres,
  clients, produits, devis, factures, lignes, paiements et séquences.
- Filtrage par entreprise dans les routes et tests d'intégration PostgreSQL
  observant la séparation entre deux entreprises.

## Écarts à fermer pour le MVP

### Priorité 1 — complétude métier

- [x] Factures manuelles : routes de création, modification et suppression du
  brouillon, lignes, calcul partagé, migration de remise et intégration
  PostgreSQL.
- [x] Paramètres d'entreprise : `GET/PUT /company`, coordonnées, mentions,
  conditions et informations de règlement, version et contrôle administrateur.
- [x] PDF alimenté par l'instantané : coordonnées, échéance, conditions,
  règlement, mentions, ventilation TVA et répétition de l'en-tête.
- [x] Téléversement sécurisé du logo (PNG/JPEG, taille limitée et ré-encodage)
  et insertion dans les PDF; le test PostgreSQL confirme l'immuabilité du PDF.
- [x] Audit des transitions devis : `accepte_saisi_le`, motif/horodatage de
  refus, motif/auteur/horodatage d'annulation; date d'acceptation bornée par
  l'envoi et la validité; client obligatoire à l'émission; année de
  numérotation devis/facture au fuseau entreprise.

### Priorité 2 — schéma et sécurité

- [x] Étendre `Company` aux coordonnées et réglages utilisés par les documents,
  avec logo et migrations. Le champ `langue` de la conception n'est pas encore
  présent.
- [x] Session §15 : refresh rotatif/révocable (réutilisation → lignée),
  `POST /auth/change-password`, limitation/verrouillage des essais,
  CSRF double-soumission, routes register/login/refresh/me/logout/
  change-password + script `reset-password`.
- [ ] Appliquer une politique d'autorisation aux rôles si plusieurs rôles
  sont activés. Pour l'instant les quatre rôles existent dans le schéma, mais
  la conception MVP expose seulement l'administrateur.
- [x] Contraintes SQL `CHECK` métier (montant, quantité, taux, prix, échéance,
  délai) + tests PostgreSQL qui prouvent le rejet.
- [x] Isolation clients/produits (GET/PUT/archive/liste) et numérotation
  concurrente devis/factures sans trou ; reste à généraliser sur toutes les
  mutations restantes si de nouvelles ressources apparaissent.

### Priorité 3 — exploitation et finitions

- [x] `GET /ready` avec contrôle PostgreSQL (`SELECT 1`, 503 si échec) ;
  CI GitHub Actions (migrate + typecheck + unitaires + intégration) ;
  runbook minimal (`conception/RUNBOOK.md` : santé, reset-password, dump/restore,
  reconcile-pdf).
- [x] Commande `npm run docs:reconcile-pdf` : régénère PDF devis/factures/
  annulations manquants ou corrompus ; journal JSON par opération sur stdout.
- [x] Audit métier (`evenement_audit`) + logs JSON avec `X-Request-Id` ;
  en-têtes sécurité / CORS ; PDF brouillon filigrané et zone d’acceptation.
- [x] Exercice de restauration automatisé : `npm run ops:restore-drill`
  (dump → base jetable → verify tables → drop) + doc TLS (`deploy/`) +
  `npm run audit:deps` (allowlist datée dans `AUDIT_EXCEPTIONS.json`).
- [x] Vérifier le format d'erreurs RFC 7807, les codes et validations sur
  toutes les routes; helper `problem()` unifié et gestionnaire global `app.ts`
  en `application/problem+json`. Tests d'isolation cross-tenant sur toutes les
  mutations (devis, factures, paiements, clients, produits, entreprise).
- [x] Course paiement ↔ annulation de facture + triggers d’immuabilité UPDATE
  (montants/lignes figés hors brouillon) ; `expire` plus écrit dans
  `quote-state`.

## Séquence recommandée

1. **Conformité métier** : faite.
2. **Sécurité et schéma** : sessions et CHECK faits.
3. **Exploitation de base** : readiness/CI/runbook/reconcile-pdf/logs/audit faits.
4. **Reste jusqu’à production** : suivre
   [PLAN_RESTE_MVP_PRODUCTION.md](PLAN_RESTE_MVP_PRODUCTION.md)
   (vagues A–B faites ; vague C ensuite : erreurs/lint/isolation ;
   E = checklist légale §17).

Les exigences fiscales et la règle légale d'annulation restent à valider pour
le pays cible avant une mise en production; ce point ne peut pas être déduit
du schéma ou des tests locaux.
