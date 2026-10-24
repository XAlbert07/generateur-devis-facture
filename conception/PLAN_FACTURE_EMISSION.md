# Plan d'implémentation — consultation et émission des factures

## Objectif

Compléter le parcours après conversion d'un devis accepté : retrouver la
facture, l'émettre avec ses dates et son numéro, puis télécharger un PDF fidèle
à l'instantané émis.

## Étapes

1. Ajouter les routes authentifiées de liste et de détail des factures, avec
   pagination, filtre de statut et isolation par entreprise.
2. Ajouter `POST /api/v1/invoices/:id/issue` : verrou de ligne, contrôle
   `If-Match`, numéro séquentiel annuel, date d'émission et échéance calculée
   depuis le délai de paiement de l'entreprise.
3. À l'émission, figer les données de facture, entreprise, client et lignes;
   calculer l'empreinte de l'instantané et rendre un PDF immuable.
4. Stocker le PDF de façon déterministe, conserver son SHA-256 et permettre sa
   vérification ou sa réparation par `GET /api/v1/invoices/:id/pdf`.
5. Prolonger le test PostgreSQL opt-in pour couvrir lecture, émission répétée,
   date d'échéance, PDF et isolation; mettre à jour le README et le plan.

## Invariants

- Seule une facture brouillon peut être émise; une répétition renvoie la même
  facture émise et ne consomme pas de numéro supplémentaire.
- L'émission, la séquence et l'instantané sont écrits dans une transaction.
- Le PDF émis est produit à partir de l'instantané et vérifiable par SHA-256.
- Chaque lecture et écriture de facture est limitée à l'entreprise du jeton.

## État

- [x] Routes de liste et détail ajoutées
- [x] Émission, séquence annuelle et échéance ajoutées
- [x] Instantané et PDF vérifiable par SHA-256 ajoutés
- [x] Tests unitaires, Prisma Client et vérification TypeScript réussis
- [ ] Test PostgreSQL exécuté sur une base dédiée `_test`
      (prêt, mais non exécuté faute de `DATABASE_URL` et de rôle local)
