const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  assertEcotrackSuccess,
  chunkTrackings,
  parseStatusResponse,
  parseTrackingActivity,
} = require('../dist/src/orders/ecotrack.client.js');
const {
  businessStatusesEqual,
  isFinalBusinessStatus,
  mapCarrierStatus,
  shouldContinueOfficialStatusSync,
} = require('../dist/src/orders/orderStatus.js');
const {
  authenticateJWT,
} = require('../dist/src/middleware/auth.middleware.js');
const {
  extractProductInfo,
} = require('../dist/src/orders/orderStockUtils.js');
const {
  classifyGoogleSheetError,
} = require('../dist/src/orders/googleSheetError.js');
const {
  getSheetEditUrl,
} = require('../dist/src/orders/order.service.js');
const orderRouter = require('../dist/src/orders/order.routes.js').default;

test('les routes protegees refusent une requete sans JWT', () => {
  let statusCode = 200;
  let body;
  let nextCalled = false;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  authenticateJWT(
    { headers: {} },
    response,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(statusCode, 401);
  assert.equal(body.message, 'Token manquant');
  assert.equal(nextCalled, false);
});

test('Google Sheets: les erreurs sont classifiees sans exposer les secrets', () => {
  assert.equal(
    classifyGoogleSheetError(new Error('GOOGLE_SPREADSHEET_ID doit être configuré.')),
    'sheet_spreadsheet_id_missing'
  );
  assert.equal(
    classifyGoogleSheetError(
      new Error(
        'GOOGLE_SERVICE_ACCOUNT_EMAIL et GOOGLE_PRIVATE_KEY doivent etre configures.'
      )
    ),
    'sheet_credentials_missing'
  );
  assert.equal(
    classifyGoogleSheetError(Object.assign(new Error('error: DECODER routines::unsupported'), {
      code: 'ERR_OSSL_UNSUPPORTED',
    })),
    'sheet_credentials_invalid'
  );
  assert.equal(
    classifyGoogleSheetError({ response: { status: 403 } }),
    'sheet_forbidden'
  );
  assert.equal(
    classifyGoogleSheetError({ response: { status: 404 } }),
    'sheet_not_found'
  );
  assert.equal(
    classifyGoogleSheetError({ code: 'ETIMEDOUT' }),
    'sheet_timeout'
  );
});

test("Google Sheets: le lien d'edition est construit cote backend", () => {
  const previousSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  process.env.GOOGLE_SPREADSHEET_ID = 'spreadsheet_fixture_1234567890';
  try {
    assert.equal(
      getSheetEditUrl(),
      'https://docs.google.com/spreadsheets/d/spreadsheet_fixture_1234567890/edit'
    );
  } finally {
    if (previousSpreadsheetId === undefined) {
      delete process.env.GOOGLE_SPREADSHEET_ID;
    } else {
      process.env.GOOGLE_SPREADSHEET_ID = previousSpreadsheetId;
    }
  }
});

test("Google Sheets: la route du lien d'edition est protegee", () => {
  const routeLayer = orderRouter.stack.find(
    (layer) => layer.route?.path === '/sheet-link'
  );
  assert.ok(routeLayer, 'route /sheet-link absente');
  assert.equal(routeLayer.route.methods.get, true);
  assert.equal(routeLayer.route.stack.length, 3);
});

test('ECOTRACK: HTTP 200 avec success:false reste un echec metier', () => {
  assert.throws(
    () => assertEcotrackSuccess({ success: false, message: 'refuse' }),
    /refuse/
  );
});

test('ECOTRACK: un succes de creation doit contenir un tracking', () => {
  assert.throws(
    () => assertEcotrackSuccess({ success: true }, { requireTracking: true }),
    /sans retourner de tracking/
  );
  assert.equal(
    assertEcotrackSuccess(
      { success: true, tracking: '  TEST-TRACKING  ' },
      { requireTracking: true }
    ).tracking,
    'TEST-TRACKING'
  );
});

test('ECOTRACK: lots de 1, 100 et 101 trackings sans depasser le contrat', () => {
  assert.deepEqual(chunkTrackings(['A']), [['A']]);
  assert.deepEqual(chunkTrackings(Array.from({ length: 100 }, (_, i) => `T${i}`)).map((x) => x.length), [100]);
  assert.deepEqual(chunkTrackings(Array.from({ length: 101 }, (_, i) => `T${i}`)).map((x) => x.length), [100, 1]);
  assert.throws(() => chunkTrackings(['A'], 101), /entre 1 et 100/);
});

test('ECOTRACK: le schema groupe data[tracking].status est parse sans heuristique', () => {
  const parsed = parseStatusResponse({
    data: {
      'eco-1': { status: 'en_preparation', activity: [{ status: 'picked' }] },
      invalid: 'not-an-object',
    },
  });
  assert.equal(parsed.size, 1);
  assert.equal(parsed.get('ECO-1').status, 'en_preparation');
  assert.equal(parsed.get('ECO-1').activity[0].status, 'picked');
});

test('tracking/info: seule la liste activity est exposee comme historique', () => {
  const activity = [{ date: '2021-03-05', status: 'picked' }];
  assert.deepEqual(
    parseTrackingActivity({ recipientName: 'fixture', activity }),
    activity
  );
  assert.deepEqual(parseTrackingActivity({ status: 'en_livraison' }), []);
});

test('mapping exhaustif des statuts officiels fournis par la collection', () => {
  const table = {
    prete_a_expedier: 'ready_to_ship',
    en_ramassage: 'SHIPPED',
    en_preparation_stock: 'SHIPPED',
    vers_hub: 'SHIPPED',
    en_hub: 'SHIPPED',
    vers_wilaya: 'SHIPPED',
    en_preparation: 'SHIPPED',
    en_livraison: 'SHIPPED',
    suspendu: 'suspended',
    livre_non_encaisse: 'livrée',
    encaisse_non_paye: 'livrée',
    paiements_prets: 'livrée',
    paye_et_archive: 'livrée',
    retour_chez_livreur: 'RETURN_IN_PROGRESS',
    retour_transit_entrepot: 'RETURN_IN_PROGRESS',
    retour_en_traitement: 'RETURN_IN_PROGRESS',
    retour_recu: 'retours',
    retour_archive: 'retours',
    annule: 'abandoned',
  };
  for (const [carrierStatus, expected] of Object.entries(table)) {
    assert.equal(mapCarrierStatus(carrierStatus), expected, carrierStatus);
  }
});

test('une remarque ou un statut inconnu ne devient jamais un statut metier', () => {
  assert.equal(mapCarrierStatus('Livraison avant 17h, appeler le client'), null);
  assert.equal(mapCarrierStatus('nouveau_statut_non_documente'), null);
});

test('seuls les etats metier finaux ferment la synchronisation', () => {
  assert.equal(isFinalBusinessStatus('livrée'), true);
  assert.equal(isFinalBusinessStatus('retours'), true);
  assert.equal(isFinalBusinessStatus('abandoned'), true);
  assert.equal(isFinalBusinessStatus('SHIPPED'), false);
  assert.equal(isFinalBusinessStatus('suspended'), false);
});

test('une livraison DHD reste synchronisee pour detecter un retour ulterieur', () => {
  assert.equal(shouldContinueOfficialStatusSync('livrée'), true);
  assert.equal(shouldContinueOfficialStatusSync('delivered'), true);
  assert.equal(shouldContinueOfficialStatusSync('RETURN_IN_PROGRESS'), true);
  assert.equal(shouldContinueOfficialStatusSync('retours'), false);
  assert.equal(shouldContinueOfficialStatusSync('abandoned'), false);
});

test('les alias metier equivalentes ne permettent pas un faux changement manuel', () => {
  assert.equal(businessStatusesEqual('livrée', 'delivered'), true);
  assert.equal(businessStatusesEqual('retours', 'returned'), true);
  assert.equal(businessStatusesEqual('ready_to_ship', 'delivered'), false);
});

test('create/order et valid/order precedent toute ecriture du Sheet et du stock', () => {
  const controller = fs.readFileSync(
    path.resolve(__dirname, '../src/orders/orderApi.controller.ts'),
    'utf8'
  );
  const createIndex = controller.indexOf('await client.createOrder(orderPayload)');
  const validateIndex = controller.indexOf('await client.validateOrder(tracking, askCollection)');
  const sheetIndex = controller.indexOf('await sheetService.updateStatus({', validateIndex);
  const stockIndex = controller.indexOf('await reconcileOrderStock(rowId, targetStatus)', sheetIndex);
  assert.ok(createIndex >= 0);
  assert.ok(validateIndex > createIndex);
  assert.ok(sheetIndex > validateIndex);
  assert.ok(stockIndex > sheetIndex);
  assert.doesNotMatch(controller, /carrierStatus:\s*existing\?\.carrierStatus\s*\|\|\s*['"]prete_a_expedier/);
});

test('le stock refuse les quantites ambiguës et ne confond pas reference commande et SKU', () => {
  assert.equal(
    extractProductInfo({ Produit: 'T-shirt / XL', Quantité: '1,5' }),
    null
  );
  const product = extractProductInfo({
    Produit: 'T-shirt / XL',
    Quantité: '2 unités',
    Référence: 'COMMANDE-123',
  });
  assert.equal(product.quantity, 2);
  assert.equal(product.name, 'T-shirt');
  assert.equal(product.variant, 'XL');
  assert.equal(product.code, undefined);
});

test('la configuration Vercel evite les combinaisons invalides et le cron Hobby', () => {
  const vercelConfig = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8')
  );
  assert.equal(Object.hasOwn(vercelConfig, 'crons'), false);
  assert.equal(Object.hasOwn(vercelConfig, 'builds'), false);
  assert.equal(vercelConfig.functions['api/index.ts'].maxDuration, 60);
  assert.equal(vercelConfig.routes[0].dest, '/api/index.ts');

  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/order-status-sync.yml'),
    'utf8'
  );
  assert.match(workflow, /cron: '2\/5 \* \* \* \*'/);
  assert.match(workflow, /secrets\.CRON_SECRET/);
  assert.match(
    workflow,
    /https:\/\/the-project2\.vercel\.app\/api\/orders\/cron\/sync-statuses/
  );
});
