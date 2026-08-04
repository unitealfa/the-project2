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
