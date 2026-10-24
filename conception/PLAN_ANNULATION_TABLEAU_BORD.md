# Plan d'implémentation — annulation de facture et tableau de bord

## Objectif

Terminer la gestion des factures émises non encaissées et donner une synthèse
financière par entreprise, sans stocker de soldes dérivés.

## Étapes

1. Ajouter l'audit d'annulation à la facture : date, utilisateur et motif.
2. Ajouter `POST /invoices/:id/cancel`, avec verrou sur la facture et refus
   lorsque des paiements valides existent.
3. Générer un second PDF marqué « ANNULÉE » depuis l'instantané émis, conserver
   son empreinte et permettre sa réparation/téléchargement séparé; garder le
   PDF original accessible et inchangé.
4. Ajouter `GET /dashboard/summary` : facturé HT, encaissé, impayé, retard et
   devis envoyés encore en attente, filtrés par l'entreprise authentifiée.
5. Prolonger l'intégration PostgreSQL pour annulation, répétition, refus avec
   paiement actif, PDFs et agrégats du tableau de bord.

## Invariants

- Annuler et enregistrer un paiement utilisent le même verrou de ligne.
- Seule une facture émise sans paiement valide peut être annulée.
- L'annulation conserve l'instantané et le PDF originaux; son second PDF porte
  le motif, la date et la mention d'annulation.
- Le tableau de bord calcule le solde depuis les paiements non annulés et ne
  lit que les données de l'entreprise authentifiée.

## État

- [x] Audit et annulation transactionnelle ajoutés
- [x] PDF d'annulation ajouté; le PDF émis reste inchangé et téléchargeable
- [x] Tableau de bord ajouté avec agrégats précis côté PostgreSQL
- [x] Tests unitaires, génération Prisma, validation et TypeScript réussis
- [x] Migration et intégration exécutées sur PostgreSQL 16 éphémère

## Résultat

Le test d'intégration prouve l'isolation des agrégats, le refus d'annuler une
facture portant un paiement valide, l'annulation après marquage des paiements,
la conservation du PDF original, la génération du second PDF et le blocage de
tout nouveau paiement après annulation.
