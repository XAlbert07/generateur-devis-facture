# État du backend et de la base de données

Audit du checkout au 24 octobre 2026, comparé à la conception v2.0 et aux
routes, modèles Prisma, migrations et tests présents.

## Verdict

Le backend couvre maintenant le parcours devis → facture → paiements, les
factures manuelles, les paramètres d'entreprise et les PDF avec logo. Trois
migrations ont été appliquées dans des intégrations PostgreSQL 16 éphémères.

**Le backend et la base ne sont pas terminés au regard du MVP de conception.**
Les écarts détaillés, dont l'absence du frontend, les protections de session,
les validations métier et les tâches d'exploitation, sont comparés point par
point dans [COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md](COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md).

## Déjà présent

- Inscription atomique utilisateur/entreprise/appartenance, connexion, lecture
  de session et déconnexion par cookie; mots de passe hachés.
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
- [ ] Vérifier que les champs des devis acceptés/refusés/annulés (date,
  horodatage, auteur et motif pertinents) sont persistés selon le besoin
  d'audit; plusieurs champs prévus par le modèle de conception sont absents.

### Priorité 2 — schéma et sécurité

- [x] Étendre `Company` aux coordonnées et réglages utilisés par les documents,
  avec logo et migrations. Le champ `langue` de la conception n'est pas encore
  présent.
- [ ] Décider et implémenter la session prévue : refresh token rotatif et
  révocable, changement de mot de passe, limitation/verrouillage des essais,
  protection CSRF adaptée aux cookies. Actuellement, l'API n'expose que
  register/login/me/logout.
- [ ] Appliquer une politique d'autorisation aux rôles si plusieurs rôles
  sont activés. Pour l'instant les quatre rôles existent dans le schéma, mais
  la conception MVP expose seulement l'administrateur.
- [ ] Ajouter les contraintes SQL `CHECK` métier prévues (montant positif,
  quantité positive, taux borné, dates cohérentes) et les tests qui prouvent
  qu'elles sont appliquées par PostgreSQL.
- [ ] Ajouter une vérification systématique d'isolation et d'accès interdit
  sur chaque ressource et mutation, pas uniquement le parcours principal.

### Priorité 3 — exploitation et finitions

- [ ] Ajouter `/ready` avec contrôle de dépendance PostgreSQL et une tâche ou
  commande de réparation des PDF manquants/corrompus avec journal d'opération.
- [ ] Ajouter audit métier, journalisation structurée/corrélée, politique de
  sauvegarde et exercice de restauration; fournir `.env.example` et un
  runbook minimal.
- [ ] Vérifier le format d'erreurs RFC 7807, les codes et validations sur
  toutes les routes; certains comportements restent propres à chaque route.
- [ ] Étendre les tests de concurrence aux numéros de devis/factures et aux
  courses paiement/annulation; le test PostgreSQL actuel couvre conversion
  concurrente et paiements concurrents, mais pas toute la matrice de la
  conception.

## Séquence recommandée

1. **Conformité métier** : valider le client à l'émission, corriger la date
   d'acceptation et l'année de numérotation au fuseau de l'entreprise, compléter
   l'audit des transitions de devis.
2. **Sécurité et schéma** : sessions, limitation des tentatives, contraintes
   PostgreSQL, autorisations et tests d'isolation systématiques.
3. **Interface et exploitation** : frontend MVP, readiness, réparation PDF,
   audit/logs, CI, sauvegarde/restauration et runbook.

Les exigences fiscales et la règle légale d'annulation restent à valider pour
le pays cible avant une mise en production; ce point ne peut pas être déduit
du schéma ou des tests locaux.
