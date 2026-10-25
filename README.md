# Générateur de devis et factures

Le projet démarre par le noyau métier de la phase 0 : calcul monétaire exact et
machines à états. Les montants sont des `bigint` exprimés dans la plus petite
unité de la devise ; les quantités sont des milli-unités et les taux sont des
points de base. Aucun calcul métier ne doit utiliser de nombre flottant.

## Structure actuelle

```text
backend/       API Express et schéma Prisma
shared/        Calculs et règles métier réutilisables
frontend/      Application web React/TypeScript
conception/    Spécification fonctionnelle et technique
compose.yaml   PostgreSQL local (Docker Compose)
```

État de complétude du backend, de la base et plan des écarts :
[`conception/ETAT_BACKEND_BASE_DE_DONNEES.md`](conception/ETAT_BACKEND_BASE_DE_DONNEES.md).
La comparaison point par point avec la conception v2.0 se trouve dans
[`conception/COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md`](conception/COMPARAISON_CONCEPTION_V2_IMPLEMENTATION.md).
Le plan des restes jusqu’à la production :
[`conception/PLAN_RESTE_MVP_PRODUCTION.md`](conception/PLAN_RESTE_MVP_PRODUCTION.md)
(vague A : `npm run ops:restore-drill`, `npm run audit:deps`, exemples TLS dans
`deploy/`).

## Démarrer en développement

```bash
npm install
npm run db:generate
npm test
npm run typecheck
```

Pour une base locale, copiez `.env.example` vers `.env`, puis démarrez
PostgreSQL avant d'appliquer le schéma. La base écoute sur le port hôte 5433
pour éviter le conflit avec une installation PostgreSQL locale. L'API charge
automatiquement le `.env` de la racine au démarrage :

```bash
docker compose up -d database
npm run db:generate
npm run db:migrate
npm run dev:api
```

Le premier compte se crée depuis `http://localhost:5173/register` avec
**Créer mon espace**. L'inscription crée l'entreprise et attribue le rôle
administrateur; aucun identifiant initial n'est précréé.

Sans le plugin Docker Compose, lancez le même service directement avec Docker :

```bash
docker run -d --name devis-facture-postgres -e POSTGRES_DB=devis_facture -e POSTGRES_USER=devis -e POSTGRES_PASSWORD=devis_local -p 5433:5432 -v devis-facture-data:/var/lib/postgresql/data postgres:16-alpine
```

Dans un second terminal, démarrez l'interface web :

```bash
npm run dev:web
```

Depuis `frontend/`, la même interface démarre avec `npm run dev`.

Depuis `backend/`, `npm run dev` démarre l'API. Il faut avoir configuré `.env`
et démarré PostgreSQL pour utiliser les routes qui accèdent à la base.

Vite sert l'application sur `http://localhost:5173` et relaie `/api` vers
l'API locale sur le port 3000. Les commandes `npm run typecheck:web` et
`npm run build:web` vérifient et construisent le frontend.

L'API expose `GET /api/v1/health`, `GET /api/v1/ready` (sonde PostgreSQL),
l'authentification, les clients, les
produits et les devis. Les opérations courantes (reset mot de passe,
sauvegarde) sont dans [`conception/RUNBOOK.md`](conception/RUNBOOK.md). Les devis prennent en charge le brouillon, les calculs,
l'envoi numéroté, le PDF depuis l'instantané, l'expiration, l'acceptation, le
refus, l'annulation et la conversion idempotente en facture brouillon. Les
factures peuvent être listées et consultées, puis émises avec un numéro annuel,
une échéance calculée et un PDF immuable généré depuis leur instantané. Les
paiements d'une facture émise sont enregistrés de façon idempotente, annulés
par marquage et inclus dans le solde calculé à la lecture.

Les factures manuelles peuvent être créées et modifiées à l'état brouillon avec
`POST/PUT /api/v1/invoices`; leur suppression par `DELETE` exige `If-Match` et
reste limitée aux brouillons. Les factures converties depuis un devis ne sont
pas modifiables; supprimer leur brouillon réouvre le devis accepté.
Le plan détaillé est dans
[`conception/PLAN_FACTURES_MANUELLES.md`](conception/PLAN_FACTURES_MANUELLES.md).

Les paramètres de l'entreprise sont consultables via `GET /api/v1/company` et
modifiables par un administrateur via `PUT /api/v1/company` avec `If-Match`.
L'instantané de chaque devis envoyé ou facture émise conserve les coordonnées,
identifiants fiscaux, conditions et mentions utilisés pour son PDF. Le plan est
dans [`conception/PLAN_PARAMETRES_ENTREPRISE_PDF.md`](conception/PLAN_PARAMETRES_ENTREPRISE_PDF.md).
Le logo se gère via `PUT/GET/DELETE /api/v1/company/logo`; l'envoi accepte PNG/JPEG
jusqu'à 2 Mo et requiert aussi `If-Match`. Il est ré-encodé en PNG avant stockage.

Les paiements utilisent `POST /api/v1/invoices/:id/payments` avec un en-tête
`Idempotency-Key`; la clé est valable 24 heures. Une clé réutilisée pendant
cette période avec un contenu différent reçoit `409`. L'annulation se fait
par `POST /api/v1/invoices/:id/payments/:paymentId/cancel` avec un motif; aucun
paiement n'est supprimé.

Une facture émise ne peut être annulée que si elle ne porte aucun paiement
valide. Utilisez `POST /api/v1/invoices/:id/cancel` avec `If-Match` et un motif;
le PDF original reste accessible et le PDF d'annulation est disponible sous
`GET /api/v1/invoices/:id/cancellation-pdf`. `GET /api/v1/dashboard/summary`
retourne les sommes facturées, encaissées, impayées et en retard, ainsi que le
nombre de devis envoyés en attente.

Les PDF sont conservés dans `var/documents` par défaut. Définissez
`DOCUMENTS_DIR` pour choisir un autre répertoire persistant. Pour exécuter le
test PostgreSQL d'intégration, configurez `DATABASE_URL` vers une base dédiée
dont le nom se termine par `_test` (par exemple `devis_facture_test`),
appliquez les migrations sur cette base, puis lancez
`npm run test:integration`. Le test est ignoré si la base ne porte pas ce
suffixe.
