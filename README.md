# ECOTRACK order management

Application interne React/Express pour gérer les commandes, les produits, les
livreurs et la synchronisation des statuts DHD/Sook (API ECOTRACK).

## Prérequis

- Node.js 20.19 ou plus récent
- MongoDB
- un compte de service Google autorisé sur la feuille de commandes
- les jetons ECOTRACK côté backend uniquement

## Installation

```bash
npm ci --prefix back
npm ci --prefix front
cp back/.env.example back/.env
cp front/.env.example front/.env
```

Compléter ensuite les variables locales. Ne jamais versionner les fichiers
`.env`. `JWT_SECRET` et `CRON_SECRET` doivent être des valeurs aléatoires
distinctes; les jetons DHD/Sook et la clé privée Google restent exclusivement
sur le backend.

## Développement

Dans deux terminaux :

```bash
npm run dev:back
npm run dev:front
```

## Vérifications

```bash
npm test
npm run audit
```

Le contrat DHD utilisé par l'intégration est la collection Postman fournie
`ECOTRACK API.postman_collection.json`. Le diagnostic, les décisions et les
limites de déploiement sont suivis dans `DHD_ECOTRACK_FIX_REFERENCE.md`.

## Déploiement Vercel

Le dépôt contient deux applications et doit être relié à deux projets Vercel :

- frontend : `Root Directory` = `front`, build `npm run build`, sortie `dist` ;
- backend : `Root Directory` = `back`, configuration lue dans
  `back/vercel.json`.

Les variables du frontend et du backend doivent être configurées dans le projet
Vercel correspondant. Le fichier local `back/.env` reste ignoré par Git.

Le plan Vercel Hobby refuse les crons exécutés plus d'une fois par jour. La
synchronisation toutes les cinq minutes est donc lancée par
`.github/workflows/order-status-sync.yml` :

1. dans Vercel backend, définir `CRON_SECRET` ;
2. dans GitHub, ouvrir `Settings > Secrets and variables > Actions` ;
3. créer un secret de dépôt nommé `CRON_SECRET` avec exactement la même valeur ;
4. après le déploiement backend, lancer une première fois le workflow depuis
   l'onglet `Actions` avec `Run workflow`.

Le workflow ne reçoit aucun token DHD/Sook. Ces tokens restent uniquement dans
les variables du backend Vercel.
