# Reference technique du projet

> **Archive de l'audit initial.** Ce document décrit le code avant les
> correctifs du 2026-08-04 et n'est plus la source de vérité de l'état actif.
> Utiliser `DHD_ECOTRACK_FIX_REFERENCE.md`, le code compilé et les tests. Les
> secrets frontend, le reset statique et la lecture publique du Sheet évoqués
> plus bas ont notamment été retirés.

Derniere analyse locale: 2026-07-06.

Ce fichier sert de reference pour eviter d'inventer des modules, endpoints ou comportements. Il decrit ce qui existe dans le code du depot, pas ce qui devrait idealement exister.

## Vue generale

- Projet fullstack TypeScript/React/MongoDB avec deux apps separees:
  - `front/`: React 18 + Vite + React Router, hebergeable sur Vercel comme SPA.
  - `back/`: Express + Mongoose + TypeScript, hebergeable sur Vercel via `@vercel/node`.
- Le frontend lit directement un Google Sheet public en CSV pour les commandes, puis appelle le backend pour ecrire les statuts/wilaya/commune dans Google Sheets et persister certaines commandes en MongoDB.
- Le backend utilise MongoDB pour utilisateurs, produits et commandes de livraison, et Google Sheets API pour mettre a jour le sheet.
- Le site est prevu pour Vercel:
  - `front/vercel.json`: rewrite `/(.*)` vers `/index.html`.
  - `back/vercel.json`: route tout vers `back/api/index.ts`.
  - `back/api/index.ts`: exporte `app` depuis `back/src/app.ts`.

## Commandes et configuration

- Racine `package.json`: seulement `googleapis`, pas de script utile a part `test` qui echoue volontairement.
- Frontend `front/package.json`:
  - `npm run dev`: Vite.
  - `npm run build`: `vite build`.
  - `npm run preview`: `vite preview`.
  - Dependances principales: React, React Router DOM v7, Chart.js, jsPDF, html2canvas, lucide-react.
- Backend `back/package.json`:
  - `npm run dev`: `ts-node-dev --respawn src/app.ts`.
  - `npm run build`: `tsc`.
  - Dependances principales: Express, Mongoose, bcrypt, JWT, googleapis, nodemailer, multer, pdfkit, axios.
- `front/vite.config.ts`:
  - Proxy `/api` vers `VITE_API_BASE_URL` ou `http://localhost:5000`.
- `front/src/utils/api.ts`:
  - `apiUrl(path)` utilise `VITE_API_BASE_URL` si present, sinon une URL relative.
  - `apiFetch(path, init)` fait `fetch(apiUrl(path), init)`.
- Environnements existants dans le depot: `front/.env` et `back/.env` sont suivis par git selon `git ls-files`.

## Backend

### App Express

Fichier: `back/src/app.ts`.

- Middlewares globaux: `cors()`, `express.json()`, puis middleware qui appelle `connectDB()` sur chaque requete sauf `/favicon.ico`.
- Routes:
  - `GET /favicon.ico`: 204.
  - `GET /`: `{ status: "ok" }`.
  - `POST /update-sheet`: passthrough vers `GOOGLE_SHEET_SYNC_URL` en `application/x-www-form-urlencoded`.
  - `/api/users`: routes utilisateurs.
  - `GET /api/products`: fallback direct qui retourne `[]` en cas d'erreur DB.
  - `/api/products`: routes produits.
  - `GET /api/orders/delivery-persons`: fallback direct qui retourne les users `role: "livreur"`.
  - `/api/orders`: routes commandes.
  - `/uploads`: static depuis `UPLOADS_DIR`, sinon `/tmp/uploads` sur Vercel, sinon `process.cwd()/uploads`.
- Le scheduler de statuts officiels ne demarre pas sur Vercel. Hors Vercel il demarre sauf si `ENABLE_OFFICIAL_STATUS_CRON === "false"`.
- En dev/non-production, `app.listen(PORT || 5000)`.

### MongoDB

Fichier: `back/src/config/db.ts`.

- Connexion Mongoose cachee dans `global.mongoose`, adaptee serverless.
- URI: `MONGO_URI`, puis `MONGODB_URI`, puis fallback local `mongodb://127.0.0.1:27017`.
- Si l'URI n'a pas de DB explicite, `dbName` vaut `e-com`.
- `bufferCommands: false`.
- A la connexion, `ensureAdminExists()` cree un admin par defaut si aucun user `role: "admin"` n'existe:
  - email `admin@gmail.com`
  - creation initiale uniquement via `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` cote serveur
  - role `admin`

### Auth et roles

Fichiers:
- `back/src/middleware/auth.middleware.ts`
- `back/src/middleware/role.middleware.ts`

- Auth via header `Authorization: Bearer <token>`.
- JWT secret requis: `JWT_SECRET`.
- Payload attendu: `id`, `email`, `role`.
- `authorizeRole(roles)` refuse si `req.user` absent ou role non inclus.

### Users

Fichiers:
- `back/src/users/user.schema.ts`
- `back/src/users/user.model.ts`
- `back/src/users/user.dto.ts`
- `back/src/users/user.service.ts`
- `back/src/users/user.controller.ts`
- `back/src/users/user.routes.ts`
- `back/src/users/verificationCode.model.ts`

Modele `User`:
- `firstName`, `lastName`, `email`, `password`, `role`.
- Roles schema: `admin`, `gestionnaire`, `confirmateur`, `livreur`.

DTO backend `CreateUserDto`:
- Role autorise par type TS: `gestionnaire | confirmateur`.
- Attention: le frontend autorise aussi `livreur` dans son type, donc il y a un decalage TypeScript entre front et back. Le schema Mongo accepte bien `livreur`.

Endpoints:
- `POST /api/users/login`: public. Retourne les infos user sans password + `id` + `token`.
- `POST /api/users/forgot-password`: public. Cree un code de verification pour l'admin.
- `POST /api/users/verify-code`: public. Si le code valide est fourni, applique le mot de passe temporaire configure par `ADMIN_RESET_PASSWORD` cote serveur.
- `POST /api/users/create`: JWT + admin.
- `GET /api/users`: JWT + admin.
- `GET /api/users/:id`: JWT, autorise admin ou soi-meme.
- `PUT /api/users/:id`: JWT + admin.
- `DELETE /api/users/:id`: JWT + admin, refuse de supprimer un admin.

Reset password:
- `VerificationCode` est stocke dans collection `verification_codes`, avec `userId`, `code`, `expiration`, timestamps.
- Code a 6 chiffres, expiration 15 minutes.
- Envoi par `GOOGLE_WEBHOOK_URL` si configure, sinon SMTP.
- Le code contient des valeurs fallback de webhook/SMTP et des secrets hardcodes; ne pas les recopier dans docs publiques.

### Products

Fichiers:
- `back/src/products/product.schema.ts`
- `back/src/products/product.model.ts`
- `back/src/products/product.service.ts`
- `back/src/products/product.controller.ts`
- `back/src/products/product.routes.ts`

Modele `Product`:
- `code`: string, default `""`.
- `name`: requis.
- `costPrice`: number min 0.
- `salePrice`: number min 0.
- `image`: string, default `""`.
- `variants`: tableau `{ name: string, quantity: number }`.
- timestamps actives.

Routes:
- `GET /api/products`: JWT, liste.
- `POST /api/products`: JWT admin/gestionnaire, upload `image`, creation.
- `GET /api/products/:id`: JWT.
- `PUT /api/products/:id`: JWT admin/gestionnaire, upload `image`.
- `DELETE /api/products/:id`: JWT admin/gestionnaire.
- `POST /api/products/decrement-bulk`: JWT admin/gestionnaire/confirmateur, decrement sans stock negatif.
- `POST /api/products/decrement-bulk-allow-zero`: decrement avec clamp a 0.
- `POST /api/products/decrement-bulk-allow-negative`: decrement et stock negatif autorise.
- `POST /api/products/increment-bulk`: increment.

Upload:
- Multer disque.
- Dossier `UPLOADS_DIR`, sinon `/tmp/uploads` sur Vercel, sinon `process.cwd()/uploads`.
- Les images sont exposees comme `/uploads/<filename>`.

Service produit:
- Creation/update sanitize les variantes; si aucune variante valide, ajoute `{ name: "default", quantity: 0 }`.
- Recherche produit pour stock par `code` exact, puis `name` exact insensible casse, puis fallback regex/normalisation accents.
- Recherche variante par nom normalise sans accents.

### Orders

Fichiers:
- `back/src/orders/order.model.ts`
- `back/src/orders/order.routes.ts`
- `back/src/orders/order.controller.ts`
- `back/src/orders/order.service.ts`
- `back/src/orders/orderStatusSync.service.ts`
- `back/src/orders/orderStatusScheduler.ts`
- `back/src/orders/orderStockUtils.ts`

Modele `OrderDelivery`:
- `rowId`: unique requis.
- `status`: requis.
- `tracking`: optionnel.
- `deliveryType`: `api_dhd | api_sook | livreur`, default `api_dhd`.
- `deliveryPersonId`, `deliveryPersonName`: optionnels.
- `row`: `Mixed`, contient la ligne Google Sheet.
- timestamps.

Routes:
- `POST /api/orders/status`: met a jour le statut Google Sheets, upsert Mongo, ajuste stock si delivered/returned.
- `POST /api/orders/wilaya-commune`: met a jour wilaya/commune dans Google Sheets.
- `POST /api/orders/sync-statuses`: synchro statuts officiels DHD/Sook pour une liste.
- `GET /api/orders/delivery-persons`: liste users livreurs.
- `GET /api/orders/delivery-person/orders`: toutes les commandes livreur pour admin.
- `GET /api/orders/delivery-person/:deliveryPersonId/orders`: commandes actives d'un livreur.
- `GET /api/orders/delivery-person/:deliveryPersonId/history`: historique final d'un livreur.
- `GET /api/orders/bordereau/:orderId`: PDF bordereau.

Google Sheets service `order.service.ts`:
- Spreadsheet hardcode: `1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q`.
- Sheet hardcode: `Mirocho`.
- Colonne statut hardcode: `L`.
- Lit la ligne d'en-tetes et cache 5 minutes.
- Resout les colonnes par noms candidats:
  - tracking: `Tracking`, `Numéro de suivi`, `AWB`, etc.
  - type livraison: `Type de livraison`, `Mode de livraison`, etc.
  - wilaya: `Wilaya`, `Wilaya destination`, etc.
  - commune: `Commune`, `Ville`, etc.
- Met a jour via Google Sheets `batchUpdate`.
- Contient un compte service Google et une cle privee hardcodes. C'est un risque de securite actuel.

`updateOrderStatus`:
- Requiert `rowId` et `status`.
- Normalise `deliveryType`: `livreur`, `api_sook`, `api_dhd`, sinon garde l'ancien type ou `api_dhd`.
- Si `deliveryType === "livreur"`, exige un `deliveryPersonId` valide ou reprend celui existant.
- Appelle `sheetService.updateStatus()`.
- Upsert `OrderDelivery` par `rowId`.
- Si nouveau statut delivered/livree et ancien statut pas delivered: decremente stock automatiquement de facon asynchrone.
- Si nouveau statut returned/retours et ancien statut delivered: reincremente stock automatiquement.

PDF bordereau:
- Endpoint `GET /api/orders/bordereau/:orderId`.
- Cherche par `rowId` ou `_id`.
- Format PDFKit 105mm x 148mm.
- Essaie la police `back/assets/fonts/NotoSansArabic-Regular.ttf`, mais ce fichier n'apparait pas dans `git ls-files`.
- Nettoie telephone, produit, montant, adresse, wilaya, commune et remarque depuis `order.row`.

Synchro statuts officiels:
- `orderStatusSync.service.ts` utilise Axios.
- APIs:
  - DHD base par `DHD_API_URL` ou `https://platform.dhd-dz.com`.
  - Sook base par `SOOK_API_URL` ou DHD base.
  - Chemin commandes: `/api/v1/get/orders`.
- Tokens fallback hardcodes dans le code. Risque de securite actuel.
- Groupe les commandes par `api_dhd` / `api_sook`; ignore `livreur`.
- Cherche par tracking ou reference normalises.
- Scanne jusqu'a `MAX_PAGES_TO_SCAN = 250`.
- Timeout 10s.
- Rate limit delay par `DHD_RATE_LIMIT_DELAY_MS`, default 1500ms.
- Retry 429 jusqu'a `DHD_RATE_LIMIT_RETRIES`, default 3.
- Mappe les statuts officiels vers sheet:
  - livre/livree/delivered/arabe livraison -> `livrée`.
  - retour/refus/returned/arabe retour -> `retours`.
  - expedition/livraison/en cours -> `SHIPPED`.
  - annule/canceled/arabe annulation -> `abandoned`.
- Apres update sheet, ajuste le stock si delivered ou returned.

Scheduler:
- `orderStatusScheduler.ts` ne traite que les commandes non livreur avec tracking, statut non final.
- Statuts finaux: delivered/livree/returned/retours/abandoned/annulee/canceled/cancelled.

Stock automatique commandes:
- `orderStockUtils.ts` extrait produit, variante et quantite depuis une ligne sheet.
- Cherche plusieurs cles possibles: produit/product/article, variante/taille/couleur, code/SKU/reference, quantite.
- Supporte labels produit avec variante entre parentheses, crochets ou separateur `/`, `-`, `:`, `|`.
- Comparaison flexible accents/casse; garde specialement l'arabe.
- Pour delivered: decremente et autorise les stocks negatifs.
- Pour retour: reincremente.
- Les erreurs de stock ne bloquent pas le changement de statut; elles sont loggees.

## Frontend

### Routing et auth

Fichiers:
- `front/src/main.tsx`
- `front/src/context/AuthContext.tsx`
- `front/src/components/PrivateRoute.tsx`
- `front/src/components/ProtectedLayout.tsx`
- `front/src/components/Header.tsx`

Routes:
- `/`: `Login`.
- Admin:
  - `/admin/:id`: dashboard admin.
  - `/admin/:id/team`: equipe.
  - `/admin/:id/create-user`: creation user.
  - `/admin/:id/users/:userId`: detail user.
  - `/admin/:id/users/:userId/edit`: edition user.
  - `/admin/:id/orders`: commandes.
  - `/admin/:id/livreurs`: commandes livreurs.
  - `/admin/:id/products`: produits.
- Gestionnaire:
  - `/gestionnaire/:id`: page simple.
  - `/gestionnaire/:id/products`: produits.
- Confirmateur:
  - `/confirmateur/:id`: page d'accueil confirmateur.
  - `/confirmateur/:id/orders`: commandes.
- Livreur:
  - `/livreur/:id`: commandes assignees.
  - `/livreur/:id/history`: historique.

Auth:
- `AuthContext` stocke `user` et `token` dans `localStorage`.
- `PrivateRoute` verifie presence user, role, et `ownPage` si necessaire.
- `Header` affiche navigation selon role:
  - admin: Accueil, Commandes, Produits, Mon livreur, menu Mon equipe.
  - gestionnaire: Accueil, Produits.
  - confirmateur: Accueil, Commandes.
  - livreur: Mes Commandes, menu Mon historique.

### Login

Fichier: `front/src/pages/Login.tsx`.

- Login via `POST /api/users/login`.
- Redirection par role apres login:
  - admin -> `/admin/:id`
  - gestionnaire -> `/gestionnaire/:id`
  - confirmateur -> `/confirmateur/:id`
  - livreur -> `/livreur/:id`
- Modal mot de passe oublie:
  - `POST /api/users/forgot-password`
  - `POST /api/users/verify-code`

### Admin dashboard

Fichier: `front/src/pages/Admin.tsx`.

- Lit le meme Google Sheet en CSV.
- Charge les produits via `/api/products`.
- Calcule ventes, couts, benefice, frais livraison, buckets de statuts, villes, graphiques.
- Tarifs livraison hardcodes par wilaya dans `DELIVERY_TARIFFS`.
- Filtres temporels: all/day/week/month/customMonth/year.
- Utilise `dateHelpers.ts` pour parser les dates sheet.
- Utilise Chart.js.

### Team/users

Fichiers:
- `front/src/pages/Team.tsx`
- `front/src/pages/CreateUser.tsx`
- `front/src/pages/UserDetail.tsx`
- `front/src/pages/EditUser.tsx`

- `Team`: liste `/api/users`, supprime via `DELETE /api/users/:id`, bloque visuellement suppression admin.
- `CreateUser`: admin seulement, `POST /api/users/create`; options role incluent gestionnaire, confirmateur, livreur.
- `UserDetail`: admin seulement, `GET /api/users/:userId`.
- `EditUser`: admin seulement, `GET` puis `PUT /api/users/:userId`; peut envoyer un nouveau password.

### Products

Fichier: `front/src/pages/Products.tsx`.

- Charge `/api/products` avec JWT.
- Admin/gestionnaire peuvent creer, modifier, supprimer.
- Confirmateur peut voir mais `canEdit` est faux.
- FormData pour create/update:
  - `code`, `name`, `costPrice`, `salePrice`, `variants` JSON, `image` optionnelle.
- Affiche image via `apiUrl(product.image)`.
- Variantes modifiables `{ name, quantity }`.

### Orders

Fichier principal: `front/src/pages/Orders.tsx` (environ 6228 lignes).

Fonctions principales confirmees:
- Parse CSV custom avec gestion guillemets et CRLF.
- Sheet ID hardcode: `1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q`.
- URL CSV: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&cacheBust=${Date.now()}`.
- Reconstruit des lignes `OrderRow` et ajoute `id-sheet` selon index sheet.
- Normalise/cree des en-tetes requis comme `Nom du client`, `Numero`, `ID`, `id-sheet`.
- Statut lu depuis plusieurs colonnes possibles et stocke aussi en `etat`.
- Pagination: `PAGE_SIZE = 100`.
- Filtres: recherche, statut, jour/semaine/mois, produit.
- Selection multi-lignes.
- Commentaires locaux stockes dans `localStorage` sous `order-comments`.
- Cache produits cote client pour stock.
- Selection transporteur/livreur par ligne via `DeliveryCell`.
- Commune/wilaya:
  - Affichage et correction via `SearchableSelect`, `CommuneSelectionModal`, `CommuneCorrectionModal`.
  - Update sheet via `POST /api/orders/wilaya-commune`.
- Statuts:
  - `syncStatus` appelle `SHEET_SYNC_ENDPOINT`, default `/api/orders/status`.
  - `handleUpdateRowStatus` met a jour localement puis backend.
- Envoi transporteur:
  - DHD et Sook sont appeles directement depuis le navigateur avec `fetch`.
  - Config DHD/Sook dans `Orders.tsx`, avec base URL et tokens fallback hardcodes.
  - Endpoint creation: `/api/v1/create/order`.
  - Endpoint tracking: `/api/v1/get/tracking/info`.
  - Endpoint updates: `/api/v1/get/maj`.
  - Si transporteur `livreur`, pas d'appel API externe; statut/backend recoivent `deliveryType: "livreur"` et `deliveryPersonId`.
- Stock:
  - Avant envoi API, tente de decremeter via `/api/products/decrement-bulk-allow-negative`.
  - Si echec stock, la commande peut quand meme etre envoyee avec alerte.
  - Restauration via `/api/products/increment-bulk`.
  - `handleDelivered` utilise aussi decrement-bulk-allow-negative.
- Synchro officielle:
  - Effet periodique toutes les 5 minutes (`OFFICIAL_STATUS_SYNC_INTERVAL_MS`).
  - Appelle `/api/orders/sync-statuses`.
  - Peut se desactiver si erreur reseau.

Attention:
- `Orders.tsx` duplique beaucoup de logique deja presente backend: mapping statuts DHD, extraction produit/variante, wilaya/commune, payload API livraison.
- Les tokens transporteurs existent cote frontend; c'est visible aux utilisateurs.
- Les appels API transporteur depuis navigateur peuvent dependre de CORS.

### Livreur

Fichiers:
- `front/src/pages/DeliveryPerson.tsx`
- `front/src/pages/DeliveryHistory.tsx`
- `front/src/pages/AdminDeliveryOrders.tsx`

`DeliveryPerson`:
- Charge `/api/orders/delivery-person/:user.id/orders`.
- Filtre les commandes deja completes.
- Actions:
  - Valider -> `POST /api/orders/status` avec `status: "delivered"`, `deliveryType: "livreur"`.
  - Retour -> `status: "returned"`.
- Bordereau:
  - Telecharge via `GET /api/orders/bordereau/:orderId`.
  - Utilise aussi `html2canvas`/`jspdf` pour certaines actions de capture.

`DeliveryHistory`:
- Charge `/api/orders/delivery-person/:user.id/history`.
- Filtres: all/delivered/returned + recherche.

`AdminDeliveryOrders`:
- Charge `/api/orders/delivery-person/orders`.
- Affiche les commandes livreur visibles, selection, impression PDF/capture.
- Filtre certains statuts via `shouldDisplayStatus`.

### Confirmateur et Gestionnaire

- `front/src/pages/Confirmateur.tsx`: page d'accueil confirmateur, lit le CSV et propose lien vers commandes.
- `front/src/pages/Gestionnaire.tsx`: page simple avec lien produits.

### Composants partages

- `Header.tsx`: navigation role-based et menu profil.
- `PrivateRoute.tsx`: garde de routes.
- `ProtectedLayout.tsx`: header + outlet.
- `SearchableSelect.tsx`: select custom avec recherche, clavier, click outside.
- `DeliverySelection.tsx`: selection DHD/Sook/livreur, charge `/api/orders/delivery-persons`.
- `DeliveryCell.tsx`: select compact par ligne commande.
- `CommuneSelectionModal.tsx`: choix commune quand resolution impossible.
- `CommuneCorrectionModal.tsx`: correction wilaya/commune apres erreur API.

### Utils donnees

`front/src/utils/communes.ts`:
- Importe `communes.generated.json`.
- Normalise francais/arabe.
- `resolveCommuneName(communeName, wilayaName?, wilayaCode?)`.
- `getFrenchForDisplay`.
- `getFrenchWilaya`.
- `getCommunesByWilaya`.
- `getWilayaIdByCommune`, fallback `16` (Alger).
- Cas special: mentions bureau/DHD peuvent retourner `bureau dhd` ou une wilaya/commune canonique.

`front/src/utils/communes.generated.json`:
- Donnees generees:
  - `byCode`: 1599 entrees.
  - `arToFr`: 1510 entrees.
  - `frToFr`: 1512 entrees.
  - `byArWithWilaya`: 1580 entrees.
  - `byFrWithWilaya`: 1599 entrees.

`front/src/utils/wilayas.generated.json`:
- Contient `byCode` et `arToCode` pour les wilayas.

`front/src/utils/dateHelpers.ts`:
- Parse dates Google Sheet.
- Supporte dates Excel serial.
- Heuristiques DD/MM vs MM/DD selon telephone et presence arabe.
- `extractRowDate(row)` cherche d'abord `date`, `Date`, `Date de commande`, etc.

## Fichiers racine, donnees et scripts

Fichiers actifs ou de donnees:
- `communes_fr.json`, `communes_arabe.json`, `communes fr json.json`, `commune arabe json.json`: sources de generation communes.
- `tipaza_communes.json`, `tipaza_dump.txt`, `empty_communes.json`, `empty_ar_list.txt`, `algiers_audit_result.csv`: fichiers d'audit/donnees communes.
- `documentation suivi des commandes.txt`: documentation API livraison "suivi des commandes".
- `probleme erreru vercel.csv`: logs Vercel historiques montrant notamment l'erreur `mkdir '/var/task/uploads'`.
- `debuglogs.txt`: logs/debug CSV.

Fichiers de sauvegarde/temporaires:
- `Orders.tsx`: fichier racine vide selon `wc -l` et non utilise par Vite.
- `Orders.tsx.copy`: grosse copie JavaScript/TSX de commandes, non importee par le frontend actuel.
- `front/src/Orders.tmp`: copie temporaire avec BOM, non importee par le routing actuel.

Scripts `scripts/`:
- `generate-communes.js`: genere `front/src/utils/communes.generated.json` depuis les JSON communes FR/AR.
- `generate-wilayas.js`: fichier detecte binaire/avec octet nul par `rg`; a verifier avant usage.
- `test-communes.js`, `quick-test.js`, `debug-communes.js`, `analyze-failures.js`: tests/audits de resolution commune/wilaya.
- `add-new-wilayas-communes.js`, `fix-communes-format.js`, `fix-nador.js`, `patch-communes.js`: patchent `communes.generated.json`.
- `dump-tipaza.js`, `print-tipaza.js`: extraction Tipaza.
- `find-empty-ar.js`, `list-empty-to-file.js`: detectent communes sans nom arabe.
- `algiers-audit.js`: audit Alger depuis sources FR/AR.

## Points importants a ne pas halluciner

- Il n'y a pas de `server.ts` actif dans le backend actuel; `back/src/app.ts` est l'entree Express et `back/api/index.ts` l'entree Vercel.
- Il n'y a pas de suite de tests configuree a la racine; les scripts communes sont des scripts Node manuels.
- Le backend ne protege pas les routes `/api/orders/*` avec JWT dans `order.routes.ts`; elles sont montees telles quelles.
- Le frontend appelle certaines APIs externes DHD/Sook directement, pas seulement via backend.
- Le Google Sheet est hardcode dans le front et dans le backend.
- Les statuts ne sont pas uniformises partout: on trouve `delivered`, `livrée`, `livree`, `returned`, `retours`, `SHIPPED`, `abandoned`, etc.
- Le role `livreur` existe dans schema, frontend et plusieurs pages; le DTO TS backend de creation ne l'inclut pas mais le schema Mongo l'accepte.
- Le fichier de police arabe attendu pour PDF n'est pas suivi dans git d'apres `git ls-files`.
- Il existe des secrets/tokens/cles dans le code et possiblement dans `.env` suivis par git; ne pas les exposer davantage et prevoir rotation si ce projet est public.

## Ordre conseille avant modification

1. Lire ce fichier.
2. Si la modification touche commandes: lire `front/src/pages/Orders.tsx`, `back/src/orders/order.controller.ts`, `back/src/orders/order.service.ts`, `back/src/orders/orderStatusSync.service.ts`, `back/src/orders/orderStockUtils.ts`.
3. Si la modification touche stock: lire aussi `back/src/products/product.service.ts` et `front/src/pages/Products.tsx`.
4. Si la modification touche auth/users: lire `AuthContext.tsx`, `PrivateRoute.tsx`, `back/src/users/*`.
5. Si la modification touche Vercel/upload: lire `back/src/app.ts`, `back/src/products/product.routes.ts`, `back/vercel.json`, `front/vercel.json`.
