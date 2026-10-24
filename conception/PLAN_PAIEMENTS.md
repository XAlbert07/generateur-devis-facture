# Plan d'implémentation — paiements

## Objectif

Enregistrer les encaissements d'une facture émise, empêcher les doubles
enregistrements et les dépassements, puis annuler une erreur par traçabilité
plutôt que par suppression.

## Étapes

1. Étendre le modèle Payment avec la clé et l'empreinte d'idempotence, l'auteur
   du paiement et les champs d'annulation auditables.
2. Ajouter les routes `GET/POST /invoices/:id/payments` et
   `POST /invoices/:id/payments/:paymentId/cancel`.
3. Verrouiller la facture à chaque mutation; vérifier son statut et son solde
   dans la même transaction que l'écriture.
4. Calculer à la lecture le montant encaissé, le solde, le statut de paiement
   et le retard selon le fuseau de l'entreprise.
5. Prolonger le test PostgreSQL pour doublons, clé réutilisée avec un contenu
   différent, paiements concurrents, dépassement, annulation et isolation.

## Invariants

- Seule une facture émise reçoit des paiements; chaque montant est strictement
  positif et le total des paiements valides ne dépasse pas le TTC.
- La même clé avec la même requête renvoie le paiement existant; la même clé
  avec une requête différente dans les 24 heures renvoie 409; après expiration,
  la clé peut servir à une nouvelle opération.
- Paiements et annulations sont sérialisés par verrou sur la facture.
- Les paiements ne sont jamais supprimés; leur annulation conserve l'auteur,
  la date et le motif.
- Le solde est dérivé des paiements non annulés, jamais stocké.

## État

- [x] Modèle et migration mis à jour
- [x] Routes et verrouillage transactionnel ajoutés
- [x] Solde et états calculés ajoutés
- [x] Tests unitaires et vérification TypeScript réussis
- [x] Test PostgreSQL exécuté sur une base éphémère dédiée `_test`

## Résultat

Le test PostgreSQL couvre l'isolation entre entreprises, la répétition de
création et d'émission, l'idempotence des paiements, le conflit d'empreinte,
deux paiements concurrents, le refus de dépassement, l'expiration d'une clé et
l'annulation traçable. La base et les données de test étaient dans un conteneur
éphémère, arrêté et supprimé à la fin du test.
