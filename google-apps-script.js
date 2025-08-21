/**
 * Google Apps Script pour synchroniser les commandes avec l'API ECOTRACK
 * 
 * Instructions d'installation:
 * 1. Ouvrez votre Google Sheet
 * 2. Allez dans Extensions > Apps Script
 * 3. Remplacez le code par défaut par ce script
 * 4. Configurez les variables ci-dessous
 * 5. Créez un déclencheur pour exécuter automatiquement
 */

// Configuration - MODIFIEZ CES VALEURS SELON VOTRE SETUP
const CONFIG = {
  API_BASE_URL: 'https://votre-api.com', // URL de votre API
  API_TOKEN: 'votre-token-jwt', // Token JWT pour l'authentification
  SHEET_NAME: 'Commandes', // Nom de l'onglet contenant les commandes
  COLUMNS: {
    ORDER_ID: 'A', // Colonne contenant l'ID de commande
    CUSTOMER_NAME: 'B', // Nom du client
    CUSTOMER_PHONE: 'C', // Téléphone du client
    CUSTOMER_ADDRESS: 'D', // Adresse du client
    WILAYA: 'E', // Wilaya
    COMMUNE: 'F', // Commune
    PRODUCT_CODE: 'G', // Code produit
    PRODUCT_NAME: 'H', // Nom produit
    VARIANT: 'I', // Variante
    QUANTITY: 'J', // Quantité
    PRICE: 'K', // Prix unitaire
    TOTAL_AMOUNT: 'L', // Montant total
    STATUS: 'M', // Statut de synchronisation
    NOTES: 'N' // Notes
  }
};

/**
 * Fonction principale appelée par le déclencheur
 */
function syncNewOrders() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      throw new Error(`Onglet "${CONFIG.SHEET_NAME}" non trouvé`);
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Trouver les indices des colonnes
    const columnIndices = getColumnIndices(headers);
    
    // Traiter chaque ligne (en commençant par la ligne 2 pour ignorer les en-têtes)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const status = row[columnIndices.STATUS];
      
      // Traiter seulement les nouvelles commandes (statut vide ou "Nouveau")
      if (!status || status === 'Nouveau' || status === '') {
        await processOrder(sheet, row, columnIndices, i + 1);
      }
    }
    
    console.log('Synchronisation terminée avec succès');
  } catch (error) {
    console.error('Erreur lors de la synchronisation:', error);
    sendErrorNotification(error.message);
  }
}

/**
 * Traite une commande individuelle
 */
async function processOrder(sheet, row, columnIndices, rowNumber) {
  try {
    // Extraire les données de la ligne
    const orderData = extractOrderData(row, columnIndices);
    
    // Valider les données
    if (!validateOrderData(orderData)) {
      updateOrderStatus(sheet, rowNumber, columnIndices.STATUS, 'Erreur: Données invalides');
      return;
    }
    
    // Envoyer à l'API
    const response = await sendOrderToAPI(orderData);
    
    if (response.success) {
      updateOrderStatus(sheet, rowNumber, columnIndices.STATUS, 'Envoyé à ECOTRACK');
      console.log(`Commande ${orderData.orderId} envoyée avec succès`);
    } else {
      updateOrderStatus(sheet, rowNumber, columnIndices.STATUS, `Erreur: ${response.message}`);
      console.error(`Erreur pour la commande ${orderData.orderId}:`, response.message);
    }
    
  } catch (error) {
    updateOrderStatus(sheet, rowNumber, columnIndices.STATUS, `Erreur: ${error.message}`);
    console.error(`Erreur lors du traitement de la ligne ${rowNumber}:`, error);
  }
}

/**
 * Extrait les données de commande d'une ligne
 */
function extractOrderData(row, columnIndices) {
  return {
    orderId: row[columnIndices.ORDER_ID],
    customerName: row[columnIndices.CUSTOMER_NAME],
    customerPhone: row[columnIndices.CUSTOMER_PHONE],
    customerAddress: row[columnIndices.CUSTOMER_ADDRESS],
    wilaya: row[columnIndices.WILAYA],
    commune: row[columnIndices.COMMUNE],
    products: [{
      productCode: row[columnIndices.PRODUCT_CODE],
      productName: row[columnIndices.PRODUCT_NAME],
      variant: row[columnIndices.VARIANT],
      quantity: parseInt(row[columnIndices.QUANTITY]) || 1,
      price: parseFloat(row[columnIndices.PRICE]) || 0
    }],
    totalAmount: parseFloat(row[columnIndices.TOTAL_AMOUNT]) || 0,
    notes: row[columnIndices.NOTES] || ''
  };
}

/**
 * Valide les données de commande
 */
function validateOrderData(orderData) {
  const required = ['orderId', 'customerName', 'customerPhone', 'customerAddress', 'wilaya', 'commune'];
  
  for (const field of required) {
    if (!orderData[field] || orderData[field].toString().trim() === '') {
      console.error(`Champ requis manquant: ${field}`);
      return false;
    }
  }
  
  if (!orderData.products || orderData.products.length === 0) {
    console.error('Aucun produit dans la commande');
    return false;
  }
  
  for (const product of orderData.products) {
    if (!product.productName || !product.variant) {
      console.error('Données produit incomplètes');
      return false;
    }
  }
  
  return true;
}

/**
 * Envoie la commande à l'API
 */
async function sendOrderToAPI(orderData) {
  const url = `${CONFIG.API_BASE_URL}/api/orders`;
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.API_TOKEN}`
    },
    payload: JSON.stringify(orderData)
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseData = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 201 || response.getResponseCode() === 200) {
      return { success: true, data: responseData };
    } else {
      return { 
        success: false, 
        message: responseData.message || `Erreur HTTP ${response.getResponseCode()}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      message: `Erreur de connexion: ${error.message}` 
    };
  }
}

/**
 * Met à jour le statut d'une commande dans le sheet
 */
function updateOrderStatus(sheet, rowNumber, statusColumnIndex, status) {
  sheet.getRange(rowNumber, statusColumnIndex + 1).setValue(status);
}

/**
 * Trouve les indices des colonnes basés sur les en-têtes
 */
function getColumnIndices(headers) {
  const indices = {};
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toString().toLowerCase();
    
    if (header.includes('id') || header.includes('commande')) indices.ORDER_ID = i;
    else if (header.includes('nom') && header.includes('client')) indices.CUSTOMER_NAME = i;
    else if (header.includes('téléphone') || header.includes('phone')) indices.CUSTOMER_PHONE = i;
    else if (header.includes('adresse') || header.includes('address')) indices.CUSTOMER_ADDRESS = i;
    else if (header.includes('wilaya')) indices.WILAYA = i;
    else if (header.includes('commune')) indices.COMMUNE = i;
    else if (header.includes('code') && header.includes('produit')) indices.PRODUCT_CODE = i;
    else if (header.includes('nom') && header.includes('produit')) indices.PRODUCT_NAME = i;
    else if (header.includes('variante') || header.includes('variant')) indices.VARIANT = i;
    else if (header.includes('quantité') || header.includes('quantity')) indices.QUANTITY = i;
    else if (header.includes('prix') || header.includes('price')) indices.PRICE = i;
    else if (header.includes('total') || header.includes('montant')) indices.TOTAL_AMOUNT = i;
    else if (header.includes('statut') || header.includes('status')) indices.STATUS = i;
    else if (header.includes('notes')) indices.NOTES = i;
  }
  
  return indices;
}

/**
 * Envoie une notification d'erreur
 */
function sendErrorNotification(errorMessage) {
  // Vous pouvez implémenter l'envoi d'email ou d'autres notifications ici
  console.error('Notification d\'erreur:', errorMessage);
}

/**
 * Fonction de test pour vérifier la configuration
 */
function testConfiguration() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      throw new Error(`Onglet "${CONFIG.SHEET_NAME}" non trouvé`);
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const columnIndices = getColumnIndices(headers);
    
    console.log('Configuration testée avec succès');
    console.log('Colonnes trouvées:', columnIndices);
    
    // Test de connexion API
    const testResponse = UrlFetchApp.fetch(`${CONFIG.API_BASE_URL}/api/orders/webhook/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('Test de connexion API réussi');
    console.log('Réponse:', testResponse.getContentText());
    
  } catch (error) {
    console.error('Erreur de configuration:', error.message);
  }
}

/**
 * Crée un déclencheur pour exécuter la synchronisation automatiquement
 */
function createTrigger() {
  // Supprimer les déclencheurs existants
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncNewOrders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Créer un nouveau déclencheur (exécution toutes les 5 minutes)
  ScriptApp.newTrigger('syncNewOrders')
    .timeBased()
    .everyMinutes(5)
    .create();
    
  console.log('Déclencheur créé avec succès');
}

/**
 * Supprime tous les déclencheurs
 */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  console.log('Tous les déclencheurs supprimés');
}
