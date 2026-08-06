# Reference de correction DHD / ECOTRACK

Derniere mise a jour : 2026-08-06
Etat global : **flux DHD/Sheet corrige et valide localement; deploiement et colis de preuve Production restants**
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

Decision utilisateur du 2026-08-04 : les actions manuelles « Marquer livree »
et « Abandonnee » restent disponibles comme derogations explicites. Elles
modifient le statut metier local/Sheet, jamais `carrierStatus`, qui continue de
representer uniquement la derniere valeur exacte lue chez DHD/Sook.

## 3. Architecture actuelle verifiee

```text
front/src/pages/Orders.tsx -- JWT --> back/src/orders/order.routes.ts
                                      |-- create/order au premier clic
                                      |-- valid/order seulement sur demande explicite
                                      |-- get/orders/status cible/groupe
                                      |-- MongoDB (metier + statut exact)
                                      +-- Google Sheets API (statut exact)

GitHub Actions (5 minutes) -- secret --> route cron backend
```

- Le frontend recharge le Google Sheet via le backend toutes les 10 secondes.
- La creation/validation ECOTRACK est faite uniquement par le backend; aucun
  token transporteur n'est inclus dans le bundle navigateur.
- Apres creation, le backend lit immediatement le statut du tracking cible.
- Le bouton manuel et le cron utilisent `/api/v1/get/orders/status`, groupe par
  compte et par paquets de 100; aucun scan global de `/get/orders` ne subsiste.
- Le scheduler Node est desactive sur Vercel; GitHub Actions appelle la route
  cron protegee toutes les cinq minutes.

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

`Supprimé de DHD` et `Supprimé de Sook` ne sont pas des statuts officiels de
la liste ci-dessus. Ce sont des etats metier locaux explicites, utilises
uniquement lorsqu'une requete `get/orders/status` reussit mais n'inclut plus un
tracking auparavant persiste. Le dernier `carrierStatus` officiel reste
conserve separement et la surveillance continue pour permettre une correction
si le tracking reapparait.

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

- Etat : `[~] route et planification ajoutees; route Production HTTP 200 et run planifie GitHub #24 reussi; transition reelle d'une commande sans navigateur encore a prouver`
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

### B-005 — Critique — Semantique de `valid/order` incorrecte

- Etat : `[~] appel premature retire du premier clic apres preuve live `vers_hub`; suite locale reussie, nouvel essai DHD restant`
- Fichiers : futur client/backend de commandes, frontend.
- Cause initiale : creation et expedition confondues localement; l'appel
  automatique de `valid/order` expedie reellement le colis.
- Decision : le premier clic cree seulement; une future expedition doit etre
  une action distincte et explicite.
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

- Etat : `[x] table exhaustive testee; statut exact conserve separement meme lors d'une derogation manuelle`
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

- Etat : `[~] machine d'etat Mongo atomique unique et stock rendu non bloquant; test d'integration DB/DHD restant`
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

### B-015 — Haute — Tracking supprime chez DHD ignore localement

- Etat : `[~] code/suite et convergence live de seize cas verifies; un cas
  ancien traite par B-017, redeploiement et nouvel essai utilisateur restants`
- Cause : une reponse groupee reussie sans le tracking alimentait seulement
  `notFound`/`lastSyncError`, sans modifier le statut de la commande.
- Correction : ecrire `Supprimé de DHD` ou `Supprimé de Sook` comme statut
  metier local, ne pas falsifier `carrierStatus`, restaurer le stock de facon
  idempotente et continuer les verifications ulterieures.

### B-016 — Haute — « Abandonnée » masque par le statut DHD dans le Sheet

- Etat : `[~] ecriture manuelle et suite locale validees; redeploiement et
  preuve Sheet live restants`
- Cause : la route manuelle transmettait encore l'ancien `carrierStatus`; sans
  colonne transporteur dediee, `order.service.ts` le reecrivait dans la colonne
  principale a la place de `abandoned`.
- Correction : conserver le statut officiel dans Mongo mais ne pas le fournir
  lors d'une ecriture manuelle Sheet.

### B-017 — Haute — Reemission bloquee apres abandon ou suppression DHD

- Etat : `[~] implementation et suite locale validees; redeploiement et preuve
  live restants`
- Preuve : apres suppression manuelle DHD ou abandon local, le clic bleu peut
  retourner HTTP 409 « tracking et statut final » avant de verifier si le
  tracking existe encore chez le transporteur.
- Cause : `sendOrderToCarrier` applique le blocage final sur l'ancien etat
  Mongo avant toute lecture DHD et reutilise un tracking supprime au lieu de
  creer un nouveau colis.
- Correction cible : verifier le tracking existant par les endpoints officiels
  de lecture; le reutiliser s'il existe, archiver puis remplacer uniquement
  s'il est confirme absent ou annule, et permettre la reactivation locale de
  `abandoned` sans autoriser la recreation d'une livraison/retour final.

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

- Etat : `[~] creation et expedition separees dans le code; nouvel essai DHD requis apres test local et redeploiement`
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

- Etat : `[~] route, secret, verrou et horaire ajoutes; route HTTP 200 et run planifie GitHub #24 reussi; changement reel d'une commande page fermee restant`
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

- Etat : `[~] tests/builds locaux, nouveau backend Vercel et frontend local relies; flux DHD/Sheet authentifie staging restant`
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
| Adresse Sheet vide | Commune validee utilisee comme adresse, adresse detaillee preservee | `[x] test contractuel + suite racine` |
| Premier clic de creation | `create/order` sans `valid/order`; statut initial officiel conserve | `[~] contrat/source/suite locale reussis; nouvel essai live restant` |
| Validation/expedition explicite | `valid/order` uniquement sur demande distincte | `[~] backend disponible, aucune action UI exposee` |
| Echec de `valid/order` | Aucun `ready_to_ship` ecrit dans le Sheet | `[~] ordre code teste, integration staging restante` |
| Lecture immediate apres creation/validation explicite | Statut exact DHD lu puis persiste; echec non bloquant repris par cron | `[x] ordre code et fixture source testes; integration DHD restante` |
| Stock local insuffisant/introuvable | Envoi DHD non bloque; avertissement stock separe | `[~] code et build, integration DB/DHD restante` |
| Lot partiellement reussi | Chaque commande garde son propre resultat | `[~] code, test staging restant` |
| 1 tracking | Une synchro ciblee, aucune pagination globale | `[x] test de decoupage local` |
| 100 trackings | Un paquet maximum conforme | `[x] test de decoupage local` |
| 101 trackings | Deux paquets, resultats fusionnes | `[x] test de decoupage local` |
| Tracking supprime/introuvable apres reponse DHD reussie | Etat local `Supprimé de DHD/Sook`, Sheet/Mongo mis a jour, surveillance maintenue | `[~] suite locale + seize convergences live anonymes; preuve du colis utilisateur apres redeploiement restante` |
| Reemission apres suppression/abandon | Tracking existant verifie; absent/annule archive puis remplace; `abandoned` reactuable; aucun doublon sur erreur DHD | `[~] contrat, suite locale et lectures live sans mutation reussis; reemission live restante` |
| Statut inconnu | Statut exact conserve et alerte observable | `[x] fixture locale + code` |
| Statut exact dans Sheet sans colonne dediee | La colonne statut principale recoit la valeur DHD exacte | `[x] structure d'en-tete reelle + fonction testee; ecriture live restante` |
| `suspendu` | Categorie `suspended` | `[x] table testee` |
| Retour intermediaire | Pas de retour final premature | `[x] table testee` |
| Retour final | Categorie `returned` | `[x] table testee` |
| Livraison puis retour ulterieur | La commande livree reste synchronisee jusqu'au retour final | `[~] filtre et test local, cron live restant` |
| Actions manuelles livree/abandonnee | Boutons actifs; statut manuel ecrit dans le Sheet, statut officiel Mongo non falsifie | `[~] correction/test ajoutes, preuve Sheet live restante` |
| 429 | Backoff borne, pas de boucle infinie | `[~] code borne, fixture HTTP restante` |
| Timeout DHD | Erreur par lot/commande, prochain cron possible | `[ ]` |
| Cron sans navigateur | Statut mis a jour | `[~] run planifie #24 vert; commande ayant effectivement change d'etat restante` |
| Deux crons concurrents | Pas de double ecriture/stock | `[~] verrou code, test DB restant` |
| Remarque libre | Aucun changement de statut | `[x] fixture locale` |
| Rechargement page | Transporteur et statut conserves | `[~] hydratation code, test navigateur restant` |
| Appel route sans JWT | 401/403 | `[x] middleware teste localement` |
| Bundle frontend | Aucun token/secret | `[x] scan rg du build` |
| Build front et back | Succes | `[x] 2026-08-06` |

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
| D-001 | Le premier clic doit-il appeler automatiquement `valid/order` ? | `[x] non; preuve live `vers_hub` et contrat « valider et expedier »; creation seule au premier clic` |
| D-002 | Quelle frequence de synchro souhaitee : 1, 2, 5 ou 10 minutes ? | `[x] 5 minutes, reprise du comportement UI existant` |
| D-003 | Le statut exact doit-il etre ajoute dans une nouvelle colonne Sheet ou remplacer `etat` ? | `[x] colonne dediee si elle existe; sinon la colonne etat actuelle recoit le statut DHD exact` |
| D-004 | Faut-il afficher l'historique `activity` dans l'interface ? | `[~] endpoint backend pret; timeline UI non ajoutee faute de decision explicite` |
| D-005 | Quelle strategie de migration pour les commandes existantes sans tracking/transporteur fiable ? | `[ ] a concevoir` |
| D-006 | Conserver « Marquer livree » et « Abandonnee » pour tests/annulation client, y compris sur une commande API ? | `[x] oui; statut metier local et colonne principale Sheet, carrierStatus officiel conserve dans Mongo` |
| D-007 | Que transmettre a DHD lorsque la colonne adresse est vide ? | `[x] utiliser la commune validee; conserver l'adresse detaillee lorsqu'elle existe` |
| D-008 | Comment representer un colis supprime manuellement sur DHD ? | `[x] etat local `Supprimé de DHD/Sook` quand la lecture groupee reussit sans ce tracking; ne jamais l'ajouter aux 19 statuts officiels` |
| D-009 | Comment reagir au clic bleu avec un ancien tracking supprime ou une commande `abandoned` ? | `[x] verifier DHD avant le blocage final; reutiliser un tracking existant, remplacer seulement un tracking confirme absent/annule, autoriser `abandoned`, bloquer les autres fins metier` |

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

### Entree 8 — 2026-08-04 — Correction du deploiement Vercel Hobby

- Symptome verifie : le commit `56b842e` ne contient aucun conflit Git et passe
  tous les builds locaux, mais GitHub publie deux statuts Vercel distincts : le
  projet frontend termine avec succes et le projet backend echoue au
  deploiement.
- Premiere cause : `back/vercel.json` declarait `*/5 * * * *`. Vercel Hobby refuse les
  expressions cron executees plus d'une fois par jour et fait echouer le
  deploiement avant la mise en production du nouveau backend.
- Correction : retrait du cron natif dans `back/vercel.json`; conservation de
  la route protegee et du verrou Mongo; ajout du workflow
  `.github/workflows/order-status-sync.yml`, planifie a `2/5 * * * *`, appelant
  la meme route avec `secrets.CRON_SECRET`. Un HTTP 409 concurrent est traite
  comme une execution deja couverte et non comme une panne.
- Securite : permissions GitHub limitees a `contents: read`; aucun token
  DHD/Sook ni aucune donnee de commande dans le workflow ou ses logs; seul le
  secret cron doit etre duplique dans les coffres Vercel backend et GitHub.
- Documentation : procedure monorepo Vercel et configuration du secret GitHub
  ajoutees au `README.md`.
- Tests : build TypeScript backend, 11 scenarios contractuels dont la garde
  anti-regression Vercel Hobby, typecheck/build frontend, validation JSON et
  `git diff --check` reussis localement.
- Limite externe : le prochain commit doit etre pousse pour obtenir une preuve
  de deploiement backend; le workflow doit ensuite etre lance manuellement une
  premiere fois apres configuration du secret GitHub.

### Entree 9 — 2026-08-04 — Seconde erreur Vercel et boucle 404 frontend

- Preuve utilisateur : `bug.txt` montre `GET /api/orders/sheet` en HTTP 404
  toutes les dix secondes. La route existe dans le nouveau backend mais pas
  dans l'ancien deploiement encore servi.
- Verification externe : le commit `72d0926` produit encore un statut Vercel
  backend en echec et un statut frontend en succes; le retrait du cron a donc
  ferme une premiere erreur sans permettre au backend d'etre remplace.
- Seconde cause : `back/vercel.json` combinait les proprietes incompatibles
  `builds` et `functions`. Vercel rejette cette configuration avant le build.
- Correction backend : migration vers la detection automatique de
  `api/index.ts`, retrait de `builds`, conservation de la route catch-all et de
  `functions.api/index.ts.maxDuration=60`.
- Correction frontend : apres un 404 de `/api/orders/sheet`, le polling est
  arrete au lieu de rappeler indefiniment l'ancien backend; un message demande
  explicitement de redeployer puis recharger la page.
- Test anti-regression : absence simultanee de `builds` et `crons`, duree et
  destination de la fonction verifiees dans le test contractuel.
- Resultats locaux : `npm test`, build TypeScript, 11 scenarios contractuels,
  typecheck/build Vite, validation JSON et `git diff --check` reussis.
- Prochaine preuve requise : pousser ce correctif, verifier les deux statuts
  Vercel verts, puis confirmer que `/api/orders/sheet` retourne 401 sans JWT et
  200 CSV avec un JWT operateur.

### Entree 10 — 2026-08-04 — Diagnostic CLI Vercel et remise en service live

- Symptome : le domaine backend stable continuait de renvoyer 404 sur
  `/api/orders/sheet` apres le push du commit `b5bdc9e`.
- Preuve de deploiement : le statut GitHub/Vercel du backend etait en echec. La
  commande `vercel inspect dpl_5dPhDT4RfrtaYjdX6PTjwyD9wfHD --logs` a montre
  que `npm run build`/`tsc` reussissait, puis que Vercel interrompait le
  deploiement faute de dossier de sortie `public`.
- Cause racine : le projet backend, preset `Other`, utilisait la detection de
  sortie statique et attendait `public`; l'ancien deploiement restait donc lie
  au domaine de production et ne contenait pas la nouvelle route.
- Correction de deploiement : `Output Directory` du projet backend passe a
  `dist`, puis ajout de `outputDirectory: "dist"` dans `back/vercel.json` pour
  rendre le reglage reproductible. Le deploiement production
  `dpl_9S6UkmaL6LR4R28VdDx1pUCuY86v` est `Ready` et contient la fonction
  `api/index`.
- Anomalie suivante observee : les requetes navigateur atteignaient alors la
  route mais le preflight etait refuse en HTTP 403. Les alias du projet
  frontend n'etaient pas correctement couverts par la configuration CORS du
  backend.
- Correction runtime : `CORS_ORIGINS` limite aux alias frontend verifies,
  `FRONTEND_URL` pointe sur l'alias principal, et `UPLOADS_DIR` vaut
  `/tmp/uploads` afin d'eviter l'ecriture dans le systeme de fichiers en lecture
  seule de la fonction. Les valeurs sensibles ne sont pas reproduites ici.
- Preuves live apres redeploiement : origine frontend principale -> preflight
  HTTP 204 avec `Access-Control-Allow-Origin` exact; origine etrangere -> HTTP
  403 sans en-tete CORS; `GET /api/orders/sheet` sans JWT -> HTTP 401
  `Token manquant`, et non plus 404. Les logs du dernier deploiement ne montrent
  plus l'avertissement de creation du dossier uploads.
- Limite restante : le HTTP 200 CSV avec un JWT operateur et la convergence
  DHD/Mongo/Sheet/UI doivent encore etre verifies avec une session autorisee,
  sans afficher de donnee client. Le cron GitHub exige toujours le meme
  `CRON_SECRET` dans GitHub Actions et Vercel.
- Documentation : procedure Vercel completee dans `README.md`.
- Validation locale apres documentation : `npm test` reussi (build TypeScript
  backend, tests contractuels, typecheck et build Vite), JSON Vercel valide et
  `git diff --check` sans erreur. L'avertissement Vite sur deux gros chunks
  reste non bloquant et sans rapport avec cette panne.
- Etat : panne 404/CORS de production fermee avec preuves; validation metier
  DHD de bout en bout toujours ouverte.

### Entree 11 — 2026-08-04 — Correction des HTTP 500 sur les routes authentifiees

- Preuve utilisateur : `erreur console.txt` montre des HTTP 500 simultanes sur
  `/api/orders/sheet`, `/api/products` et `/api/orders/delivery-persons`.
- Verification live : MongoDB se connecte et CORS repond correctement, puis un
  appel en lecture avec un faux Bearer retourne exactement HTTP 500
  `Authentification serveur non configurée`.
- Cause confirmee dans le code actif : `getJwtSecret()` refuse une valeur
  absente ou inferieure a 32 caracteres. L'ancienne valeur Vercel n'etait donc
  plus conforme au controle de securite du backend; les trois routes echouaient
  dans le middleware JWT avant leur controleur respectif.
- Correction de configuration : le `JWT_SECRET` local aleatoire de 64
  caracteres, deja cree et ignore par Git, a ete transmis par stdin vers la
  variable Production Vercel sans affichage ni copie dans un fichier suivi.
  Aucun secret n'est consigne dans ce journal.
- Deploiement : `dpl_EiKids9Emth6gV5buvPkjBXTavP4` est `Ready` et lie au domaine
  backend stable.
- Preuve apres correction : le meme faux Bearer retourne HTTP 401
  `Token invalide`, avec l'origine frontend autorisee, au lieu du HTTP 500. Le
  serveur JWT est donc initialise et refuse correctement un jeton non signe.
- Effet attendu et necessaire : tous les jetons signes par l'ancienne valeur
  sont invalides. L'utilisateur doit actualiser puis se reconnecter afin que le
  login emette un nouveau jeton avec `issuer`, `audience`, expiration et
  `tokenVersion` conformes au code actuel.
- Limite restante : sans identifiants utilisateur, aucun contournement de
  connexion n'a ete tente. Le HTTP 200 authentifie de Sheet/produits/livreurs
  doit etre confirme apres reconnexion; une erreur Sheet eventuelle devra alors
  etre diagnostiquee separement desormais que JWT fonctionne.
- Code fonctionnel modifie : aucun; le controle de securite etait correct. Seuls
  la configuration Vercel et le present suivi/documentation ont ete corriges.
- Validation locale proportionnee : `git diff --check` reussi; aucune suite de
  code relancee puisque les sources et dependances n'ont pas change.

### Entree 12 — 2026-08-04 — Audit local/GitHub/Vercel du HTTP 502 Sheet

- Alignement du code : le depot local, `origin/main`, la branche GitHub lue par
  `git ls-remote` et les builds Vercel backend/frontend pointent tous sur le
  commit `a5d7fec`. Les commits recents ne modifient pas les sources actives
  apres le correctif Vercel; aucun conflit ou ancien code divergent n'explique
  le HTTP 502.
- Backend live : healthcheck HTTP 200, preflight de l'origine frontend HTTP 204
  et faux JWT refuse en HTTP 401. MongoDB, CORS, routage et initialisation JWT
  sont donc verifies independamment de Google Sheets.
- Frontend live : le module `api-B35y0r3-.js` est servi en HTTP 200, contient
  exactement le domaine backend attendu et ne contient aucun appel direct vers
  `platform.dhd-dz.com`.
- Variables Vercel : les noms requis sont presents dans les deux projets et le
  frontend Production ne contient que `VITE_API_BASE_URL` parmi les variables
  Vite; sa valeur effective pointe sur le bon backend. Vercel masque les valeurs
  marquees `sensitive` lors de `env pull`, donc leur contenu ne peut pas etre
  valide par lecture ou recopie depuis le CLI. Les controles live ci-dessus
  valident CORS/JWT/Mongo; le contenu des identifiants Google reste a verifier
  par leur comportement.
- Cause circonscrite : `GET /api/orders/sheet` atteint le controleur, puis
  `getSheetCsv` transforme toute erreur Google en HTTP 502 generique. Les logs
  precedents ne conservaient aucun code securise permettant de distinguer cle
  privee invalide, permission 403, feuille 404, quota ou timeout.
- Instrumentation ajoutee : `googleSheetError.ts` classe uniquement des codes
  publics bornes; `getSheetCsv` journalise et retourne ce code sans message
  brut, identifiant, email, cle ou contenu de commande. Des fixtures couvrent
  configuration absente, cle invalide, 403, 404 et timeout.
- Securite de deploiement : une simulation CLI a revele que `back/.env` local
  ferait partie d'un upload direct. Le deploiement direct a ete annule et
  `.vercelignore` exclut maintenant `back/.env` et ses variantes, tout en
  conservant `back/.env.example`. Une seconde simulation confirme
  `back/.env` absent et `back/api/index.ts` present; les exports temporaires de
  variables ont ensuite ete supprimes de `/tmp`.
- Validation locale : `npm test` reussi (build backend, tests contractuels,
  typecheck et build frontend). Prochaine action : pousser uniquement les
  sources/reference sans `.env`, attendre les deux builds Vercel, puis lire le
  nouveau code d'erreur Google dans les logs live avant toute modification de
  credential.
- Premiere preuve live du commit `54d5b36` : le domaine stable pointe sur le
  deploiement `dpl_EQzaawF34kf8XygNZ2Xfowf5jFaM` `Ready`, et une requete
  authentifiee journalise `sheet_config_missing`. La panne est donc une
  configuration Google vide dans le runtime, pas une erreur de build ou de
  reseau Vercel. Le classifieur est raffine afin de distinguer sans valeur
  affichee l'identifiant Spreadsheet manquant des credentials de compte de
  service manquants.
- Validation du raffinement : `npm --prefix back test` reussi; aucune valeur
  d'environnement n'est incluse dans les fixtures ou les sorties.

### Entree 13 — 2026-08-04 — Audit des variables obligatoires

- Preuve runtime apres deploiement du commit `cb7a597` : une lecture Sheet
  authentifiee journalise `sheet_credentials_missing`. Le code verifie d'abord
  `GOOGLE_SPREADSHEET_ID`, puis exige simultanement
  `GOOGLE_SERVICE_ACCOUNT_EMAIL` et `GOOGLE_PRIVATE_KEY`.
- Deduction bornee : `GOOGLE_SPREADSHEET_ID` passe donc le controle de presence
  et de format. L'audit Vercel precedent a confirme la presence et le format de
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`; la credential actuellement absente du runtime
  Production est par consequent `GOOGLE_PRIVATE_KEY`.
- Audit local sans divulgation de valeur : `back/.env` contient un
  `JWT_SECRET` de 64 caracteres, l'URI Mongo, l'identifiant Spreadsheet,
  l'adresse du compte de service et le secret cron; `GOOGLE_PRIVATE_KEY`,
  `DHD_API_TOKEN`, `SOOK_API_TOKEN`, les variables SMTP/webhook et les variables
  bootstrap admin sont vides. Cet etat local ne doit pas etre confondu avec le
  coffre Production Vercel, ou plusieurs noms sensibles existent mais sont
  masques.
- Variables indispensables au socle Production : `MONGO_URI`, `JWT_SECRET` de
  32 caracteres minimum, origine frontend via `CORS_ORIGINS`/`FRONTEND_URL`, et
  `VITE_API_BASE_URL` dans le projet frontend separe.
- Variables indispensables a Google Sheets : `GOOGLE_SPREADSHEET_ID`,
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`; `GOOGLE_SHEET_NAME`
  utilise `Mirocho` par defaut et doit etre explicite uniquement si l'onglet a
  un autre nom. Le Sheet doit etre partage en editeur avec le compte de service.
- Variables indispensables a ECOTRACK selon le transporteur utilise :
  `DHD_API_TOKEN` pour DHD et `SOOK_API_TOKEN` pour Sook. Les URL ont une valeur
  DHD HTTPS par defaut, mais doivent rester explicites en Production.
- Synchronisation planifiee : `CRON_SECRET` doit avoir exactement la meme valeur
  dans le projet backend Vercel et dans le secret GitHub Actions du depot.
- Reinitialisation du mot de passe : configurer soit le couple webhook
  `GOOGLE_WEBHOOK_URL`/`GOOGLE_WEBHOOK_KEY`, soit le transport SMTP
  `SMTP_USER`/`SMTP_PASS` et une adresse d'expedition. Ces variables ne bloquent
  ni la lecture Sheet ni les appels DHD.
- `GOOGLE_SHEET_SYNC_URL` est obsolete et n'est consommee par aucun fichier
  actif. `PORT` est local; Vercel fournit son propre runtime. Les variables de
  delai, retry, batch et scheduler ont des valeurs par defaut.

### Entree 14 — 2026-08-04 — Installation et validation de la cle Google

- Le fichier fourni `sheetbot-474512-6542303eb64a.json` a ete valide sans
  afficher ses secrets : type `service_account`, projet `sheetbot-474512`,
  adresse de compte de service structurellement valide et cle privee PEM
  complete.
- `client_email` et `private_key` ont ete importes dans `back/.env`; les retours
  a la ligne de la cle sont conserves sous forme `\n`, format accepte par
  `dotenv` et normalise par `SheetSyncService`.
- Le `.gitignore`, trouve vide localement, a ete restaure avec les exclusions
  des `.env`, dependances et builds. La regle `sheetbot-*.json` protege aussi la
  cle Google fournie et ses futures rotations contre un ajout Git accidentel.
- Verification locale sans divulgation : email, cle PEM et identifiant
  Spreadsheet passent leurs controles structurels; `git check-ignore` confirme
  que `back/.env` et le JSON Google sont ignores.
- Preuve externe en lecture seule : authentification du compte de service puis
  lecture de `'Mirocho'!1:1` reussies en HTTP 200; douze colonnes d'en-tete ont
  ete detectees sans journaliser leur contenu. La credential, l'API Sheets,
  l'identifiant, le nom d'onglet et le partage Google sont donc valides.
- Action Production restante : recopier les variables de `back/.env` dans le
  projet backend Vercel pour l'environnement Production, puis redeployer. Le
  fichier `.env` et le JSON ne doivent jamais etre commits ou televerses avec
  les sources.

### Entree 15 — 2026-08-04 — Frontend local relie au nouveau backend Vercel

- Etape : 8. Anomalies surveillees : B-002 et B-012; aucune modification du
  contrat ECOTRACK ni des routes de commandes.
- Le lien Dashboard fourni a ete resolu par `vercel inspect` vers le deploiement
  Production `Ready` et son alias public stable
  `https://the-project2.vercel.app`; le build contient uniquement la fonction
  `api/index`.
- Preuves backend sans mutation : `GET /` retourne HTTP 200 et le preflight de
  `http://localhost:5173` vers `/api/orders/sheet` retourne HTTP 204 avec
  `Access-Control-Allow-Origin` exact.
- Fichier configure : `front/.env`, deja suivi par Git et ne contenant qu'une
  URL publique; seule `VITE_API_BASE_URL` a ete remplacee par l'alias public du
  nouveau backend. Aucun secret frontend et aucun backend local n'ont ete
  ajoutes ou lances.
- Tests : `npm run build` dans `front` reussi; scan du bundle confirme le
  nouveau domaine, l'absence de l'ancien domaine et l'absence d'appel direct a
  `platform.dhd-dz.com`.
- Execution locale : `npm run dev -- --host localhost` demarre Vite sur
  `http://localhost:5173`; une lecture HTTP locale retourne 200 avec le point
  de montage React et le client Vite.
- Limite : aucun flux authentifie ni mutation DHD/Sheet n'a ete execute. Le
  serveur frontend doit rester actif pendant la verification manuelle.

### Entree 16 — 2026-08-04 — Restauration durable du bouton Google Sheets

- Etapes : 6, 7 et 8. Anomalie surveillee : B-012. Objectif : rendre de
  nouveau visible et utilisable le bouton d'acces a la feuille sans placer
  l'identifiant Spreadsheet ni une credential Google dans le bundle frontend.
- Fait verifie dans le code actif : `front/src/pages/Orders.tsx` contenait
  encore le lien, mais son rendu etait conditionne a `VITE_SHEET_EDIT_URL`;
  cette variable est absente de `front/.env`, donc le bouton etait masque. Les
  copies `Orders.tsx.copy` et `front/src/Orders.tmp` n'ont pas ete consultees.
- Contrat verifie : `ECOTRACK API.postman_collection.json` ne definit aucun
  acces Google Sheets; la nouvelle route reste interne a l'application et ne
  modifie aucun endpoint, payload ou statut ECOTRACK/DHD.
- Fichiers touches : `back/src/orders/order.service.ts`,
  `back/src/orders/order.controller.ts`, `back/src/orders/order.routes.ts`,
  `back/tests/ecotrack-contract.test.js`, `front/src/pages/Orders.tsx`,
  `front/src/styles/Orders.css` et `front/.env.example`.
- Modification : ajout de `GET /api/orders/sheet-link`, protege par JWT et par
  les roles `admin`/`confirmateur`. Le backend valide
  `GOOGLE_SPREADSHEET_ID`, construit le lien Google et ne retourne aucune cle
  de compte de service. Le frontend affiche toujours le bouton, recupere le
  lien par la route authentifiee si aucune surcharge Vite valide n'existe,
  puis l'ouvre dans un nouvel onglet.
- Tests : `npm test` dans `back` reussi apres compilation; la fixture verifie
  la construction du lien et la presence des trois couches de la route
  (route, authentification, autorisation). `npm run build` dans `front` reussi
  avec typecheck et build Vite. `git diff --check` reussi. Le scan du bundle
  confirme la presence du bouton et de `/api/orders/sheet-link`, ainsi que
  l'absence des valeurs sensibles du backend.
- Decision : `VITE_SHEET_EDIT_URL` reste une surcharge facultative; elle n'est
  plus requise pour afficher le bouton. Etat : termine localement avec preuves
  reproductibles. Limite : le backend et le frontend doivent tous deux etre
  redeployes avant la validation authentifiee en Production.

### Entree 17 — 2026-08-04 — Transaction DHD, stock non bloquant et retours officiels

- Etapes : 2, 3, 5, 6 et 8. Anomalies : B-002, B-005, B-009, B-010 et
  B-013. Objectif : supprimer les faux `ready_to_ship`, ne jamais bloquer
  l'acceptation DHD a cause du stock local et proteger le statut transporteur
  exact. La restriction des statuts metier manuels de cette entree a ensuite
  ete remplacee par la decision explicite de l'entree 18.
- Contrat relu dans `ECOTRACK API.postman_collection.json` :
  `POST /api/v1/create/order` exige `success:true` et un tracking;
  `POST /api/v1/valid/order` retourne son propre `success`; la source du statut
  exact reste `GET /api/v1/get/orders/status`; un retour peut etre demande par
  un endpoint separe mais aucun webhook de statut n'est documente.
- Cause confirmee : `sendOrderToCarrier` persistait Mongo et le Sheet en
  `ready_to_ship` avant `valid/order`. Une validation refusee laissait donc un
  faux succes dans le Sheet. Les boutons du frontend et `/api/orders/status`
  permettaient aussi une transition locale d'une commande DHD/Sook suivie.
  Enfin, les requetes du cron excluaient les commandes livrees et ne pouvaient
  jamais observer leur passage ulterieur vers un statut de retour.
- Fichiers touches : `back/src/orders/orderApi.controller.ts`,
  `back/src/orders/order.controller.ts`, `back/src/orders/orderStatus.ts`,
  `back/src/orders/orderStatusScheduler.ts`,
  `back/src/orders/orderStatusSync.service.ts`,
  `back/tests/ecotrack-contract.test.js`, `front/src/pages/Orders.tsx` et
  `.github/workflows/order-status-sync.yml`.
- Transaction corrigee : l'ordre est maintenant `create/order`, conservation
  anti-doublon du tracking dans Mongo, `valid/order`, puis seulement apres
  succes persistance du statut dans Mongo et Google Sheets. Un echec de
  validation conserve le tracking et l'erreur pour permettre une reprise sans
  recreer la commande, mais n'ecrit pas `ready_to_ship` dans le Sheet. Le faux
  statut exact `prete_a_expedier` n'est plus invente; le champ exact vient de
  `get/orders/status`.
- Stock : la reconciliation reste apres le succes DHD et apres le Sheet; elle
  autorise les quantites negatives. Une absence de produit/variante ou une
  autre erreur de stock produit un avertissement et `lastSyncError`, mais ne
  transforme plus une commande acceptee en echec HTTP. La restauration reste
  idempotente lors d'un retour officiel.
- Statuts : une commande API avec tracking refuse tout remplacement de
  tracking et changement de transporteur; le navigateur ne peut pas ecrire le
  statut transporteur exact. L'interdiction temporaire des changements de
  statut metier DHD/Sook a ete retiree dans l'entree 18 a la demande de
  l'utilisateur. Les commandes livrees restent candidates au cron afin de detecter
  `retour_chez_livreur`, les retours intermediaires puis le retour final; seuls
  retour final et annulation arretent la surveillance.
- Cron : la cible GitHub Actions utilisait encore l'ancien domaine backend;
  elle pointe maintenant sur `https://the-project2.vercel.app`. Verification
  externe en lecture seule : healthcheck HTTP 200 et route cron sans secret
  refusee en HTTP 401. Aucun appel cron autorise ni mutation DHD/Sheet n'a ete
  execute pendant cette correction.
- Tests : `npm test` dans `back` reussi apres build; 17 scenarios couvrent
  notamment mapping officiel, livraison encore synchronisee, equivalence des
  alias metier, ordre create/valid/Sheet/stock et cible du cron. `npm run build`
  dans `front` reussi avec typecheck et build Vite. `git diff --check` reussi.
- Etat : code termine localement. Limites : le `CRON_SECRET` GitHub doit etre
  identique a celui du backend Vercel; le workflow doit etre lance et observe
  apres le push. La matrice DHD/Sheet/stock exige encore une commande de test
  autorisee avant de declarer le flux Production termine.

### Entree 18 — 2026-08-04 — Conservation des actions manuelles de test et d'abandon

- Etape : 6. Anomalies surveillees : B-009, B-010 et B-013. Decision D-006 :
  l'utilisateur demande explicitement de conserver « Marquer livree » pour les
  tests et « Abandonnee » lorsqu'un client annule apres contact.
- Contrat verifie : la collection documente `delete/order` et
  `ask/for/order/return`, mais ces actions ne correspondent pas automatiquement
  a tous les cas couverts par l'ancien bouton « Abandonnee ». Aucun appel DHD
  de suppression ou de retour n'a donc ete ajoute sans regle metier plus
  precise.
- Fichiers touches : `front/src/pages/Orders.tsx`,
  `back/src/orders/order.controller.ts`, `back/src/orders/orderStatus.ts`,
  `back/tests/ecotrack-contract.test.js` et cette reference.
- Modification : retrait de la desactivation frontend et du refus backend des
  changements de statut metier sur les commandes DHD/Sook. Les deux boutons
  retrouvent leur comportement precedent pour les roles deja autorises. La
  protection contre le remplacement du tracking, le changement de
  transporteur et l'ecriture d'un faux `carrierStatus` reste active.
- Semantique : « Marquer livree » est une derogation locale de test; une
  synchronisation DHD ulterieure peut la remplacer puisque les commandes
  livrees restent surveillees. « Abandonnee » est une annulation metier
  locale/Sheet et ne supprime pas automatiquement une commande deja creee sur
  DHD. Le statut exact DHD reste affiche separement lorsqu'il existe.
- Tests : `npm test` a la racine reussi; build TypeScript backend, 17 scenarios
  contractuels, typecheck et build Vite frontend reussis. La garde verifie la
  presence des deux libelles dans le composant actif et l'absence du blocage
  backend retire.
- Etat : decision appliquee et validee localement. Limite : si l'utilisateur
  souhaite que « Abandonnee » supprime une commande DHD non expediee ou
  demande le retour d'une commande deja expediee, la regle de choix entre les
  deux endpoints doit etre definie et testee separement.

### Entree 19 — 2026-08-06 — Diagnostic des echecs GitHub Actions #4 a #23

- Etape : 5. Anomalie : B-002. Objectif : expliquer les courriels repetes
  `Synchronisation des statuts ECOTRACK` et rendre la cause du prochain echec
  directement observable sans exposer de secret.
- Faits GitHub verifies en lecture seule : l'execution planifiee #23 correspond
  au commit `1c944bb`, s'est terminee en echec le 2026-08-06 et son job `sync`
  a echoue dans l'etape d'appel en trois secondes. Les vingt executions
  planifiees publiques consultees, #4 a #23, sont toutes en echec. Le texte
  detaille des logs n'est pas accessible depuis cette session GitHub non
  authentifiee; il est donc interdit d'affirmer sans preuve si le secret est
  absent ou seulement different.
- Contrat relu dans `ECOTRACK API.postman_collection.json` : la source groupee
  reste `GET /api/v1/get/orders/status`, avec un maximum de 100 trackings par
  requete. Le workflow appelle uniquement la route interne protegee qui utilise
  ce contrat; aucun endpoint ou payload DHD n'a ete invente.
- Recoupement Production : `back/.env` contient un `CRON_SECRET` non vide sans
  que sa valeur ait ete affichee. Un appel autorise a
  `https://the-project2.vercel.app/api/orders/cron/sync-statuses` avec ce secret
  a retourne HTTP 200. Cela prouve que la valeur locale correspond a Vercel et
  que la route de production peut executer la synchronisation. Avec les echecs
  rapides et repetes de GitHub, la configuration fautive restante est donc le
  coffre GitHub Actions : secret `CRON_SECRET` absent ou different.
- Controle local de presence uniquement : les variables DHD et Google Sheets
  requises sont renseignees dans `back/.env`, sans affichage de leur valeur;
  le token Sook facultatif est vide. Cette presence ne prouve pas a elle seule
  la validite de chaque acces externe.
- Fichiers touches : `.github/workflows/order-status-sync.yml`,
  `back/tests/ecotrack-contract.test.js` et cette reference.
- Modification : ajout d'une etape distincte qui echoue avec une annotation
  explicite si le secret GitHub est vide. L'appel classe maintenant sans lire
  ni afficher la valeur du secret : `401` signifie secret GitHub refuse,
  `503` variable absente dans Vercel, `409` execution concurrente deja couverte,
  autre code erreur backend. Un succes publie seulement des compteurs non
  sensibles dans le resume du job; la reponse est stockee dans un fichier
  temporaire supprime en fin d'etape.
- Tests : `npm test` a la racine reussi le 2026-08-06; compilation TypeScript
  backend, test contractuel, typecheck frontend et build Vite reussis.
  `git diff --check` reussi apres cette mise a jour.
- Risque/limite externe : Codex n'est pas authentifie sur le compte GitHub et
  ne peut ni lire ni ecrire la valeur d'un repository secret. Ne jamais copier
  cette valeur dans un commit, un log ou la conversation.
- Decision : ecraser le repository secret GitHub Actions `CRON_SECRET` avec
  exactement la valeur deja presente dans `back/.env` et dans le backend
  Vercel, puis lancer `workflow_dispatch`. Cette action corrige a la fois le
  cas absent et le cas different sans avoir besoin d'exposer l'ancienne valeur.
- Etat : code de diagnostic et route Production valides; B-002 reste ouverte
  tant qu'un run GitHub manuel puis planifie n'est pas vert.
- Prochaine action exacte : GitHub > depot `unitealfa/the-project2` > Settings
  > Secrets and variables > Actions > New repository secret (ou Update) > nom
  `CRON_SECRET` > valeur identique a `back/.env`, puis Actions >
  Synchronisation des statuts ECOTRACK > Run workflow.

### Entree 20 — 2026-08-06 — Flux complet du bouton DHD et statut exact dans le Sheet

> La decision create puis valid de cette entree est remplacee par l'entree 22
> apres la preuve Production `vers_hub` fournie par l'utilisateur.

- Etapes : 2, 3, 4, 5, 6 et 8. Anomalies surveillees : B-002, B-005,
  B-009, B-010, B-013 et B-014. Objectif : garantir que le bouton bleu cree
  puis valide le colis chez DHD avec les donnees officielles et que chaque
  changement DHD, y compris livraison et retours, converge vers Mongo, Sheet
  et interface.
- Contrat relu integralement et extrait de
  `ECOTRACK API.postman_collection.json` : `POST /create/order` accepte les
  champs reference, client, telephones, adresse, code postal, commune, wilaya,
  montant, remarque, produit, stock, quantite, produit a recuperer, boutique,
  type, stop desk, poids, fragile et GPS. Son exemple 422 exige notamment nom,
  telephone, adresse, wilaya, commune, montant et type. Un succes exige
  `success:true` et un tracking; HTTP 200 avec `success:false` reste un refus.
  `POST /valid/order` valide et expedie; `GET /get/orders/status` accepte au
  maximum 100 trackings et documente 19 statuts plus `all`. Aucun webhook de
  statut n'est documente.
- Flux actif confirme : `front/src/main.tsx` importe la page active
  `front/src/pages/Orders.tsx`; le bouton bleu appelle la route JWT
  `POST /api/orders/send`. Le backend fait create, conserve le tracking
  anti-doublon, fait valid, puis seulement apres succes ecrit Mongo/Sheet et
  reconcilie le stock. Les copies interdites n'ont pas ete consultees.
- Ecarts prouves : les flux individuel et groupe inventaient encore une
  wilaya 16, une commune/adresse de secours et un montant `quantite * 1000`
  lorsque les donnees etaient absentes. Apres valid, aucune lecture immediate
  du statut officiel n'etait faite. Enfin, une lecture reelle limitee a la
  ligne d'en-tete du Sheet a trouve 12 colonnes, une seule colonne de statut et
  aucune colonne dediee DHD/ECOTRACK ou « etat du colis »; `carrierStatus`
  etait donc ignore par l'ecriture Google actuelle.
- Fichiers touches : `back/src/orders/orderApi.controller.ts`,
  `back/src/orders/order.controller.ts`, `back/src/orders/order.service.ts`,
  `back/tests/ecotrack-contract.test.js`, `front/src/pages/Orders.tsx` et cette
  reference.
- Creation corrigee : aucune valeur obligatoire n'est plus inventee. Le bouton
  refuse clairement nom, telephone, adresse, wilaya, commune ou montant
  absent/invalide. Une wilaya vide ou inconnue vaut desormais `0`, declenche la
  correction et ne peut plus etre transformee silencieusement en Alger `16`.
  Les valeurs optionnelles disponibles sont transmises :
  second telephone distinct, code postal, quantite, produit a recuperer,
  boutique, poids, fragile et lien GPS. Les logs de l'envoi ne recopient plus
  le payload ni la reponse complete.
- Statut immediat : apres le succes de `valid/order`, le backend appelle
  `get/orders/status` uniquement pour le tracking cree/reutilise. Il conserve
  le statut exact, applique le mapping metier et ecrit ensuite le Sheet. Si DHD
  ne rend pas encore le statut disponible ou si cette lecture echoue, la
  commande deja acceptee reste un succes avec avertissement et le cron reprend.
- Sheet : lorsqu'une colonne transporteur dediee existe, le statut metier reste
  dans la colonne principale et le statut exact va dans la colonne dediee.
  Pour la feuille actuelle qui n'en possede pas, la colonne de statut principale
  recoit directement la valeur exacte DHD, comme demande. Mongo conserve en
  parallele la categorie metier necessaire au stock et aux permissions.
- Interface : ajout du bouton `Actualiser les statuts DHD`. Il envoie seulement
  les commandes ayant tracking et transporteur persiste vers la route groupee
  officielle, recharge ensuite le Sheet et affiche des compteurs sans donnee
  client. Le cron GitHub reste la garantie page fermee; le run planifie #24 a
  ete observe vert, mais aucune transition de colis cible n'a encore ete
  comparee de bout en bout.
- Tests executes : `npm test` a la racine reussi le 2026-08-06 : build
  TypeScript backend, test contractuel backend, typecheck frontend et build
  Vite de production reussis. Le test backend controle le payload, le statut
  Sheet, l'ordre create/valid/getStatus/Sheet/stock, l'absence de fallback
  wilaya/commune/montant et la non-divulgation des details de diagnostic. Le
  test derive directement les 19 statuts depuis la collection et exige un
  mapping pour chacun. `git diff --check` reussi.
- Securite : seule la ligne d'en-tete Google a ete lue et son contenu n'a pas
  ete affiche. Aucun token, tracking reel, valeur de cellule ou donnee client
  n'a ete journalise. Aucun colis reel DHD n'a ete cree ou modifie pendant
  cette correction.
- Etat : implementation locale validee par la suite automatisee. La preuve
  Production exige un colis de test autorise avec comparaison DHD, Mongo,
  colonne statut Google et interface, puis un changement livraison/retour.

### Entree 21 — 2026-08-06 — Commune utilisee lorsque l'adresse est vide

- Etape : 2. Anomalie surveillee : B-005. Decision D-007 explicite de
  l'utilisateur apres le blocage frontend « adresse ».
- Contrat verifie dans `ECOTRACK API.postman_collection.json` :
  `POST /api/v1/create/order` accepte `adresse`, et la fixture HTTP 422 la
  classe parmi les champs valides par ECOTRACK. Aucun endpoint ni format de
  reponse n'est modifie.
- Fichiers touches : `front/src/pages/Orders.tsx`,
  `back/src/orders/orderApi.controller.ts`,
  `back/tests/ecotrack-contract.test.js` et cette reference.
- Modification : le flux individuel et le flux groupe utilisent l'adresse
  detaillee lorsqu'elle existe, sinon la commune deja resolue et validee. Le
  backend applique la meme regle avant le controle des champs obligatoires,
  afin de proteger les appels autres que la page active.
- Test ajoute : adresse vide vers commune, preservation d'une adresse
  detaillee et verification que les deux flux frontend appellent le meme
  resolver. `npm test` a la racine reussi : build TypeScript backend, test
  contractuel, typecheck frontend et build Vite de production. `git diff
  --check` reussi.
- Etat : implementation locale validee; redeploiement frontend et backend puis
  essai d'une commande sans adresse encore requis pour la preuve Production.

### Entree 22 — 2026-08-06 — Premier clic limite a la creation DHD

- Etape : 2. Anomalie : B-005. Preuve Production utilisateur : le premier clic
  place immediatement le colis en `vers_hub` et dans l'onglet « En station ».
- Contrat relu dans `ECOTRACK API.postman_collection.json` :
  `create/order` ajoute la commande au compte; `valid/order` est nomme
  « Expedier une commande », sert a « valider et expedier » et rend ensuite les
  informations non modifiables. `ask_collection=0` signifie uniquement ne pas
  demander de ramassage; il n'annule pas l'expedition.
- Cause confirmee dans le code actif : les flux individuel et groupe envoyaient
  `validate:true`; le backend considerait aussi une valeur absente comme vraie.
- Fichiers touches : `front/src/pages/Orders.tsx`,
  `back/src/orders/orderApi.controller.ts`,
  `back/tests/ecotrack-contract.test.js` et cette reference.
- Modification : les deux flux passent `validate:false`; le backend exige
  desormais `validate === true` pour appeler `valid/order`. Il lit le statut
  officiel juste apres `create/order`, persiste tracking/statut dans
  Mongo/Sheet et conserve `valid/order` uniquement pour une future action
  d'expedition explicite. Les libelles individuels et groupes parlent
  desormais de creation/traitement et non de validation ou d'expedition.
- Test ajoute : le contrat officiel de `valid/order` est relu depuis la
  collection, les deux payloads frontend doivent rester a `false`, et aucun
  appel implicite n'est permis par le backend. `npm test` a la racine reussi :
  build TypeScript backend, test contractuel, typecheck frontend et build Vite
  de production. `git diff --check` reussi.
- Etat : implementation locale validee; redeploiement frontend/backend et
  creation d'un nouveau colis de test requis pour confirmer
  `prete_a_expedier` sur DHD.

### Entree 23 — 2026-08-06 — Suppression DHD et priorité de « Abandonnée » dans le Sheet

- Etapes : 3, 4, 6 et 8. Anomalies : B-015 et B-016. Preuves utilisateur :
  apres suppression manuelle d'un colis encore `prete_a_expedier` sur DHD, une
  actualisation conservait l'ancien statut dans le site et le Sheet; le bouton
  rouge devait aussi rendre `abandoned` visible dans la colonne principale.
- Contrat verifie dans `ECOTRACK API.postman_collection.json` :
  `DELETE /api/v1/delete/order` supprime une commande tant que l'expedition
  n'est pas validee. La liste de `get/orders/status` contient exactement 19
  statuts et aucun statut « supprime ».
- Decision anti-hallucination D-008 : une reponse de statut reussie sans le
  tracking devient l'etat metier local `Supprimé de DHD`/`Supprimé de Sook`;
  cette valeur n'est jamais stockee comme `carrierStatus` officiel. La commande
  reste candidate aux synchronisations suivantes.
- Fichiers touches : `back/src/orders/orderStatus.ts`,
  `back/src/orders/ecotrack.client.ts`,
  `back/src/orders/orderStatusSync.service.ts`,
  `back/src/orders/orderStockReconciliation.service.ts`,
  `back/src/orders/order.controller.ts`, `front/src/pages/Orders.tsx`,
  `back/tests/ecotrack-contract.test.js` et cette reference.
- Modifications : les absences de tracking sont ecrites en lot dans le Sheet,
  persistees dans Mongo et restaurent le stock de facon idempotente. Une
  reapparition du tracking remplace automatiquement cet etat par le statut DHD
  officiel. Pour une action manuelle telle que « Abandonnée », le Sheet recoit
  le statut metier demande sans que l'ancien statut transporteur ne l'ecrase;
  Mongo conserve toujours ce dernier statut officiel separement. Le parseur de
  statut n'accepte une absence de tracking que si la reponse DHD contient un
  champ `data` structurellement valide (objet, ou tableau vide PHP); une
  reponse mal formee echoue au lieu de marquer tous les colis comme supprimes.
- Tests ajoutes : libelles DHD/Sook, absence de mapping officiel, poursuite de
  la surveillance, restauration stock, branche `notFound`, priorite Sheet et
  affichage frontend des etats locaux, ainsi que refus des reponses de statut
  sans `data` ou avec un format inattendu.
- Premier resultat de test : `npm test` a echoue au build backend car
  `Object.hasOwn` n'existe pas dans la bibliotheque TypeScript cible. La
  verification a ete remplacee par
  `Object.prototype.hasOwnProperty.call`, compatible avec la cible actuelle;
  la relance complete a ensuite reussi.
- Tests/commandes executes : `npm test` a la racine reussi apres correction
  (build TypeScript backend, tests contractuels, typecheck frontend et build
  Vite de production); `git diff --check` reussi. L'avertissement Vite sur les
  chunks superieurs a 500 kB est non bloquant et sans rapport avec cette
  correction.
- Etat : implementation et validation locale terminees. B-015 et B-016 restent
  en `[~]` uniquement jusqu'au redeploiement et aux deux preuves live : tracking
  supprime affiche dans le site/Sheet, puis clic « Abandonnée » affiche dans le
  Sheet.

### Entree 24 — 2026-08-06 — Reemission apres suppression DHD ou abandon

- Etapes : 1, 2, 3, 4, 6 et 8. Anomalies : B-015 et B-017.
- Preuves utilisateur : un colis supprime manuellement reste affiche avec son
  ancien etat; apres passage local a `abandoned`, le clic bleu retourne HTTP
  409 « tracking et statut final » au lieu de permettre sa reprise.
- Contrat relu : `GET /api/v1/get/orders/status` recherche jusqu'a 100
  trackings; `GET /api/v1/get/orders` accepte un filtre `tracking`;
  `DELETE /api/v1/delete/order` supprime avant validation. La collection
  documente aussi `POST /api/v1/update/order`, mais ses noms de champs sont
  contradictoires entre la requete principale et ses exemples; aucun appel de
  modification n'est invente sans preuve supplementaire.
- Diagnostic live en lecture seule, sans identifiant ni donnee client : un
  tracking fictif absent retourne HTTP 200 avec `data: []`. Parmi vingt
  commandes DHD recentes, dix-sept trackings ne sont plus retournes; seize ont
  bien converge vers l'etat local supprime et un garde un ancien etat. Il n'y
  a aucune erreur Google Sheet sur ces seize convergences.
- Verification live complementaire avec un tracking fictif : la recherche
  ciblee `GET /api/v1/get/orders` retourne HTTP 200, une structure paginee et
  `data: []`; le parseur strict ajoute correspond donc a la reponse reelle
  d'une absence sans exposer ni modifier une commande.
- Cause confirmee : le blocage `isFinalBusinessStatus` intervient avant la
  verification DHD. De plus, un tracking absent est reutilise par le flux
  d'envoi et son ancien statut sert de fallback.
- Decision D-009 : avant toute reemission, verifier le tracking existant. Une
  absence doit etre confirmee par la lecture groupee puis la recherche ciblee;
  sur panne ou reponse ambigue, ne jamais recreer. Archiver l'ancien tracking
  avant remplacement. `abandoned` est reactuable; livraison et retour finaux
  restent bloques.
- Fichiers touches : `back/src/orders/ecotrack.client.ts`,
  `back/src/orders/orderStatus.ts`, `back/src/orders/order.model.ts`,
  `back/src/orders/orderApi.controller.ts`, `front/src/pages/Orders.tsx`,
  `back/tests/ecotrack-contract.test.js` et cette reference.
- Modifications : ajout d'une recherche ciblee stricte `get/orders` lorsque la
  lecture groupee ne retrouve pas l'ancien tracking. Un tracking confirme
  absent ou officiellement annule est archive (vingt entrees maximum), ses
  metadonnees actives sont effacees, puis un nouveau colis est cree. Un
  `abandoned` dont le tracking existe encore est reactualise depuis son statut
  DHD. Les fins livraison/retour restent bloquees et toute erreur de lecture
  interrompt la reemission avant `create/order`. L'archivage reconcilie aussi
  le stock vers l'etat restaure avant la nouvelle creation; une recreation
  reussie le redebite via la meme machine d'etat idempotente, tandis qu'un
  echec de creation ne laisse plus le stock debite pour un tracking supprime.
- Tests ajoutes : parseur strict de recherche ciblee, matrice des etats
  reemissibles, ordre verification avant garde finale, archivage et indicateur
  de recreation. Premiere execution `npm test` : build backend reussi, puis
  echec d'une ancienne assertion de position qui selectionnait desormais la
  lecture prealable au lieu de la lecture post-creation. L'assertion a ete
  rendue explicite en cherchant la lecture post-validation; relance complete
  effectuee avec succes.
- Tests/commandes executes : `npm test` a la racine reussi apres la correction
  du test (build TypeScript backend, tests contractuels, typecheck frontend et
  build Vite de production). L'avertissement Vite sur les chunks superieurs a
  500 kB est non bloquant et sans rapport avec ce flux.
- Controle final : `git diff --check` reussi; sept fichiers suivis modifies,
  tous limites au client/statuts/commande frontend, tests et cette reference.
- Etat : implementation et validation locale terminees; redeploiement et
  reemission d'un colis de test restent necessaires.

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
Cron Vercel                   RETIRE CAR INCOMPATIBLE AVEC HOBBY
Cron GitHub 5 minutes         ROUTE LIVE HTTP 200; RUN PLANIFIE #24 REUSSI, TRANSITION REELLE RESTANTE
Rotation secrets              A EFFECTUER DANS LES SERVICES
Configuration locale          VARIABLES DHD/SHEET PRESENTES; VALIDATION COMPLETE RESTANTE
Tests contractuels            SUITE RACINE REUSSIE LE 2026-08-06, STAGING RESTANT
Audit dependances              RACINE/BACK 0; AVIS RSC FRONT NON APPLICABLE
Test securite HTTP             REUSSI LOCALEMENT
Validation staging            FLUX COMPLET CORRIGE LOCALEMENT; COLIS TEST DHD/SHEET/STOCK RESTANT
JWT production                CONFIGURE; RECONNEXION ET FLUX AUTHENTIFIE A VALIDER
Deploiement corrige            NOUVEAU BACKEND PRODUCTION READY; FRONT LOCAL RELIE
```

Ne pas modifier cet etat synthetique sans mettre a jour les anomalies, les
etapes, la matrice de tests et le journal correspondants.
