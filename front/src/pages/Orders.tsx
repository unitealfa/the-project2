import React, { useState, useMemo, useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

// Simple, robust CSV parser supporting quoted fields and commas within quotes
function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\r') {
        // ignore CR, will be handled by \n

      } else {
        currentField += char;
      }
    }
  }
  // push the last field/row if present
  if (currentField.length > 0 || inQuotes || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

interface OrderRow {
  [key: string]: string;
}

const SHEET_ID = '1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

const Orders: React.FC = () => {
  const { token } = useContext(AuthContext);
  const [rows, setRows] = React.useState<OrderRow[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  // Adresse saisie par l'utilisateur pour chaque commande (indexée par idx)

// Composant optimisé pour une ligne de commande
// Table de correspondance wilaya_name -> wilaya_id
const WILAYAS = [
  { "wilaya_id": 1, "wilaya_name": "Adrar" },
  { "wilaya_id": 2, "wilaya_name": "Chlef" },
  { "wilaya_id": 3, "wilaya_name": "Laghouat" },
  { "wilaya_id": 4, "wilaya_name": "Oum El Bouaghi" },
  { "wilaya_id": 5, "wilaya_name": "Batna" },
  { "wilaya_id": 6, "wilaya_name": "Béjaïa" },
  { "wilaya_id": 7, "wilaya_name": "Biskra" },
  { "wilaya_id": 8, "wilaya_name": "Béchar" },
  { "wilaya_id": 9, "wilaya_name": "Blida" },
  { "wilaya_id": 10, "wilaya_name": "Bouira" },
  { "wilaya_id": 11, "wilaya_name": "Tamanrasset" },
  { "wilaya_id": 12, "wilaya_name": "Tébessa" },
  { "wilaya_id": 13, "wilaya_name": "Tlemcen" },
  { "wilaya_id": 14, "wilaya_name": "Tiaret" },
  { "wilaya_id": 15, "wilaya_name": "Tizi Ouzou" },
  { "wilaya_id": 16, "wilaya_name": "Alger" },
  { "wilaya_id": 17, "wilaya_name": "Djelfa" },
  { "wilaya_id": 18, "wilaya_name": "Jijel" },
  { "wilaya_id": 19, "wilaya_name": "Sétif" },
  { "wilaya_id": 20, "wilaya_name": "Saïda" },
  { "wilaya_id": 21, "wilaya_name": "Skikda" },
  { "wilaya_id": 22, "wilaya_name": "Sidi Bel Abbès" },
  { "wilaya_id": 23, "wilaya_name": "Annaba" },
  { "wilaya_id": 24, "wilaya_name": "Guelma" },
  { "wilaya_id": 25, "wilaya_name": "Constantine" },
  { "wilaya_id": 26, "wilaya_name": "Médéa" },
  { "wilaya_id": 27, "wilaya_name": "Mostaganem" },
  { "wilaya_id": 28, "wilaya_name": "M'Sila" },
  { "wilaya_id": 29, "wilaya_name": "Mascara" },
  { "wilaya_id": 30, "wilaya_name": "Ouargla" },
  { "wilaya_id": 31, "wilaya_name": "Oran" },
  { "wilaya_id": 32, "wilaya_name": "El Bayadh" },
  { "wilaya_id": 33, "wilaya_name": "Illizi" },
  { "wilaya_id": 34, "wilaya_name": "Bordj Bou Arreridj" },
  { "wilaya_id": 35, "wilaya_name": "Boumerdès" },
  { "wilaya_id": 36, "wilaya_name": "El Tarf" },
  { "wilaya_id": 37, "wilaya_name": "Tindouf" },
  { "wilaya_id": 38, "wilaya_name": "Tissemsilt" },
  { "wilaya_id": 39, "wilaya_name": "El Oued" },
  { "wilaya_id": 40, "wilaya_name": "Khenchela" },
  { "wilaya_id": 41, "wilaya_name": "Souk Ahras" },
  { "wilaya_id": 42, "wilaya_name": "Tipaza" },
  { "wilaya_id": 43, "wilaya_name": "Mila" },
  { "wilaya_id": 44, "wilaya_name": "Aïn Defla" },
  { "wilaya_id": 45, "wilaya_name": "Naâma" },
  { "wilaya_id": 46, "wilaya_name": "Aïn Témouchent" },
  { "wilaya_id": 47, "wilaya_name": "Ghardaïa" },
  { "wilaya_id": 48, "wilaya_name": "Relizane" }
];

// Tableau des tarifs par wilaya (À domicile / Stop desk)
const DELIVERY_TARIFFS: Record<number, { domicile: number; stop: number }> = {
  1: { domicile: 1100, stop: 600 },
  2: { domicile: 700, stop: 400 },
  3: { domicile: 900, stop: 500 },
  4: { domicile: 800, stop: 400 },
  5: { domicile: 800, stop: 400 },
  6: { domicile: 700, stop: 400 },
  7: { domicile: 900, stop: 500 },
  8: { domicile: 1100, stop: 600 },
  9: { domicile: 500, stop: 250 },
  10: { domicile: 650, stop: 400 },
  11: { domicile: 1300, stop: 800 },
  12: { domicile: 800, stop: 500 },
  13: { domicile: 800, stop: 400 },
  14: { domicile: 800, stop: 400 },
  15: { domicile: 650, stop: 400 },
  16: { domicile: 400, stop: 200 },
  17: { domicile: 900, stop: 500 },
  18: { domicile: 700, stop: 400 },
  19: { domicile: 700, stop: 400 },
  20: { domicile: 800, stop: 400 },
  21: { domicile: 700, stop: 400 },
  22: { domicile: 700, stop: 400 },
  23: { domicile: 700, stop: 400 },
  24: { domicile: 800, stop: 400 },
  25: { domicile: 700, stop: 400 },
  26: { domicile: 600, stop: 400 },
  27: { domicile: 700, stop: 400 },
  28: { domicile: 800, stop: 500 },
  29: { domicile: 700, stop: 400 },
  30: { domicile: 1000, stop: 500 },
  31: { domicile: 700, stop: 400 },
  32: { domicile: 1000, stop: 500 },
  33: { domicile: 1300, stop: 600 },
  34: { domicile: 700, stop: 400 },
  35: { domicile: 600, stop: 350 },
  36: { domicile: 800, stop: 400 },
  37: { domicile: 1300, stop: 600 },
  38: { domicile: 800, stop: 400 },
  39: { domicile: 900, stop: 500 },
  40: { domicile: 800, stop: 500 },
  41: { domicile: 800, stop: 500 },
  42: { domicile: 600, stop: 350 },
  43: { domicile: 700, stop: 400 },
  44: { domicile: 600, stop: 400 },
  45: { domicile: 1000, stop: 500 },
  46: { domicile: 700, stop: 400 },
  47: { domicile: 1000, stop: 500 },
  48: { domicile: 700, stop: 400 },
  49: { domicile: 1300, stop: 600 },
  51: { domicile: 900, stop: 500 },
  52: { domicile: 1300, stop: 0 },
  53: { domicile: 1300, stop: 600 },
  55: { domicile: 900, stop: 500 },
  57: { domicile: 900, stop: 0 },
  58: { domicile: 1000, stop: 500 },
};

function getDeliveryTariff(wilayaCode: number | string, stopDeskFlag: string | number): number | null {
  const code = typeof wilayaCode === 'string' ? parseInt(wilayaCode) : wilayaCode;
  const isStop = String(stopDeskFlag) === '1';
  // Si code invalide, fallback 16 (Alger)
  const safeCode = (!code || Number.isNaN(code)) ? 16 : code;
  let tariffs = DELIVERY_TARIFFS[safeCode];
  // Fallback ultime sur 16 si non trouvé
  if (!tariffs) tariffs = DELIVERY_TARIFFS[16];
  if (!tariffs) return null;
  return isStop ? tariffs.stop : tariffs.domicile;
}

function getWilayaIdByName(name: string) {
  const normalize = (s: string) => (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ +/g, ' ');
  const target = normalize(name);
  const found = WILAYAS.find(w => normalize(w.wilaya_name) === target);
  return found ? found.wilaya_id : 16; // Fallback Alger si non reconnu
}

const OrderRowItem = React.memo(function OrderRowItem({ row, idx, headers, onUpdateStatus, onDelivered }: { row: OrderRow; idx: number; headers: string[]; onUpdateStatus: (rowId: string, status: string) => void; onDelivered: (payload: { code?: string; name?: string; variant: string; quantity: number }, rowId: string) => Promise<void>; }) {

  // Fonction de normalisation des numéros de téléphone
  const normalizePhone = (phone: string): string => {
    if (!phone) return '';
    
    // Supprimer tous les caractères non numériques
    let normalized = phone.replace(/\D/g, '');
    
    // Si le numéro commence par 0, le garder tel quel
    if (normalized.startsWith('0')) {
      return normalized;
    }
    
    // Si le numéro commence par 213 (code pays), ajouter 0
    if (normalized.startsWith('213')) {
      return '0' + normalized.substring(3);
    }
    
    // Si le numéro a 9 chiffres, ajouter 0 au début
    if (normalized.length === 9) {
      return '0' + normalized;
    }
    
    return normalized;
  };

  // Fonction de normalisation des noms
  const normalizeName = (name: string): string => {
    if (!name) return '';
    
    return name
      .replace(/[éèêë]/g, 'e')
      .replace(/[àâä]/g, 'a')
      .replace(/[ùûü]/g, 'u')
      .replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o')
      .replace(/[ç]/g, 'c')
      .replace(/[ñ]/g, 'n')
      .replace(/[ý]/g, 'y')
      .replace(/[æ]/g, 'ae')
      .replace(/[œ]/g, 'oe')
      .replace(/['\'\`]/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Champs du JSON cible
  // Recherche robuste du nom client (insensible à la casse et espaces)
  let nom_client = '';
  for (const key of Object.keys(row)) {
    if (key.trim().toLowerCase() === 'nom du client' && row[key]) {
      nom_client = row[key];
      break;
    }
  }
  if (!nom_client) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase().includes('client') && row[key]) {
        nom_client = row[key];
        break;
      }
    }
  }
  nom_client = normalizeName(nom_client);

  // Recherche robuste du numéro de téléphone (insensible à la casse et espaces)
  let telephone = '';
  for (const key of Object.keys(row)) {
    if (key.trim().toLowerCase() === 'numero' && row[key]) {
      telephone = row[key];
      break;
    }
  }
  if (!telephone) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase().includes('téléphone') && row[key]) {
        telephone = row[key];
        break;
      }
    }
  }
  telephone = normalizePhone(telephone);
  const telephone_2 = telephone;
  // Système intelligent de résolution des communes avec vraies données
  const smartCommuneResolver = (
    communeName: string,
    wilayaName: string,
    wilayaCode: number
  ): string => {
    // Normalisation locale, sans appels réseau
    const normalizeText = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/[éèêë]/g, 'e')
        .replace(/[àâä]/g, 'a')
        .replace(/[ùûü]/g, 'u')
        .replace(/[îï]/g, 'i')
        .replace(/[ôö]/g, 'o')
        .replace(/[ç]/g, 'c')
        .replace(/[ñ]/g, 'n')
        .replace(/[ý]/g, 'y')
        .replace(/[æ]/g, 'ae')
        .replace(/[œ]/g, 'oe')
        .replace(/['\'\`]/g, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b(centre|ville|commune|wilaya|daira)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    const aliasMap: Record<string, string> = {
      'birtouta': 'bir touta',
      'khraicia': 'khraissia',
      'el harrach': 'el harrach',
      'dar el beida': 'dar el beida',
    };

    const normalizedCommune = normalizeText(communeName);
    if (normalizedCommune) {
      return aliasMap[normalizedCommune] || normalizedCommune;
    }

    const normalizedWilaya = normalizeText(wilayaName);
    if (normalizedWilaya) {
      return aliasMap[normalizedWilaya] || normalizedWilaya;
    }

    const wilaya = WILAYAS.find(w => w.wilaya_id === wilayaCode);
    if (wilaya) {
      const fromCode = normalizeText(wilaya.wilaya_name);
      return aliasMap[fromCode] || fromCode || 'alger';
    }

    return 'alger';
  };
  
  const code_wilaya = getWilayaIdByName(row['Wilaya']);
  
  // Normaliser le montant
  const normalizeAmount = (amount: string): string => {
    if (!amount) return '1000';
    
    // Supprimer tous les caractères non numériques sauf le point et la virgule
    let normalized = amount.replace(/[^\d.,]/g, '');
    
    // Remplacer la virgule par un point
    normalized = normalized.replace(',', '.');
    
    // Si vide ou invalide, retourner 1000 par défaut
    if (!normalized || isNaN(parseFloat(normalized))) {
      return '1000';
    }
    
    return normalized;
  };
  
  // stop_desk: 0 = a domicile, 1 = STOP DESK
  let stop_desk = '0';
  if ((row['Type de livraison'] || '').toLowerCase().includes('stop')) stop_desk = '1';
  else stop_desk = '0';

  // Calcul du Net à payer pour l'envoi API: (quantité × total unitaire) + tarif livraison
  const quantityForNet = (() => {
    const raw = String(row['Quantité'] || row['Quantite'] || row['Qte'] || '1');
    const n = parseInt(raw.replace(/[\d]/g, ''));
    return Number.isNaN(n) || n <= 0 ? 1 : n;
  })();
  const unitPriceForNet = (() => {
    const raw = String(row['Total'] || '1000');
    const n = parseFloat(raw.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isNaN(n) ? 1000 : n;
  })();
  const deliveryTariffForNet = getDeliveryTariff(code_wilaya, stop_desk) || 0;
  const netToPayForApi = unitPriceForNet * quantityForNet + deliveryTariffForNet;


  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [delivering, setDelivering] = React.useState<boolean>(false);

  const handleDownload = useCallback(async () => {
    // Demander confirmation avant l'envoi
    const confirmed = window.confirm(`Êtes-vous sûr de vouloir envoyer la validation pour ${nom_client} ?`);
    if (!confirmed) {
      return;
    }
    
    const adr = '.'; // Adresse fixe

    const produit = row['Produit'] || '';
    const remarque = row['ID'] || '';
    
    // Préparer les vraies données du client
    const realClientData = {
      nom_client: nom_client || 'CLIENT_INCONNU',
      telephone: telephone || '0000000000',
      telephone_2: telephone_2 || '0000000000',
      adresse: adr,
      code_wilaya: parseInt(String(code_wilaya)) || 16, // Fallback sur Alger
      montant: String(netToPayForApi),
      type: '1',
      stop_desk: stop_desk || '0',
      stock: '0',
      fragile: '0',
      produit: produit,
      remarque: remarque,
    };
    
    // Résolution intelligente de la commune (locale uniquement)
    const commune = smartCommuneResolver(
      row['Commune'] || '',
      row['Wilaya'] || '',
      parseInt(String(code_wilaya)) || 16
    );
    
    // Validation finale des données avec la commune résolue
    const finalData = {
      ...realClientData,
      commune: commune || 'alger', // Fallback final sur Alger
    };
    
    // Log pour déboguer
    console.log('Données normalisées:', {
      original_commune: row['Commune'],
      resolved_commune: commune,
      original_phone: row['Numero'] || row['Téléphone'],
      normalized_phone: telephone,
      original_name: row['Nom du client'],
      normalized_name: nom_client,
      wilaya_code: code_wilaya
    });
    
    // Appel API DHD (POST JSON, timeout, bouton désactivé)
    try {
      setSubmitting(true);
      const TOKEN = 'FmEdYRuMKmZOksnzHz2gvNhassrqr8wYNf4Lwcvn2EuOkTO9VZ1RXZb1nj4i';
      const BASE = 'https://platform.dhd-dz.com/api/v1';
      const PATH = '/create/order';
      const url = `${BASE}${PATH}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      console.log('Envoi vers DHD (POST JSON):', url);
      console.log('Données:', finalData);
      
      const doPost = async (payload: any) => {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        const text = await resp.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }
        return { resp, data };
      };

      let { resp: response, data: responseData } = await doPost(finalData);
      clearTimeout(timeoutId);
      
      console.log('Réponse DHD:', response);
      console.log('Données de réponse:', responseData);
      
      if (response.ok && (response.status === 200 || response.status === 201)) {
        // Succès
        const tracking = responseData?.tracking || 'N/A';
        alert(`🎉 Création réussie !\n\nClient: ${nom_client}\nTracking: ${tracking}\n\nRéponse complète:\n${JSON.stringify(responseData, null, 2)}`);
        onUpdateStatus(row['ID'], 'prete_a_expedier');
      } else if (response.status === 422) {
        // Erreur de validation: tenter des fallbacks de commune
        const msg = (responseData && typeof responseData === 'object' && 'message' in responseData) ? String(responseData.message) : '';
        const isCommuneIssue = msg.toLowerCase().includes('commune');

        if (isCommuneIssue) {
          const candidates: string[] = [];
          const seen = new Set<string>();
          const norm = (s: string) => (s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          const pushCandidate = (c: string) => {
            const key = norm(c);
            if (key && !seen.has(key)) {
              seen.add(key);
              candidates.push(c);
            }
          };

          // 1) commune actuelle
          pushCandidate(String(finalData.commune || ''));
          // 2) wilaya comme commune
          pushCandidate(String(row['Wilaya'] || ''));
          // 3) alias connus pour Alger (16)
          const codeNum = parseInt(String(code_wilaya)) || 16;
          if (codeNum === 16) {
            ['alger', 'el harrach', 'dar el beida', 'khraissia', 'bir touta', 'bir mourad rais']
              .forEach(pushCandidate);
          }

          let success = false;
          for (const communeCandidate of candidates) {
            const attemptData = { ...finalData, commune: communeCandidate };
            console.log('Retry avec commune:', communeCandidate);
            try {
              const controllerRetry = new AbortController();
              const timeoutRetry = setTimeout(() => controllerRetry.abort(), 10000);
              const { resp: r2, data: d2 } = await (async () => {
                const r = await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(attemptData),
                  signal: controllerRetry.signal
                });
                const t = await r.text();
                let d: any; try { d = JSON.parse(t); } catch { d = t; }
                return { resp: r, data: d };
              })();
              clearTimeout(timeoutRetry);
              if (r2.ok && (r2.status === 200 || r2.status === 201)) {
                const tracking = d2?.tracking || 'N/A';
                alert(`🎉 Création réussie (fallback) !\n\nClient: ${nom_client}\nCommune: ${communeCandidate}\nTracking: ${tracking}`);
                success = true;
                onUpdateStatus(row['ID'], 'prete_a_expedier');
                break;
              }
              if (r2.status !== 422) {
                // autre erreur: afficher et stopper les retries
                alert(`❌ Erreur API (${r2.status}) lors du fallback\n\n${JSON.stringify(d2, null, 2)}`);
                break;
              }
            } catch (e) {
              console.log('Erreur retry commune', e);
              // continuer avec la candidate suivante
            }
          }

          if (!success) {
            alert(`❌ Erreur de validation (422)\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(responseData, null, 2)}\n\nEssais effectués: ${candidates.join(', ')}`);
          }
        } else {
          // 422 autre que commune
          alert(`❌ Erreur de validation (422)\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(responseData, null, 2)}`);
        }
      } else if (response.status === 429) {
        // Trop de requêtes
        alert(`⚠️ Trop de requêtes (429)\n\nClient: ${nom_client}\n\nVeuillez réessayer plus tard.`);
      } else {
        // Autre erreur
        alert(`❌ Erreur API (${response.status})\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(responseData, null, 2)}`);
      }
      
    } catch (error) {
      console.error('Erreur lors de l\'appel API:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`❌ Erreur réseau\n\nClient: ${nom_client}\n\nErreur: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  }, [nom_client, telephone, telephone_2, code_wilaya, netToPayForApi, stop_desk, row, onUpdateStatus]);

  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      {headers.map(h => (
        <td key={h} style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
          {row[h] || ''}
        </td>
      ))}
      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
        <span style={{ color: '#666', fontSize: '14px' }}>.</span>
      </td>
      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        {(() => {
          const code = getWilayaIdByName(row['Wilaya']);
          const stopFlag = (row['Type de livraison'] || '').toLowerCase().includes('stop') ? '1' : '0';
          const price = getDeliveryTariff(code, stopFlag);
          if (price == null) return '-';
          return `${price} DA`;
        })()}
      </td>
      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
        {(() => {
          const q = parseInt(String(row['Quantité'] || row['Quantite'] || row['Qte'] || '1').replace(/[\d]/g, '')) || 1;
          const unitNum = (() => {
            const raw = String(row['Total'] || '1000');
            const n = parseFloat(raw.replace(/[^\d.,]/g, '').replace(',', '.'));
            return Number.isNaN(n) ? 1000 : n;
          })();
          const code = getWilayaIdByName(row['Wilaya']);
          const stopFlag = (row['Type de livraison'] || '').toLowerCase().includes('stop') ? '1' : '0';
          const tariff = getDeliveryTariff(code, stopFlag) || 0;
          const grand = unitNum * q + tariff;
          return (
            <div>
              <div style={{ color: '#dc3545', fontWeight: 700 }}>{grand} DA</div>
              <div style={{ fontSize: 12, color: '#666' }}>{q} × {unitNum} + {tariff} = <span style={{ color: '#dc3545', fontWeight: 700 }}>Net à payer</span></div>
            </div>
          );
        })()}
      </td>
      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleDownload}
            disabled={submitting}
            style={{ background: submitting ? '#9bbcf1' : '#007bff', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Envoi...' : 'Envoyer la validation'}
          </button>
          <button
            onClick={async () => {
              try {
                setDelivering(true);
                const quantity = parseInt(String(row['Quantité'] || row['Quantite'] || row['Qte'] || '1').replace(/[^\d]/g, '')) || 1;
                const name = String(row['Produit'] || '').trim();
                const variant = String(row['Variante'] || row['Variation'] || row['Taille'] || 'default').trim() || 'default';
                await onDelivered({ name, variant, quantity }, row['ID']);
                onUpdateStatus(row['ID'], 'livree');
              } catch (e: any) {
                alert(e?.message || 'Erreur lors de la livraison');
              } finally {
                setDelivering(false);
              }
            }}
            disabled={delivering}
            style={{ background: delivering ? '#8bc34a99' : '#28a745', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: 4, cursor: delivering ? 'not-allowed' : 'pointer' }}
          >
            {delivering ? 'Traitement…' : 'Marquer livrée (décrémenter stock)'}
          </button>
        </div>
      </td>
      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
        {row['etat'] || 'new'}
      </td>
    </tr>
  );
});
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(CSV_URL, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const grid = parseCsv(text);
        if (grid.length === 0) {
          throw new Error('CSV vide');
        }
        const [headerRow, ...dataRows] = grid;
        if (!cancelled) {
          setHeaders(headerRow);
          const mapped = dataRows
            .filter(r => r.some(cell => cell && cell.trim() !== ''))
            .map(r => {
              const obj: OrderRow = {};
              headerRow.forEach((h, idx) => {
                obj[h] = r[idx] ?? '';
              });
              obj['etat'] = 'new'; // ✅ état initial
              return obj;
            });
          setRows(mapped);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Erreur inconnue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateRowStatus = useCallback((rowId: string, status: string) => {
    setRows(prevRows =>
      prevRows.map(r => (r['ID'] === rowId ? { ...r, etat: status } : r))
    );
  }, []);

  const handleDelivered = useCallback(async (payload: { code?: string; name?: string; variant: string; quantity: number }, rowId: string) => {
    // Appelle l'API backend pour décrémenter le stock
    try {
      const res = await fetch('/api/products/decrement-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ items: [payload] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Échec décrémentation');
      const failures = Array.isArray(data?.results) ? data.results.filter((r: any) => !r.ok) : [];
      if (failures.length) {
        const msg = failures.map((f: any) => `${f.name || f.code || ''} / ${f.variant}: ${f.error}`).join('\n');
        throw new Error(msg || 'Échec partiel');
      }
    } catch (e) {
      throw e;
    }
  }, []);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(row =>
      ['Date', 'Produit', 'Nom du client', 'Numero', 'Wilaya', 'Commune', 'ID', 'Type de livraison']
        .filter(k => k in row)
        .some(key => (row[key] || '').toLowerCase().includes(q))
    );
  }, [rows, query]);

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Commandes (Google Sheet)</h2>

      <div style={{ margin: '0.5rem 0', display: 'flex', gap: '0.5rem' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher (client, wilaya, produit, ... )"
          style={{ padding: '0.4rem 0.6rem', width: 320 }}
        />
        <a
          href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`}
          target="_blank"
          rel="noreferrer"
          style={{ alignSelf: 'center' }}
        >
          Ouvrir la feuille
        </a>
      </div>

      {loading && <p>Chargement...</p>}
      {error && <p style={{ color: 'red' }}>Erreur: {error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
      <tr>
                {headers.map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      borderBottom: '1px solid #ccc',
                      padding: '0.5rem',
                      background: '#f8f9fa',
                      position: 'sticky',
                      top: 0,
                    }}
                  >
                    {h}
                  </th>
                ))}
                <th style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>Adresse</th>
        <th style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>Tarif livraison</th>
                <th style={{ background: '#f8f9fa', position: 'sticky', top: 0, color: '#dc3545' }}>Net à payer</th>
                <th style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>Action</th>
                <th style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>État</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <OrderRowItem key={row['ID'] || idx} row={row} idx={idx} headers={headers} onUpdateStatus={handleUpdateRowStatus} onDelivered={handleDelivered} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={headers.length + 2} style={{ padding: '0.8rem' }}>
                    Aucune commande trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Revenir en haut de la page"
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            width: 48,
            height: 48,
            background: 'linear-gradient(180deg, #4c8bf5 0%, #2864dc 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 999,
            boxShadow: '0 8px 20px rgba(40, 100, 220, 0.35)',
            cursor: 'pointer',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
            opacity: 0.95
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 24px rgba(40, 100, 220, 0.45)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 20px rgba(40, 100, 220, 0.35)';
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 5l-7 7h4v7h6v-7h4l-7-7z" fill="currentColor"/>
          </svg>
        </button>
    </div>
  );
};

export default Orders;