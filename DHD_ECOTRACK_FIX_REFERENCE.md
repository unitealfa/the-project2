# Reference de correction DHD / ECOTRACK

Derniere mise a jour : 2026-08-04  
Etat global : **corrections implementees et testees localement; configuration/rotation et validation staging restantes**  
Portee : commandes, statuts transporteur, Google Sheets, MongoDB, frontend,
backend et execution Vercel.

Ce document est la source de suivi du chantier. Il ne remplace pas le contrat
officiel ECOTRACK. Il rassemble les faits verifies, les decisions retenues, les
travaux a effectuer et les preuves exigees avant de declarer le chantier
termine.

## 1. Regle de travail anti-hallucination

Avant chaque etape :

- relire ce document en entier ;
- executer `git status --short` et ne pas ecraser les changements de
  l'utilisateur ;
- confirmer que le fichier vise est actif/importé ;
- relire la requete correspondante dans
  `ECOTRACK API.postman_collection.json` ;
- distinguer un fait verifie, une inference et une decision a prendre ;
- ne jamais inventer un endpoint, un webhook, un statut ou un format de
  reponse absent des sources ;
- ne jamais utiliser les secrets codes en dur dans un exemple ou un rapport.

Apres chaque modification :

- verifier le diff exact ;
- executer les tests proportionnes au changement ;
- inscrire les fichiers touches et les resultats dans le journal, section 13 ;
- mettre a jour la case de l'anomalie et de l'etape concernees ;
- ne jamais ecrire « termine » si un test requis est absent ou en echec.

Ordre des sources de verite :

1. comportement reel verifie de l'API, sans mutation et sans divulgation de
   donnees ;
2. `ECOTRACK API.postman_collection.json` fourni par l'utilisateur ;
3. code actif importe par `front/src/main.tsx` et `back/api/index.ts` ;
4. configuration effective de deploiement ;
5. ce document, qui doit etre corrige si une preuve plus forte le contredit.

Les fichiers `Orders.tsx.copy`, `front/src/Orders.tmp` et le fichier racine
`Orders.tsx` ne sont pas des sources de verite. Ils ne sont pas executes par
l'application actuelle.

## 2. Objectif mesurable

Une commande envoyee depuis le site doit :

1. etre creee sur le bon compte transporteur ;
2. produire un succes uniquement si ECOTRACK repond `success: true` avec un
   tracking valide ;
3. etre validee/expediee seulement si l'action utilisateur le demande ;
4. conserver le tracking et le transporteur dans MongoDB et Google Sheets ;
5. recuperer automatiquement le statut ECOTRACK exact ;
6. afficher le meme etat transporteur sur le site, a quelques minutes pres ;
7. ne jamais confondre une remarque, une activite et un statut ;
8. garder Google Sheets, MongoDB et l'interface coherents ;
9. continuer a synchroniser meme si aucun navigateur n'est ouvert ;
10. exposer une erreur exploitable si une etape echoue.

Dans la collection fournie, aucun webhook de statut n'est documente. Le terme
« temps reel » signifie donc une synchronisation periodique courte et fiable.
Ne pas inventer un webhook sans documentation DHD supplementaire.

## 3. Architecture actuelle verifiee

```text
Google Sheet public CSV
        |
        v
front/src/pages/Orders.tsx -- appels directs --> ECOTRACK / DHD
        |
        v
back/src/orders/* --> Google Sheets API
        |
        +----------> MongoDB (copie partielle des commandes)
```

- Le frontend recharge le CSV Google Sheet toutes les 10 secondes.
- La creation ECOTRACK est actuellement faite directement depuis le
  navigateur.
- Le frontend demande une synchro officielle toutes les 5 minutes, uniquement
  lorsque la page Commandes est ouverte.
- Le backend balaie les pages de `/api/v1/get/orders`, puis ecrit le statut
  simplifie dans Google Sheets.
- Le scheduler Node est desactive sur Vercel.

## 4. Faits verifies et preuves de depart

| ID | Fait verifie | Preuve |
|---|---|---|
| F-001 | Le token DHD present lors de l'audit est valide | `validate/token`: HTTP 200, `VALID_TOKEN`, test du 2026-08-04 |
| F-002 | `/api/v1/get/orders` repond avec 40 commandes par page | Test reel, HTTP 200 |
| F-003 | `/api/v1/get/orders/status` fonctionne avec un tracking et `status=all` | Test reel, HTTP 200, un resultat |
| F-004 | Le endpoint backend deploye `/api/orders/sync-statuses` expire | Test sans ecriture avec faux tracking : HTTP 500 apres environ 10,8 s, `timeout of 10000ms exceeded` |
| F-005 | `tracking/info` n'a pas de `status` racine | Reponse reelle : informations destinataire + tableau `activity` |
| F-006 | `get/maj` n'est pas une source de statut | Documentation et test reel : tableau de remarques, aucun champ `status` |
| F-007 | CORS DHD autorise actuellement `Authorization` et `Content-Type` | Preflight reel HTTP 204 avec `Access-Control-Allow-Origin: *` |
| F-008 | Le backend Vercel repond | Healthcheck deploye HTTP 200 |
| F-009 | Les dependances locales ne sont pas installees | `vite` et `tsc` introuvables pendant l'audit |

Les tests externes futurs doivent rester minimaux, sans afficher le token, le
tracking, le nom, le telephone, l'adresse ou toute autre donnee client.

## 5. Contrat ECOTRACK utile au chantier

| Fonction | Methode et endpoint | Parametres/forme importants | Usage cible |
|---|---|---|---|
| Verifier le token | `GET /api/v1/validate/token` | `api_token` | Healthcheck de configuration |
| Creer une commande | `POST /api/v1/create/order` | Parametres commande, reponse `success` + `tracking` | Creation unitaire backend |
| Creer en lot | `POST /api/v1/create/orders` | Objet `orders`, maximum 100 | Envoi groupe, apres validation du contrat |
| Valider/expedier | `POST /api/v1/valid/order` | `tracking`, `ask_collection` | Etape explicite apres creation |
| Lire les remarques | `GET /api/v1/get/maj` | `tracking` | Remarques uniquement, jamais statut |
| Lire l'historique | `GET /api/v1/get/tracking/info` | `tracking`, reponse `activity` | Timeline d'une commande |
| Historiques groupes | `GET /api/v1/get/trackings/info` | Maximum 100 trackings | Timeline groupee si necessaire |
| Lister les commandes | `GET /api/v1/get/orders` | `page`, dates, `tracking` optionnel | Diagnostic ou recherche ciblee, pas scan global |
| Statuts groupes | `GET /api/v1/get/orders/status` | `api_token`, maximum 100 `trackings`, `status` | Source principale de synchronisation |
| Demander un retour | `POST /api/v1/ask/for/order/return` | `tracking` | Action retour transporteur, si exposee dans le site |

Regles de contrat obligatoires :

- l'authentification generale documentee utilise un Bearer token ;
- `get/orders/status` documente aussi `api_token` en query et a ete valide sous
  cette forme pendant l'audit ;
- une reponse HTTP 200 peut contenir `success: false` ;
- le rate limit documente est de 50 requetes par minute ;
- un endpoint doit etre parse selon son schema propre, jamais par heuristique
  globale.

## 6. Statuts officiels a conserver sans perte

La liste fournie comprend notamment :

```text
prete_a_expedier
en_ramassage
en_preparation_stock
vers_hub
en_hub
vers_wilaya
en_preparation
en_livraison
suspendu
livre_non_encaisse
encaisse_non_paye
paiements_prets
paye_et_archive
retour_chez_livreur
retour_transit_entrepot
retour_en_traitement
retour_recu
retour_archive
annule
```

Modele cible :

- `carrierStatus` : valeur ECOTRACK exacte ;
- `businessStatus` : categorie interne stable ;
- `carrierStatusUpdatedAt` : date de derniere lecture reussie ;
- `carrierActivity` ou historique separe : seulement si l'interface en a
  besoin ;
- `lastSyncError` et `lastSyncAttemptAt` : observabilite sans donnees sensibles.

Mapping de depart a confirmer par tests :

| Statuts ECOTRACK | Categorie interne proposee |
|---|---|
| `prete_a_expedier` | `ready_to_ship` |
| ramassage, hub, wilaya, preparation, livraison | `in_transit` |
| `suspendu` | `suspended` |
| livre/encaisse/paiement/archive | `delivered` avec sous-statut exact conserve |
| retours intermediaires | `return_in_progress` |
| `retour_recu`, `retour_archive` | `returned` |
| `annule` | `cancelled` |

Ne pas appliquer ce mapping comme une supposition silencieuse. Ajouter des
tests de table avant son utilisation en production.

## 7. Registre des anomalies a corriger

### B-001 — Critique — Synchronisation paginee en timeout

- Etat : `[x] corrige dans le code; test de charge staging restant`
- Fichiers : `back/src/orders/orderStatusSync.service.ts`
- Cause : scan de `/get/orders`, timeout par requete, delai artificiel et
  jusqu'a 250 pages.
- Correction : utiliser `/get/orders/status`, groupes de 100 trackings, un
  appel par groupe et par compte transporteur.
- Validation : le test avec 1, 100 et plus de 100 trackings termine sans scan
  global ; aucun timeout ; 429 gere.

### B-002 — Critique — Aucun scheduler persistant sur Vercel

- Etat : `[~] route et planification 5 minutes ajoutees; execution Vercel reelle a valider`
- Fichiers : `back/src/app.ts`, `back/src/orders/orderStatusScheduler.ts`,
  `back/vercel.json` ou configuration de deploiement.
- Cause : `setInterval` desactive sur Vercel.
- Correction : route Cron protegee et appel Vercel Cron/scheduler externe.
- Validation : une commande change de statut sans page navigateur ouverte.

### B-003 — Critique — Mauvais usage de `get/maj`

- Etat : `[x] corrige et appel direct supprime du frontend actif`
- Fichier : `front/src/pages/Orders.tsx`
- Cause : une `remarque` peut etre transformee en statut.
- Correction : supprimer cette derivation ; afficher les remarques separement
  si necessaire.
- Validation : une remarque libre ne change jamais `carrierStatus` ou
  `businessStatus`.

### B-004 — Critique — Mauvais parseur de `tracking/info`

- Etat : `[x] parseur backend type et test de fixture ajoutes`
- Fichier : `front/src/pages/Orders.tsx` ou futur client backend.
- Cause : le code cherche un `status` racine et ignore `activity`.
- Correction : parseur type du tableau `activity`; ne pas l'utiliser comme
  substitut au statut groupe.
- Validation : fixture officielle avec `activity` lue correctement.

### B-005 — Critique — `valid/order` absent

- Etat : `[x] decision appliquee: le bouton « Confirmer et envoyer » cree puis valide`
- Fichiers : futur client/backend de commandes, frontend.
- Cause : creation et expedition confondues localement.
- Decision requise : le bouton actuel doit-il creer seulement, ou creer puis
  valider/expedier ?
- Validation : le comportement du bouton correspond exactement a son libelle
  et a l'etat visible sur ECOTRACK.

### B-006 — Critique — HTTP 200 avec `success:false` traite comme succes

- Etat : `[x] corrige et teste localement`
- Fichier : `front/src/pages/Orders.tsx`, puis futur client backend.
- Correction : exiger `success === true` et un tracking valide.
- Validation : fixtures HTTP 200 `success:false`, HTTP 422 et succes reel.

### B-007 — Critique — Envoi multiple sans sauvegarde du tracking

- Etat : `[x] corrige par envois unitaires backend idempotents; test staging restant`
- Fichier : `front/src/pages/Orders.tsx`, puis endpoint backend groupe.
- Correction : utiliser `create/orders` apres test de contrat ou conserver
  chaque tracking de la creation unitaire.
- Validation : chaque succes du lot possede son tracking dans Sheet et Mongo.

### B-008 — Haute — `return` interrompt toutes les commandes restantes

- Etat : `[x] corrige par resultats independants et poursuite du lot`
- Fichier : `back/src/orders/orderStatusSync.service.ts`
- Correction : traitement independant par commande ; `continue` et resultat
  structure par tracking.
- Validation : une commande introuvable ou inconnue n'empeche pas la suivante.

### B-009 — Haute — Mapping incomplet et perte du statut exact

- Etat : `[x] table exhaustive testee; statut exact conserve dans Mongo/UI et colonne Sheet optionnelle`
- Fichiers : frontend, backend, modele Mongo, Sheet/UI.
- Correction : stocker le statut exact et mapper via une table testee.
- Validation : chaque statut officiel documente possede un comportement
  explicite ; aucun `unknown_status` silencieux.

### B-010 — Haute — MongoDB non mis a jour par la synchro officielle

- Etat : `[x] upsert, timestamps et erreurs ajoutes; convergence staging a verifier`
- Fichier : `back/src/orders/orderStatusSync.service.ts`.
- Correction : upsert atomique ou controle apres succes Sheet ; enregistrer les
  timestamps et erreurs de synchro.
- Validation : MongoDB, Sheet et interface montrent le meme statut.

### B-011 — Haute — Transporteur choisi non hydrate/persisté dans le frontend

- Etat : `[x] metadata Mongo hydrate transporteur/tracking/statut au rechargement`
- Fichiers : `front/src/pages/Orders.tsx`, `DeliveryCell.tsx`, modele/API.
- Correction : charger la valeur persistante ; ne jamais supposer DHD par
  defaut pour une commande existante ; unifier modal et tableau.
- Validation : rechargement de page conserve DHD/Sook/livreur exact.

### B-012 — Critique securite — Secrets et routes exposes

- Etat : `[~] code actif nettoye et routes protegees; rotation et historique Git restent externes`
- Fichiers : frontend, backend, `.env`, routes commandes, historique Git selon
  strategie approuvee.
- Cause : tokens transporteur et cle Google codes en dur ; routes commandes
  sans JWT.
- Correction : secrets serveur uniquement, rotation, JWT + roles, logs
  sanitizes.
- Validation : aucun secret dans le bundle frontend ou les fichiers suivis ;
  appels non authentifies refuses.

### B-013 — Haute — Decrementation de stock a plusieurs endroits

- Etat : `[x] machine d'etat Mongo atomique unique; test d'integration DB restant`
- Fichiers : `Orders.tsx`, `order.controller.ts`, `orderStatusSync.service.ts`,
  `orderStockUtils.ts`.
- Risque : double decrement ou restauration incoherente.
- Correction cible : une seule transition idempotente par commande, avec trace
  de l'ajustement applique.
- Validation : rejouer une synchro ne change pas une seconde fois le stock.

### B-014 — Haute — Colonne statut Sheet codee en dur

- Etat : `[x] resolution par en-tete avec erreur si absente ou ambigue`
- Fichier : `back/src/orders/order.service.ts`.
- Cause : colonne `L` fixe alors que d'autres colonnes sont resolues par
  en-tete.
- Correction : resoudre aussi la colonne statut par en-tetes candidats et
  echouer clairement si elle est absente/ambigue.
- Validation : test avec ordre de colonnes modifie.

## 8. Plan d'implementation obligatoire

### Etape 0 — Baseline et sauvegarde logique

- Etat : `[x] terminee; builds de depart et etat Git captures`
- Capturer la liste des fichiers, le statut Git et les variables disponibles
  sans afficher leurs valeurs.
- Installer les dependances seulement avec autorisation si necessaire.
- Faire passer les builds frontend/backend avant ou documenter les erreurs de
  depart.
- Ajouter des tests de contrat locaux avant de remplacer la synchronisation.

### Etape 1 — Client ECOTRACK backend unique

- Etat : `[x] terminee et couverte par tests contractuels locaux`
- Creer un module serveur type, sans token fallback code en dur.
- Centraliser base URL, authentification, timeout, retry 429 et normalisation
  des erreurs.
- Implementer d'abord `validateToken`, `createOrder`, `validateOrder`,
  `getStatuses` et, si necessaire, `getTrackingActivity`.
- Interdire tout retour contenant le token dans les erreurs/logs.

### Etape 2 — Creation/expedition transactionnelle

- Etat : `[x] code termine; creation reelle volontairement non executee en production`
- Ajouter un endpoint backend protege pour envoyer une commande.
- Valider le payload avant ECOTRACK.
- Rejeter `success:false`, tracking vide et format inattendu.
- Persister tracking, transporteur et statuts uniquement apres succes externe.
- Definir la strategie si Sheet reussit et Mongo echoue, ou inversement.
- Integrer `valid/order` selon la decision metier B-005.

### Etape 3 — Synchronisation groupee des statuts

- Etat : `[x] code termine; Google Sheets ecrit par lots de 100 maximum`
- Remplacer le scan pagine par `get/orders/status`.
- Grouper par compte DHD/Sook et par paquets de 100.
- Traiter chaque commande independamment.
- Conserver le statut exact et le resultat de chaque tracking.
- Mettre a jour MongoDB et Google Sheets de facon coherente.
- Rendre le traitement idempotent, y compris le stock.

### Etape 4 — Modele de donnees et mapping

- Etat : `[~] modele/mapping termines; backfill historique non execute`
- Ajouter les champs transporteur/statut exact/timestamps/erreur necessaires.
- Ecrire une table de mapping exhaustive testee.
- Prevoir la migration/backfill des commandes existantes.
- Ne pas deduire le transporteur d'une valeur temporaire React.

### Etape 5 — Cron serverless fiable

- Etat : `[~] route, secret, verrou et horaire ajoutes; execution deployee non prouvee`
- Exposer une route de cron protegee par secret.
- Configurer le scheduler de deploiement.
- Limiter les commandes candidates et traiter par lots bornes.
- Logger uniquement compteurs, durees, codes et identifiants internes non
  sensibles.
- Ajouter verrou/idempotence pour eviter deux executions concurrentes.

### Etape 6 — Frontend simplifie

- Etat : `[x] migration du code actif terminee et build valide`
- Retirer tous les appels directs DHD/Sook et tous les tokens `VITE_*`.
- Utiliser seulement le backend authentifie.
- Afficher statut officiel, categorie interne, derniere synchro et erreur.
- Ajouter « Actualiser maintenant » sans scan global.
- Unifier la selection transporteur du tableau et de la modale.
- Conserver les remarques et activites separees du statut.

### Etape 7 — Securite et rotation

- Etat : `[~] secrets retires du code et JWT ajoute; rotations externes non effectuees`
- Deplacer tous les secrets vers les variables serveur.
- Faire tourner les tokens transporteur et la cle de service Google apres
  retrait du code.
- Proteger les routes commandes par JWT/roles.
- Verifier le bundle de production et les logs.
- La reecriture de l'historique Git est une action separee, potentiellement
  destructive, qui exige une decision explicite.

### Etape 8 — Validation, staging et deploiement

- Etat : `[~] tests/builds locaux termines; staging et deploiement non executes`
- Tester d'abord avec fixtures, puis environnement de staging.
- Comparer un echantillon autorise de trackings entre ECOTRACK, Mongo, Sheet et
  UI sans publier de PII.
- Deployer progressivement.
- Surveiller erreurs, taux de `notFound`, 401/422/429, duree et retard moyen.
- Prevoir un retour arriere applicatif sans supprimer les donnees.

## 9. Matrice minimale de tests

| Test | Resultat attendu | Etat |
|---|---|---|
| Token valide | Configuration acceptee | `[x] lecture reelle audit` |
| Token invalide/non autorise | Erreur claire, aucun secret | `[ ]` |
| Creation reussie | `success:true`, tracking persiste | `[ ]` |
| HTTP 200 + `success:false` | Echec metier, aucune fausse validation | `[x] fixture locale` |
| HTTP 422 | Champs ECOTRACK affiches proprement | `[ ]` |
| Creation puis validation | Etat ECOTRACK conforme au bouton | `[~] code, test staging restant` |
| Lot partiellement reussi | Chaque commande garde son propre resultat | `[~] code, test staging restant` |
| 1 tracking | Une synchro ciblee, aucune pagination globale | `[x] test de decoupage local` |
| 100 trackings | Un paquet maximum conforme | `[x] test de decoupage local` |
| 101 trackings | Deux paquets, resultats fusionnes | `[x] test de decoupage local` |
| Tracking introuvable | La commande suivante est traitee | `[~] code, integration DB restante` |
| Statut inconnu | Statut exact conserve et alerte observable | `[x] fixture locale + code` |
| `suspendu` | Categorie `suspended` | `[x] table testee` |
| Retour intermediaire | Pas de retour final premature | `[x] table testee` |
| Retour final | Categorie `returned` | `[x] table testee` |
| 429 | Backoff borne, pas de boucle infinie | `[~] code borne, fixture HTTP restante` |
| Timeout DHD | Erreur par lot/commande, prochain cron possible | `[ ]` |
| Cron sans navigateur | Statut mis a jour | `[ ]` |
| Deux crons concurrents | Pas de double ecriture/stock | `[~] verrou code, test DB restant` |
| Remarque libre | Aucun changement de statut | `[x] fixture locale` |
| Rechargement page | Transporteur et statut conserves | `[~] hydratation code, test navigateur restant` |
| Appel route sans JWT | 401/403 | `[x] middleware teste localement` |
| Bundle frontend | Aucun token/secret | `[x] scan rg du build` |
| Build front et back | Succes | `[x] 2026-08-04` |

## 10. Definition de termine

Le chantier n'est termine que si :

- B-001 a B-012 sont fermes avec preuve ;
- B-013 et B-014 ont ete corriges ou ont une decision justifiee et acceptee ;
- tous les tests de la section 9 passent ;
- la synchro fonctionne page fermee ;
- aucun token ou cle privee n'est present dans le frontend ou le code suivi ;
- une erreur DHD ne produit jamais un faux succes ;
- les statuts exacts sont visibles et ne sont jamais derives de remarques ;
- MongoDB, Google Sheets et UI convergent ;
- le deploiement dispose d'observabilite et d'une procedure de retour arriere ;
- le journal ci-dessous contient les commandes de test et leurs resultats
  sanitizes.

## 11. Decisions a obtenir avant les changements correspondants

| ID | Question | Etat |
|---|---|---|
| D-001 | « Confirmer et envoyer » doit-il appeler automatiquement `valid/order` ? | `[x] oui, conforme au libelle; parametre backend desactivable` |
| D-002 | Quelle frequence de synchro souhaitee : 1, 2, 5 ou 10 minutes ? | `[x] 5 minutes, reprise du comportement UI existant` |
| D-003 | Le statut exact doit-il etre ajoute dans une nouvelle colonne Sheet ou remplacer `etat` ? | `[x] ne remplace pas etat; Mongo/UI + colonne Sheet optionnelle` |
| D-004 | Faut-il afficher l'historique `activity` dans l'interface ? | `[~] endpoint backend pret; timeline UI non ajoutee faute de decision explicite` |
| D-005 | Quelle strategie de migration pour les commandes existantes sans tracking/transporteur fiable ? | `[ ] a concevoir` |

Une decision manquante ne doit bloquer que l'etape concernee. Les tests,
refactorings internes et corrections independantes peuvent avancer sans
inventer la reponse.

## 12. Fichiers actifs a relire selon l'etape

- Contrat : `ECOTRACK API.postman_collection.json`
- Front commandes : `front/src/pages/Orders.tsx`
- Selection transporteur : `front/src/components/DeliveryCell.tsx`,
  `front/src/components/DeliverySelection.tsx`
- API frontend : `front/src/utils/api.ts`
- Routes backend : `back/src/orders/order.routes.ts`
- Controleur commandes : `back/src/orders/order.controller.ts`
- Synchronisation : `back/src/orders/orderStatusSync.service.ts`
- Scheduler : `back/src/orders/orderStatusScheduler.ts`
- Google Sheets : `back/src/orders/order.service.ts`
- Modele Mongo : `back/src/orders/order.model.ts`
- Stock : `back/src/orders/orderStockUtils.ts`, `back/src/products/*`
- App/deploiement : `back/src/app.ts`, `back/api/index.ts`,
  `back/vercel.json`, `front/vercel.json`
- Auth : `back/src/middleware/*`, `front/src/context/AuthContext.tsx`

## 13. Journal obligatoire des modifications

Ajouter une entree apres chaque groupe coherent de modifications.

### Entree initiale — 2026-08-04 — Creation de la reference

- Etape : preparation du chantier.
- Fichiers ajoutes : `AGENTS.md`, `DHD_ECOTRACK_FIX_REFERENCE.md`.
- Code fonctionnel modifie : aucun.
- Preuves reprises : audit local, collection Postman, tests DHD en lecture
  seule, test Vercel sans ecriture.
- Tests de build : non executes avec succes, dependances absentes.
- Prochaine etape autorisee : Etape 0, puis Etape 1.

### Entree 2 — 2026-08-04 — Baseline et architecture backend

- Etapes : 0 a 5.
- Anomalies : B-001, B-002, B-005 a B-010, B-013, B-014.
- Fichiers principaux : `ecotrack.client.ts`, `orderApi.controller.ts`,
  `orderStatus.ts`, `orderStatusSync.service.ts`, `order.service.ts`, modele et
  routes commandes, verrou cron et `back/vercel.json`.
- Modifications : client serveur sans fallback secret, creation/validation
  idempotente, statuts groupes par 100, ecriture Sheet groupee, statut exact,
  upsert Mongo, verrou cron, reconciliation de stock atomique et resolution de
  la colonne statut par en-tete.
- Decision : « Confirmer et envoyer » appelle creation puis `valid/order`; le
  cron cible cinq minutes et traite au plus 100 commandes par passage.
- Tests : `npm ci --ignore-scripts`, builds baseline front/back, puis
  `cd back && npm test`.
- Resultat : build TypeScript et tests contractuels locaux reussis.
- Limites : aucune creation reelle ni ecriture de staging executee; le cron
  cinq minutes exige un plan Vercel compatible avec cette frequence.

### Entree 3 — 2026-08-04 — Migration frontend et securite

- Etapes : 6 et 7.
- Anomalies : B-003, B-004, B-006, B-007, B-011, B-012, B-013.
- Fichiers principaux : `front/src/pages/Orders.tsx`, `front/src/utils/api.ts`,
  routes/middlewares commandes, configuration des secrets et anciens fichiers
  de sauvegarde non actifs.
- Modifications : retrait des appels directs DHD/Sook et des valeurs secretes,
  envoi unitaire/lot via backend JWT, tracking obligatoire, hydratation Mongo
  du transporteur et du statut exact, affichage statut transporteur + categorie,
  suppression des mutations de stock actives cote navigateur, roles et controle
  d'appartenance livreur.
- Securite complementaire : cle Google, SMTP, webhook et bootstrap admin passes
  en variables serveur; ancien mot de passe admin par defaut supprime.
- Tests : `cd front && npm run build`, scan `rg` du bundle et des fichiers actifs,
  `git diff --check`.
- Resultat : build reussi; aucun endpoint/URL/token DHD-Sook dans le bundle;
  aucune cle privee detectee dans les fichiers actifs.
- Limites : les secrets deja exposes doivent etre revoques et remplaces dans les
  environnements; la reecriture Git n'a pas ete autorisee ni effectuee.

### Entree 4 — 2026-08-04 — Verification finale locale

- Tests couverts : `success:false`, tracking obligatoire, paquets 1/100/101,
  schema `data[tracking].status`, tableau `activity`, mapping complet des 19
  statuts fournis, remarque libre, et refus sans JWT.
- Commandes finales : `cd back && npm test`; `cd front && npm run build`;
  `git diff --check`; scans `rg` du bundle.
- Resultat : 10 scenarios contractuels et tous les controles locaux executes passent; seul l'avertissement
  Vite preexistant sur la taille du gros chunk reste present.
- Prochaine action exacte : configurer/rotater les secrets serveur, deployer en
  staging sur un plan cron compatible, puis executer la matrice restante avec
  une commande de test autorisee et des preuves sans PII.

### Entree 5 — 2026-08-04 — Reaudit global securite et acces aux donnees

- Perimetre : application complete, en complement du chantier DHD.
- Anomalies confirmees : `.gitignore` vide, route produits publique avant le
  routeur protege, CORS sans restriction, JWT sans expiration, enumeration des
  comptes, absence de limitation des tentatives, code de reinitialisation en
  clair et mot de passe temporaire statique, uploads non bornes, dependances
  vulnerables et lecture publique du Google Sheet depuis trois ecrans.
- Modifications : restauration des exclusions Git, suppression du fallback
  produits public, liste CORS explicite, en-tetes de securite, limites de corps,
  JWT signe/verifie avec expiration/issuer/audience, erreurs de connexion
  generiques, limitation des tentatives, code de reset hache avec expiration et
  cinq essais maximum, nouveau mot de passe choisi par l'admin, validation des
  utilisateurs/produits, uploads images limites a 5 Mo et quatre MIME, retrait
  des routes manuelles de stock devenues dangereuses, endpoint Sheet protege
  par JWT et migration des trois lectures frontend vers cet endpoint.
- Dependances : jsPDF, React Router, Axios, Express, Mongoose, Multer et
  Nodemailer mis a niveau; lockfiles regeneres.
- Tests intermediaires : builds TypeScript backend et Vite frontend reussis.
- Limites : `CORS_ORIGINS`/`FRONTEND_URL` et `GOOGLE_SPREADSHEET_ID` doivent etre
  configures au deploiement; les images locales restent ephemeres sur Vercel et
  devront utiliser un stockage objet pour une persistance garantie.
- Prochaine action exacte : supprimer les journaux contenant des donnees de
  commandes, verifier les controles d'appartenance, tester les flux stock/DHD,
  puis relancer les audits et builds finaux.

### Entree 6 — 2026-08-04 — Corrections globales et validation finale locale

- Perimetre relu : configuration/deploiement, authentification et utilisateurs,
  produits/uploads, commandes DHD-Sook-livreurs, Google Sheets, MongoDB, stock,
  frontend, dependances, bundle de production et fichiers suivis par Git.
- Authentification : secret JWT obligatoire et suffisamment long, expiration,
  issuer/audience/algorithme imposes, verification du compte courant et
  `tokenVersion`, invalidation des sessions apres modification sensible,
  enumeration de comptes reduite, limites de tentatives, codes de reset haches
  avec TTL/cooldown/cinq essais, et mot de passe choisi par l'administrateur.
- API et donnees : roles et appartenance renforces, reponses utilisateurs
  minimales, CORS en liste blanche avec refus HTTP 403, limites de corps,
  en-tetes HSTS/CSP/nosniff, erreurs generiques, logs sans PII et suppression de
  `debuglogs.txt` ainsi que du fichier `back/.env` suivi.
- Google Sheets : lecture passee derriere JWT/service account, identifiant et
  nom de feuille valides, plages A1 strictes, lignes bornees, ecritures `RAW`
  pour bloquer l'injection de formules, et suppression des lectures publiques
  directes du frontend.
- Produits/uploads : validations metier, mutations de stock atomiques, retrait
  des routes bulk dangereuses, taille/type/magic bytes verifies, nettoyage des
  fichiers echoues ou remplaces, et URL d'image construite par l'API frontend.
- Commandes/stock : persistance Mongo avant propagation, resultat partiel
  explicite si Sheet/stock echoue, verrou d'envoi et verrou de synchronisation
  partages, suppression de la synchro automatique par chaque onglet navigateur,
  resolution produit/variante exacte, refus des quantites ambiguës et retrait
  du champ generique `Reference` comme faux SKU.
- Frontend : correction de l'ordre des hooks du header, controle de l'identite
  sur les routes utilisateur, erreurs de statut non masquees, parseur de nombres
  localises commun, fonction `extractReference` restauree, nettoyage des DOM
  d'impression et chargement paresseux des pages/PDF.
- Execution/dependances : point d'entree backend conventionnel ajoute, scripts
  racine documentes, packages inutiles retires et dependances maintenues mises a
  jour. L'audit npm racine et backend indique 0 vulnerabilite.
- Tests executes : `npm test` a la racine (build TypeScript backend, 10
  scenarios de contrat DHD/stock, typecheck frontend et build Vite),
  `npm audit --json` dans la racine/backend/frontend, `git diff --check`, scan
  `rg` du code et du bundle, puis test HTTP local production de `/`, CORS et
  `/uploads`.
- Resultats : suite complete reussie; origine autorisee 204, origine refusee
  403, HSTS/CSP/nosniff presents, `X-Powered-By` absent; aucun endpoint/token DHD
  dans le bundle. Le seul audit restant est l'avis React Router sur le mode RSC:
  ce SPA Vite n'utilise ni RSC, ni actions serveur, et aucune version stable
  corrigee n'est disponible a la date de ce journal.
- Limites externes : aucun ordre reel DHD/Sook ni aucune ecriture de staging n'a
  ete lance pour eviter une mutation de production. Il faut encore configurer
  les variables serveur, rotater les anciens secrets, reecrire l'historique Git
  si le depot a ete partage, rendre le Sheet prive, choisir un stockage objet
  persistant pour les images Vercel, verifier le plan cron cinq minutes, puis
  tester et deployer en staging avant la production.
- Decision restante : definir le backfill des anciennes commandes sans tracking
  ou transporteur fiable (D-005), sans en inventer un automatiquement.
- Etat : corrections et preuves locales terminees; validation live/deploiement
  volontairement non effectues.

### Entree 7 — 2026-08-04 — Configuration locale non versionnee

- Objectif : restaurer un environnement backend local sans remettre de secrets
  dans le depot.
- Modification : `back/.env` recree localement avec la connexion fournie et de
  nouveaux secrets JWT/cron de 64 caracteres; fichier retire de l'index Git avec
  `git rm --cached` et confirme comme ignore par `.gitignore`.
- Securite : aucune valeur de secret n'est recopiee dans cette reference. La
  connexion Mongo fournie ayant ete publiee dans la conversation et auparavant
  dans Git, elle reste a rotater avant la production.
- Validation : fichier local present; JWT et secret cron renseignes; controle
  `git check-ignore` reussi; identifiant du Sheet recupere depuis deux copies
  concordantes; ping MongoDB Atlas en lecture reussi sur la base `e-com`.
- Configuration encore manquante : nouvelle `GOOGLE_PRIVATE_KEY`,
  `DHD_API_TOKEN`, et selon les fonctions utilisees
  `SOOK_API_TOKEN` ainsi qu'un webhook protege ou SMTP. L'ancien
  `GOOGLE_SHEET_SYNC_URL` n'est plus consomme par le nouveau backend.
- Etat : demarrage/authentification locale configurables; fonctions
  Sheet/DHD/reset non declarables fonctionnelles tant que leurs nouveaux acces
  ne sont pas fournis et testes.

### Modele pour les prochaines entrees

```text
Date/heure :
Etape :
Anomalies concernees :
Objectif :
Fichiers touches :
Modifications effectuees :
Hypotheses verifiees :
Tests/commandes executes :
Resultats :
Risques ou limites restantes :
Decision prise ou requise :
Etat de l'etape :
Prochaine action exacte :
```

## 14. Etat synthetique courant

```text
Audit                         TERMINE
Reference anti-hallucination  TERMINE
Implementation backend       TERMINEE LOCALEMENT
Migration frontend            TERMINEE LOCALEMENT
Cron Vercel                   CONFIGURE, VALIDATION LIVE RESTANTE
Rotation secrets              A EFFECTUER DANS LES SERVICES
Configuration locale          PARTIELLE; ACCES SHEET/DHD MANQUANTS
Tests contractuels            10 SCENARIOS LOCAUX REUSSIS, STAGING RESTANT
Audit dependances              RACINE/BACK 0; AVIS RSC FRONT NON APPLICABLE
Test securite HTTP             REUSSI LOCALEMENT
Validation staging            NON COMMENCEE
Deploiement corrige            NON COMMENCE
```

Ne pas modifier cet etat synthetique sans mettre a jour les anomalies, les
etapes, la matrice de tests et le journal correspondants.
