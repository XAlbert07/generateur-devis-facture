# Plan d'implémentation — factures manuelles

## Objectif

Créer et modifier une facture brouillon sans devis, puis supprimer un brouillon
de façon cohérente avec son devis source éventuel.

## Réalisé

- [x] `POST /api/v1/invoices` crée une facture manuelle avec un client actif
  facultatif, devise d'entreprise, lignes et totaux calculés.
- [x] `PUT /api/v1/invoices/:id` met à jour les factures manuelles brouillon
  uniquement, exige `If-Match` et remplace les lignes dans une transaction.
- [x] `DELETE /api/v1/invoices/:id` supprime uniquement un brouillon et exige
  `If-Match`; pour une facture convertie depuis un devis, le devis revient à
  `ACCEPTE` dans la même transaction.
- [x] Le calcul partagé utilisé par les devis est extrait dans
  `backend/src/documents/calculation.ts`; les totaux restent en `bigint`.
- [x] Une migration additive ajoute aux factures le type et la valeur de la
  remise globale nécessaires à la persistance des brouillons.
- [x] README et bilan général mis à jour.
- [x] Vérification TypeScript et 19 tests unitaires réussis.
- [x] Deux scénarios PostgreSQL réussis, dont création, modifications
  concurrentes, version périmée, suppression et réouverture/reconversion du
  devis.

## Invariants

- Une facture manuelle reste `BROUILLON` jusqu'à son émission.
- Une facture émise ou annulée ne peut pas être modifiée ou supprimée.
- Les écritures de modification et suppression exigent la version courante.
- Une facture convertie garde des lignes non éditables; supprimer son brouillon
  rouvre atomiquement le devis accepté pour permettre une nouvelle conversion.
- Les totaux proviennent du calculateur commun, jamais du client.
