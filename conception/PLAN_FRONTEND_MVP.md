# Plan d'implémentation — frontend MVP

## Objectif

Construire l'interface web React/TypeScript prévue par la conception et la
relier à l'API existante sans dupliquer ses règles métier.

## Étapes

1. **Socle et session** — Vite/React/TypeScript, React Router, proxy local vers
   l'API, formulaires Zod/React Hook Form, connexion/inscription, routes
   protégées et déconnexion par cookie.
2. **Accueil connecté** — tableau de bord réel, formats monétaires entiers,
   navigation adaptable et états de chargement/erreur/absence de données.
3. **Données métier** — clients et produits, puis devis et cycle d'acceptation;
   formulaires avec totaux issus de `shared/money` lorsque le bundle partagé
   navigateur est prêt.
4. **Facturation** — brouillons manuels, conversion, émission, téléchargement
   des PDF, paiements avec clé d'idempotence, annulation et réglages entreprise.
5. **Finition** — responsive tablette/téléphone, accessibilité, tests
   navigateur de bout en bout et revue du parcours complet.

## Invariants

- Le cookie de session reste HttpOnly; aucun JWT n'est copié en localStorage.
- Le frontend utilise les routes API; l'aperçu appelle le même calculateur
  partagé que le serveur, qui recalcule les totaux à l'enregistrement.
- Les montants sont conservés en chaînes entières et formatés sans flottants.
- Les routes métier restent protégées et l'entreprise active vient de la
  session serveur.

## Conformité au document de conception v2.0

- La pile retenue est respectée : React, TypeScript, React Router, React Hook
  Form, Zod et une couche dédiée pour les appels API (`src/api/`).
- L'interface est organisée par domaines (`auth/`, `clients/`, `products/`,
  `quotes/`, `invoices/`, `dashboard/`) et les écrans de listes s'adaptent aux
  petits écrans.
- Les prix restent des chaînes d'entiers en unité monétaire minimale; leur
  conversion/formatage passe par `bigint`, sans calcul monétaire en flottant.
- L'éditeur de devis appelle le calculateur partagé `shared/money` directement
  compilé par Vite pour le navigateur; les totaux restent calculés en `bigint`.
- Les paiements utilisent la clé `Idempotency-Key` générée à l'ouverture du
  formulaire et gardée pendant les nouvelles tentatives; l'annulation reste
  traçable dans l'historique.
- Les écrans de clients et produits emploient les routes réellement disponibles
  (`{ data, meta }`, pagination, archivage, `If-Match`).

## Avancement

- [x] Étape 1 : socle React et session (connexion, inscription, routes privées).
- [x] Étape 2 : tableau de bord (API, montants exacts, navigation responsive).
- [x] Étape 3 : clients, produits et devis (brouillon, catalogue, calcul partagé,
  envoi, acceptation datée, refus, annulation et PDF).
- [x] Première partie de l'étape 4 : conversion d'un devis accepté, brouillon
  manuel, émission et téléchargement du PDF.
- [x] Paiements : création idempotente, solde calculé et annulation traçable.
- [x] Annulation de facture avec motif; paiement valide bloquant vérifié par
  l'interface et appliqué de nouveau par le serveur.
- [x] Réglages entreprise : coordonnées, identifiants fiscaux, devise/taxes,
  numérotation, paiement, mentions PDF et logo avec contrôle de version.
- [x] Étape 5 : tests navigateur de bout en bout, accessibilité et revue complète.
