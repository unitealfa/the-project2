const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertEcotrackSuccess,
  chunkTrackings,
  parseStatusResponse,
  parseTrackingActivity,
} = require('../dist/src/orders/ecotrack.client.js');
const {
  isFinalBusinessStatus,
  mapCarrierStatus,
} = require('../dist/src/orders/orderStatus.js');
const {
  authenticateJWT,
} = require('../dist/src/middleware/auth.middleware.js');
const {
  extractProductInfo,
} = require('../dist/src/orders/orderStockUtils.js');

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
