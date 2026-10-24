# Comparaison de la conception v2.0 avec l'implémentation

État constaté le 24 octobre 2026 en lisant la conception, le schéma Prisma,
les migrations, les routes, les tests et les scripts présents dans le dépôt.

## Verdict

Le backend couvre le cycle métier principal et ses invariants monétaires,
concurrentiels essentiels. **Il ne réalise pas encore l'application MVP
complète de la conception.** L'écart le plus visible est l'absence totale
d'interface React. Restent aussi des exigences de sécurité, de traçabilité,
de contraintes en base et d'exploitation. Les routes existantes ne valent pas
validation de conformité légale.

## Comparaison par domaine

| Domaine de la conception | État dans le dépôt | Comparaison / écart restant |
| --- | --- | --- |
| Argent et calcul (§5) | **Conforme sur le noyau** | `bigint`, milli-unités, points de base, half-up, plus fort reste et calcul partagé. Les propriétés tournent 250 fois; exemples EUR et cinq taux couverts. Le jeu de référence de 100 cas et certains extrêmes du §5.8 ne sont pas tous présents. |
| Numérotation (§6) | **Partiel** | Séquence par entreprise/type/année et attribution transactionnelle existent pour devis et factures. L'envoi du devis prend l'année UTC plutôt que l'année locale de l'entreprise; aucune intégration ne teste N émissions concurrentes ni l'absence de trous. |
| Devis (§7) | **Partiel** | Brouillon, lignes, calcul, envoi numéroté, PDF, expiration, acceptation, refus, annulation, conversion et suppression cohérente du brouillon converti existent. L'acceptation ne vérifie pas que la date déclarée est postérieure ou égale à la date d'envoi. Refus et annulation ne gardent ni motif, ni horodatage, ni auteur; l'acceptation ne conserve pas l'horodatage de saisie. Pas de zone d'acceptation dans le PDF. |
| Factures (§8-10) | **Partiel** | Création manuelle, conversion, édition/suppression des brouillons, émission, annulation conditionnelle, PDF et paiements sont implémentés. L'émission ne vérifie pas explicitement la présence d'un client; la date d'échéance n'est pas modifiable au brouillon. La devise d'un brouillon manuel est celle de sa création et ne suit pas un changement ultérieur de devise entreprise. Les factures émises restent immuables par les routes, sans verrou d'immuabilité en base. |
| Paiements (§8) | **Conforme sur le flux principal** | Enregistrement idempotent, clé expirant après 24 h, verrou commun sur facture, plafond TTC, annulation par marquage et solde calculé. La concurrence paiement/annulation n'est pas testée dans toutes les combinaisons de la conception. |
| Entreprise (§2, §11, §14) | **Partiel, fortement avancé** | Paramètres, logo PNG/JPEG ré-encodé, contrôle de version et instantanés PDF présents. La langue et le téléversement objet distant ne le sont pas; le logo reste sur le stockage local. |
| Clients et produits (§2) | **Partiel** | CRUD courant, recherche/pagination et archivage disponibles. Les tests d'isolation dédiés à ces deux ressources manquent. Le filtre universel promis par l'extension Prisma n'est pas utilisé par toutes les routes : plusieurs domaines appliquent leur propre `companyId` explicite. |
| Tableau de bord (§2, §14) | **Présent, résumé simple** | Sommes facturées, encaissées, impayées, en retard et devis en attente sont calculées par entreprise. Pas de série temporelle ni de filtre de période. |
| PDF (§13) | **Partiel, rendu professionnel de base** | Snapshot et hash, logo, coordonnées, tableau, remises, TVA par taux, échéance, règlement, mentions, pied de page, pagination et réparation à la lecture. Il manque le PDF de brouillon filigrané; le PDF de devis n'a pas de zone d'acceptation; les polices standards PDFKit ne sont pas remplacées par des polices embarquées. Pas de tâche `reconcile-pdf` ni de journal d'opération. |
| Instantanés et hachages (§11, §13) | **Partiel** | Les instantanés sont sérialisés de façon stable et hashés en SHA-256, mais le tri des clés maison ne garantit pas la canonisation stricte RFC 8785 prévue. Le hash stocké dans la même base détecte les corruptions accidentelles, pas une altération par un acteur ayant accès à la base. |
| Schéma et migrations (§11) | **Partiel** | Modèles métier et trois migrations reproductibles présents. Manquent des colonnes prévues pour changement de mot de passe/verrouillage utilisateur, langue entreprise, notes de devis et audit détaillé de ses transitions. Il n'existe pas de table de refresh tokens ni d'événements d'audit; l'idempotence est portée par `paiement`, pas par une table générique. |
| Contraintes PostgreSQL (§11) | **Insuffisant** | Clés étrangères, uniques et index utiles présents. La seule contrainte `CHECK` métier est celle du taux de TVA par défaut entreprise. Les montants positifs, quantités, taux des lignes/produits, délais et cohérence des dates ne sont pas protégés par des `CHECK`. |
| API et erreurs (§14) | **Partiel** | Préfixe `/api/v1`, validations Zod, pagination et réponses `application/problem+json` largement présentes. Les détails et codes ne sont pas uniformes; certaines listes n'ont pas recherche/tri; `GET /ready` manque. |
| Authentification (§15) | **Socle présent, durcissement incomplet** | Bcrypt coût 12, mot de passe minimal 12, JWT 15 min, cookie HttpOnly/SameSite et inscription atomique. Manquent refresh rotatif, changement/récupération du mot de passe, verrouillage et limitation des tentatives, révocation de session et protection CSRF explicite. `mustChangePassword` existe mais n'est pas appliqué aux routes. |
| Autorisation (§3, §15) | **MVP mono-administrateur** | L'inscription crée un administrateur et l'édition des paramètres entreprise vérifie ce rôle. Les autres rôles sont dans l'enum mais aucune matrice ni application générale des permissions n'existe; c'est cohérent avec l'interface MVP mono-rôle prévue, pas avec une ouverture future des rôles. |
| Infrastructure et livraison (§16-18) | **Partiel / absent** | Compose PostgreSQL et `.env.example` présents. Pas de CI, lint, build, tests Playwright, HTTPS/HSTS/CSP/CORS configurés ici, logs JSON avec corrélation, audit métier, sauvegardes/restauration ni runbook. Le stockage des documents dépend du disque local configuré. |
| Interface (§20) | **Absent** | Aucun frontend React, écran, appel API navigateur ou test bout en bout Playwright dans le dépôt. |
| Validation légale (§17) | **À décider avant production** | Pays cible, mentions locales, obligation de facture normalisée/avoir et conservation légale ne sont pas déterminés ou validés. |

## État des phases du plan (§19)

1. **Phase 0 — Noyau : largement réalisée.** Calcul partagé, états, séquences,
   migrations et PDFs existent. La concurrence de numérotation, le PDF long
   avec contrôle visuel et l'ensemble des cas limites n'ont pas une preuve
   équivalente aux critères de sortie.
2. **Phase 1 — Fondations : partiellement réalisée.** Inscription, clients,
   produits, paramètres entreprise et isolation dans les routes sont présents;
   sessions renforcées, CI et isolation systématique de chaque ressource
   restent à faire.
3. **Phase 2 — Devis : parcours principal réalisé.** Il reste les champs
   d'audit des transitions, la date d'acceptation conforme à l'intervalle
   prévu et les détails du PDF.
4. **Phase 3 — Factures : parcours principal réalisé.** La création manuelle,
   conversion, émission, paiements et annulation sont couverts; validation
   client avant émission, échéance éditable, checks DB et tâche de réparation
   restent à faire.
5. **Phase 4 — Finalisation : non terminée.** Tableau de bord existe, mais
   durcissement, UI, tests bout en bout, restauration, déploiement et essais
   utilisateurs manquent.

## Priorités recommandées

1. Corriger les invariants métier encore non conformes : validation client à
   l'émission, date d'acceptation du devis, année de numérotation dans le fuseau
   entreprise et audit des transitions.
2. Ajouter contraintes `CHECK` PostgreSQL et tests d'isolation/numérotation
   manquants.
3. Compléter l'authentification et les protections web; examiner aussi les
   alertes de dépendances enregistrées dans le bilan d'implémentation.
4. Construire le frontend React MVP et ses tests bout en bout.
5. Préparer l'exploitation : readiness, réparation PDF, audit/logs, sauvegarde
   et restauration, CI et runbook.
6. Fixer le pays et valider les exigences fiscales/comptables avant production.

Les fonctionnalités hors MVP listées en §2 (avoirs, acomptes, e-mail
automatique, utilisateurs multiples exposés, multi-devises, etc.) ne sont pas
comptées comme des écarts à fermer pour cette version.
