# Comparaison de la conception v2.0 avec l'implémentation

État constaté le 24 octobre 2026 (mis à jour après durcissement auth §15),
en lisant la conception, le schéma Prisma, les migrations, les routes, les
tests et les scripts présents dans le dépôt.

## Verdict

Le backend couvre le cycle métier principal, les invariants monétaires, les
transitions devis / émission facture, les `CHECK` PostgreSQL et le durcissement
de session §15 (refresh rotatif, CSRF, verrouillage, `mustChangePassword`).
**Le MVP conception est largement couvert côté produit.** Vague A production
faite (restore-drill, audit deps CI, exemple TLS Caddy). Restent surtout :
vague B–D (immuabilité DB, courses, lint, polices PDF) et validations
légales §17. Voir [PLAN_RESTE_MVP_PRODUCTION.md](PLAN_RESTE_MVP_PRODUCTION.md).

Les routes et tests ne valent pas validation de conformité légale (§17).

## Comparaison par domaine

| Domaine de la conception | État dans le dépôt | Comparaison / écart restant |
| --- | --- | --- |
| Argent et calcul (§5) | **Conforme sur le noyau** | `bigint`, milli-unités, points de base, half-up, plus fort reste et calcul partagé. Les propriétés tournent 250 fois; exemples EUR et cinq taux couverts. Le jeu de référence de 100 cas et certains extrêmes du §5.8 ne sont pas tous présents. |
| Numérotation (§6) | **Partiel, concurrence prouvée** | Séquence par entreprise/type/année, fuseau entreprise, attribution transactionnelle. Test d’intégration : 8 envois devis et 6 émissions facture concurrents → numéros uniques sans trou sur l’intervalle. Format actuel sur 5 chiffres (`00001`) vs 4 minimum cités (`0001`) — écart cosmétique. |
| Devis (§7) | **Partiel, transitions alignées** | Brouillon, lignes, calcul, envoi numéroté, PDF avec zone d’acceptation, aperçu brouillon filigrané (non stocké), acceptation bornée, refus (motif facultatif), annulation depuis `ENVOYE`/`ACCEPTE` sans facture. Expiration dérivée ; machine `quote-state` sans action `expire` écrite. **Reste** : valeur enum DB `EXPIRE` legacy (lecture seule / filtre). |
| Factures (§8-10) | **Partiel** | Création manuelle, conversion, édition/suppression des brouillons, émission, annulation conditionnelle, PDF et paiements. **L’émission exige un client actif.** Restent : échéance non modifiable au brouillon ; devise de brouillon manuel figée à la création ; immuabilité des émises par routes seulement (pas de verrou DB). |
| Paiements (§8) | **Conforme sur le flux principal** | Enregistrement idempotent, clé 24 h, verrou `FOR UPDATE`, plafond TTC, annulation par marquage. Course concurrente paiement ↔ annulation de facture prouvée (un seul gagnant cohérent). |
| Entreprise (§2, §11, §14) | **Partiel, fortement avancé** | Paramètres, logo PNG/JPEG ré-encodé, contrôle de version et instantanés PDF présents. La langue et le téléversement objet distant ne le sont pas; le logo reste sur le stockage local. |
| Clients et produits (§2) | **Partiel, isolation couverte** | CRUD, recherche/pagination et archivage. Tests d’isolation GET/PUT/archive + liste cross-tenant (404). Mutations distinguent introuvable (404) et conflit de version (409). Le filtre universel Prisma n’est pas utilisé partout : plusieurs domaines passent encore `companyId` explicite. |
| Tableau de bord (§2, §14) | **Présent, résumé simple** | Sommes facturées, encaissées, impayées, en retard et devis en attente sont calculées par entreprise. Pas de série temporelle ni de filtre de période. |
| PDF (§13) | **Partiel, rendu professionnel avancé** | Snapshot/hash, logo, zone d’acceptation devis, filigrane BROUILLON (aperçu à la demande, jamais stocké), réparation à la lecture + `docs:reconcile-pdf`. Restent : polices embarquées (PDFKit standards). |
| Instantanés et hachages (§11, §13) | **Partiel** | Les instantanés sont sérialisés de façon stable et hashés en SHA-256, mais le tri des clés maison ne garantit pas la canonisation stricte RFC 8785 prévue. Le hash stocké dans la même base détecte les corruptions accidentelles, pas une altération par un acteur ayant accès à la base. |
| Schéma et migrations (§11) | **Partiel** | Sept migrations. Audit devis, CHECK, auth, table `evenement_audit`. Manquent : langue entreprise / notes de devis ; l’idempotence reste portée par `paiement`. |
| Contraintes PostgreSQL (§11) | **Partiel, CHECK + immuabilité UPDATE** | CHECK métier + triggers : montants/identité figés sur devis/facture non brouillon ; lignes INSERT/UPDATE refusés si parent figé. Transitions et PDF autorisés. DELETE SQL non bloqué (API = brouillons seulement). |
| API et erreurs (§14) | **Partiel** | Préfixe `/api/v1`, validations Zod, pagination et réponses `application/problem+json` largement présentes. `GET /health` et `GET /ready` (sonde PostgreSQL, 503 si indisponible). Les détails et codes ne sont pas uniformes; certaines listes n’ont pas recherche/tri. |
| Authentification (§15) | **Conforme sur le noyau session** | Bcrypt 12, JWT 15 min, refresh rotatif, cookies, CSRF, verrouillage, change-password / reset opérateur. En-têtes `nosniff` / `DENY` / CSP API / HSTS (prod) + CORS via `CORS_ORIGIN`. Logs JSON + `X-Request-Id`. Restent : Argon2id (option), HTTPS réel (reverse-proxy), audit npm automatisé bloquant. |
| Autorisation (§3, §15) | **MVP mono-administrateur** | L’inscription crée un administrateur et l’édition des paramètres entreprise vérifie ce rôle. Les autres rôles sont dans l’enum mais aucune matrice ni application générale des permissions n’existe; c’est cohérent avec l’interface MVP mono-rôle prévue, pas avec une ouverture future des rôles. |
| Infrastructure et livraison (§16-18) | **Partiel** | Compose, CI (+ `audit:deps`), runbook, reconcile-pdf, `ops:restore-drill`, exemple TLS (`deploy/Caddyfile`), logs JSON, `evenement_audit`. Manquent : lint unifié, stockage objet distant, TLS réellement déployé (doc seule). |
| Interface (§20) | **MVP présent** | React + parcours e2e Playwright (inscription → devis → facture → paiement → tableau de bord), a11y/responsive de base. Hors scope MVP conception : multi-rôles UI, etc. |
| Validation légale (§17) | **À décider avant production** | Pays cible, mentions locales, obligation de facture normalisée/avoir et conservation légale ne sont pas déterminés ou validés. |

## État des phases du plan (§19)

1. **Phase 0 — Noyau : largement réalisée.** Calcul partagé, états, séquences,
   migrations et PDFs existent. La concurrence de numérotation, le PDF long
   avec contrôle visuel et l’ensemble des cas limites n’ont pas une preuve
   équivalente aux critères de sortie.
2. **Phase 1 — Fondations : largement réalisée.** Inscription, clients,
   produits, paramètres entreprise, isolation routes et sessions renforcées
   (§15) sont présents ; CI et isolation systématique de chaque ressource
   restante restent à faire.
3. **Phase 2 — Devis : parcours + audit transitions réalisés.** Zone
   d’acceptation et `expire` calculé (machine sans écriture) en place ; reste
   l’enum DB `EXPIRE` legacy.
4. **Phase 3 — Factures : parcours principal réalisé.** Client à l’émission,
   CHECK, reconcile-pdf, immuabilité UPDATE et course paiement/annulation en
   place ; reste échéance éditable au brouillon (B4 optionnel).
5. **Phase 4 — Finalisation : partielle.** UI et e2e Playwright livrés ;
   durcissement, restauration, déploiement et essais utilisateurs manquent.

## Priorités recommandées

1. ~~Corriger les invariants métier~~.
2. ~~CHECK PostgreSQL + isolation/numérotation~~.
3. ~~Auth, CSRF, en-têtes, logs, audit~~.
4. ~~Frontend React MVP + e2e~~.
5. ~~Readiness, CI, runbook, reconcile-pdf, finitions PDF~~.
6. **Suite planifiée** : [PLAN_RESTE_MVP_PRODUCTION.md](PLAN_RESTE_MVP_PRODUCTION.md)
   — vagues A–B faites ; enchaîner C→E (lint, RFC 7807, polices PDF,
   checklist légale §17).

Les fonctionnalités hors MVP listées en §2 (avoirs, acomptes, e-mail
automatique, utilisateurs multiples exposés, multi-devises, etc.) ne sont pas
comptées comme des écarts à fermer pour cette version.
