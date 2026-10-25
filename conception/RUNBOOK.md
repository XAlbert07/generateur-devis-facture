# Runbook minimal

Opérations courantes pour un déploiement local ou un premier serveur.

## Santé

- Vivacité (processus HTTP) : `GET /api/v1/health` → `{ "status": "ok" }`.
- Prêt (PostgreSQL joignable) : `GET /api/v1/ready` → `200` + `{ "status": "ready", "database": "up" }`, sinon `503`.
- Chaque réponse porte `X-Request-Id` (réutilisable via le même en-tête en entrée). Les accès sont journalisés en JSON sur stdout.

Utiliser `/ready` dans les sondes de démarrage / équilibreurs ; `/health` pour un check léger sans base.

## HTTPS (production)

Terminer TLS devant l’API (ne pas exposer le port Node publiquement).

- Exemple Caddy : [`deploy/Caddyfile`](../deploy/Caddyfile) et [`deploy/README.md`](../deploy/README.md).
- `NODE_ENV=production` active les cookies `Secure` et l’en-tête HSTS côté API.
- Si le frontend n’est pas same-origin : `CORS_ORIGIN=https://votre-domaine` (CSV).

## Réinitialiser un mot de passe (sans e-mail)

```bash
npm run auth:reset-password -- utilisateur@exemple.test
```

Le script affiche un mot de passe temporaire une seule fois, positionne
`mustChangePassword`, et révoque tous les refresh tokens. L’utilisateur doit
appeler `POST /api/v1/auth/change-password` avant toute autre route métier.

## Sauvegarde PostgreSQL (locale Compose)

```bash
docker exec devis-facture-postgres pg_dump -U devis -d devis_facture -Fc > backup-$(date +%F).dump
```

Les PDF sur disque (`DOCUMENTS_DIR`, défaut `var/documents`) doivent être
sauvegardés séparément (copie du répertoire).

## Restauration manuelle

```bash
docker exec -i devis-facture-postgres pg_restore -U devis -d devis_facture --clean --if-exists < backup-YYYY-MM-DD.dump
```

Arrêter l’API pendant la restauration.

## Exercice de restauration automatisé

À lancer avant la première mise en production, puis périodiquement (mensuel recommandé) :

```bash
npm run ops:restore-drill
```

Prérequis : `pg_dump`, `pg_restore`, `psql` sur le PATH ; `DATABASE_URL` pointant
vers la base source (Compose : port hôte `5433`). Le script :

1. dump la base source ;
2. crée `<db>_restore_drill` ;
3. restaure et vérifie les tables métier ;
4. contrôle la lisibilité de `DOCUMENTS_DIR` ;
5. détruit la base jetable.

Journal JSON sur stdout ; code de sortie `1` en échec.

## Réparer les PDF manquants ou corrompus

```bash
npm run docs:reconcile-pdf
```

Parcourt les devis envoyés (et états suivants) et les factures émises/annulées
dont l’instantané est présent. Régénère le fichier si `pdf_reference` manque
ou si l’empreinte ne correspond plus. Chaque opération est journalisée en JSON
sur stdout (résumé final : `repaired` / `ok` / `skipped` / `errors`). Code de
sortie `1` s’il y a au moins une erreur (ex. `hash_snapshot` incohérent).

## Audit des dépendances

```bash
npm run audit:deps
```

Échoue sur les vulnérabilités `high`/`critical` non listées dans
[`AUDIT_EXCEPTIONS.json`](AUDIT_EXCEPTIONS.json). Exécuté aussi en CI.
Réévaluer l’allowlist avant production (`deferredUntil`).

## Variables d’environnement

Voir `.env.example`. En production : `NODE_ENV=production` (cookies `Secure` +
HSTS), `JWT_SECRET` aléatoire ≥ 32 caractères, `DATABASE_URL` dédiée,
`CORS_ORIGIN` si besoin, HTTPS devant l’API (`deploy/`).

## Appliquer les migrations de schéma

Après chaque mise à jour du dépôt, appliquer les migrations Prisma :

```bash
npm run db:migrate
npm run db:generate
```

La migration `202610250003_schema_secondary_fields` (vague D2) ajoute :
- `Company.langue` (code ISO 639-1, défaut `fr`)
- `Quote.notes` (notes libres optionnelles sur les devis)

Ces colonnes sont rétrocompatibles (valeurs par défaut / nullable).

## Polices PDF embarquées (D1)

Les polices **Liberation Sans** (Regular + Bold) se trouvent dans
`backend/assets/fonts/`. Elles sont embarquées automatiquement dans chaque
PDF généré, assurant l'affichage correct des accents et caractères locaux.
La licence SIL OFL est fournie dans `LICENSE-LiberationSans`.
