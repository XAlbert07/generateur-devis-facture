# Déploiement — exemples

## TLS (Caddy)

Voir [`Caddyfile`](Caddyfile). Caddy obtient les certificats Let’s Encrypt
automatiquement pour le domaine déclaré.

1. `npm run build:web` et copier `frontend/dist` vers le `root` du Caddyfile.
2. Lancer l’API : `NODE_ENV=production` + `.env` de production, écoute
   `127.0.0.1:3000` (pas exposé publiquement).
3. Recharger Caddy.

Alternative nginx : terminer TLS sur 443, `proxy_pass http://127.0.0.1:3000`
pour `/api/`, et servir les fichiers statiques du build Vite pour le reste.

## Variables production

| Variable | Rôle |
| --- | --- |
| `NODE_ENV=production` | Cookies `Secure`, en-tête HSTS côté API |
| `CORS_ORIGIN` | Origine(s) HTTPS du front si cross-origin (CSV) |
| `JWT_SECRET` | Secret ≥ 32 caractères |
| `DATABASE_URL` | PostgreSQL dédié |
| `DOCUMENTS_STORAGE` | `database` : PDF et logos dans PostgreSQL (hébergement au disque éphémère) ; `filesystem` (défaut) : répertoire `DOCUMENTS_DIR` |
| `DOCUMENTS_DIR` | Volume persistant des PDF/logos en mode `filesystem` |

## Hébergement gratuit : Vercel + Render + Neon

Alternative au serveur unique ci-dessus, pour une démonstration.

- **Vercel** sert le frontend (`vercel.json` à la racine) et redirige `/api/*` vers l'API :
  le navigateur ne parle qu'à un seul domaine, donc cookies et CSRF fonctionnent sans CORS.
- **Render** exécute l'API (`render.yaml`) : `npm run start:render` applique les migrations
  (`prisma migrate deploy`) puis démarre le serveur.
- **Neon** héberge PostgreSQL. Utiliser l'adresse **directe** (sans `-pooler`) dans `DATABASE_URL`,
  avec `?sslmode=require&connect_timeout=15&schema=public`.
- Le disque de Render gratuit est éphémère : `DOCUMENTS_STORAGE=database` est donc obligatoire.

## Espaces d'essai (démo pour les visiteurs)

Avec `SANDBOX_ENABLED=true`, la page de connexion propose « Essayer la démo » : un clic ouvre une
session administrateur dans une entreprise isolée, déjà remplie (clients, produits, devis dans chaque
état, factures, paiements, PDF). Aucune donnée personnelle : tout est fictif.

- **Remplissage** : il passe par l'API du serveur lui-même, donc par la logique de production.
- **Réservoir** : `SANDBOX_POOL_SIZE` espaces complets sont préparés d'avance, dès qu'un visiteur ouvre
  la page de connexion, pour que le clic soit instantané même sur un processeur lent. Un espace n'est
  attribué qu'une fois entièrement rempli.
- **Expiration** : la durée de vie (`SANDBOX_TTL_HOURS`) démarre à l'attribution. Les espaces expirés
  sont supprimés à chaque création ; `npm run sandbox:purge` (ou `-- --all`) les supprime à la demande.
  Seules les entreprises marquées comme espace d'essai peuvent être purgées.
- **Protection contre l'abus** : limite par adresse IP et par heure, plafond d'espaces actifs
  (protège le stockage de la base), nombre de préparations simultanées borné.

