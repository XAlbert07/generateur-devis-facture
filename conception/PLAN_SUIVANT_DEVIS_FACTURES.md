# Plan d'implémentation — expiration, PDF et conversion

## Objectif

Terminer le parcours serveur du devis envoyé jusqu'au brouillon de facture,
avec des données figées et une conversion sûre en cas de requêtes simultanées.

## Étapes

1. **Expiration** — ajouter l'état `EXPIRE`, le matérialiser à la lecture et
   interdire l'acceptation après la date de validité.
2. **PDF du devis** — rendre le PDF depuis l'instantané, le stocker sous une
   clé déterministe, conserver son SHA-256 et offrir `GET /quotes/:id/pdf`.
3. **Conversion** — ajouter `POST /quotes/:id/convert`; verrouiller le devis,
   copier les lignes et totaux dans une facture brouillon, marquer le devis
   converti et renvoyer la facture existante lors d'un nouvel appel.
4. **Vérification** — ajouter des tests unitaires et des tests d'intégration
   PostgreSQL opt-in pour expiration, PDF, isolation, conversion répétée et
   conversion concurrente; lancer tests et vérification TypeScript.

## Invariants

- Seul un devis envoyé non expiré peut être accepté; seule une acceptation
  permet la conversion.
- Les documents émis sont rendus depuis leurs instantanés et restent
  vérifiables par empreinte SHA-256.
- Une seule facture est créée par devis, même si la requête est répétée ou
  envoyée simultanément.
- La création de facture et le passage du devis à `CONVERTI` sont atomiques.
- Les recherches et mutations restent bornées à l'entreprise authentifiée.

## Résultat de l'exécution

- [x] Migration initiale Prisma ajoutée pour un déploiement reproductible
- [x] Expiration implémentée à la consultation et bloquante à l'acceptation
- [x] PDF du devis rendu depuis l'instantané, stocké et vérifié par SHA-256
- [x] Conversion atomique et idempotente en facture brouillon
- [x] Tests unitaires, génération Prisma et vérification TypeScript réussis
- [ ] Test PostgreSQL prêt, exécution en attente d'une `DATABASE_URL` dédiée
      finissant par `_test` (aucune URL et aucun rôle PostgreSQL local disponibles)
