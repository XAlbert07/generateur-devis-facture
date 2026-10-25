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
