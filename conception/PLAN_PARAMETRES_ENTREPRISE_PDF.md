# Plan d'implémentation — paramètres d'entreprise et PDF

## Objectif

Gérer les informations de facturation par entreprise et figer leur valeur dans
les PDF envoyés ou émis.

## Réalisé

- [x] Migration Prisma additive : adresse, téléphone, e-mail, identifiants
  fiscaux, taux de TVA par défaut, pied de page PDF et version.
- [x] `GET /api/v1/company` renvoie les paramètres et l'ETag de version.
- [x] `PUT /api/v1/company` valide les paramètres, exige le rôle administrateur
  et `If-Match`, puis enregistre la modification par comparaison de version.
- [x] Devis envoyés et factures émises prennent un instantané des coordonnées,
  identifiants, conditions, coordonnées de règlement et mentions.
- [x] PDF enrichis avec les coordonnées entreprise, identifiants fiscaux,
  date d'émission/échéance, remise et TVA par taux, conditions, règlement,
  mentions et pied de page. L'en-tête de lignes est répété après saut de page.
- [x] Prisma Client généré, schéma validé et TypeScript vérifié.
- [x] Intégration PostgreSQL des paramètres, migration, isolation tenant et
  PDF avec logo; PDF existant inchangé après mise à jour des paramètres.
- [x] Téléversement PNG/JPEG authentifié, limite 2 Mo, plafond de pixels,
  orientation corrigée, ré-encodage PNG et stockage adressé par empreinte.
- [x] Prisma Client généré, schéma validé, typecheck et 19 tests unitaires
  réussis; 3 scénarios PostgreSQL réussis.

## Invariants

- L'entreprise provient du jeton; le client ne peut pas sélectionner un autre
  tenant.
- Une mise à jour des paramètres exige la version courante et le rôle
  administrateur.
- Les paramètres sont copiés dans l'instantané à l'envoi/émission; une
  modification ultérieure de l'entreprise ne change pas un document existant.
- Les montants et les totaux affichés proviennent des instantanés calculés en
  `bigint`.
