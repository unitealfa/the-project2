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
const buildCsvUrl = () =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&cacheBust=${Date.now()}`;

type UpdateStatusContext = {
  previousStatus?: string;
  row?: OrderRow;
  tracking?: string;
};

type SheetStatus =
  | 'new'
  | 'abandoned'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | string;

const SHEET_SYNC_ENDPOINT =
  import.meta.env.VITE_SHEET_SYNC_ENDPOINT ?? '/api/orders/status';

  const PAGE_SIZE = 100;

  const isNetworkError = (error: unknown) => {
  if (error instanceof TypeError) return true;
  if (!error) return false;
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && 'message' in error
      ? String((error as any).message ?? '')
      : '';
  if (!message) return false;
  return /Failed to fetch|NetworkError|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(message);
};

const DEFAULT_DHD_BASE_URL = 'https://platform.dhd-dz.com';
const DHD_API_BASE_URL = (import.meta.env.VITE_DHD_API_URL ?? DEFAULT_DHD_BASE_URL).replace(/\/$/, '');
const DHD_API_TOKEN = import.meta.env.VITE_DHD_API_TOKEN ??
  'FmEdYRuMKmZOksnzHz2gvNhassrqr8wYNf4Lwcvn2EuOkTO9VZ1RXZb1nj4i';
const DHD_CREATE_PATH = '/api/v1/create/order';
const DHD_TRACKING_PATH = '/api/v1/get/tracking/info';

const buildDhdUrl = (path: string) => `${DHD_API_BASE_URL}${path}`;

const normalizeStatus = (status: string) =>
  status
    .replace(/_/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const DHD_STATUS_MAP: Record<string, SheetStatus> = {
  'vers station': 'shipped',
  'en station': 'shipped',
  'vers wilaya': 'shipped',
  'en preparation': 'shipped',
  'en livraison': 'shipped',
  'suspendus': 'shipped',
  livred: 'delivered',
  delivered: 'delivered',
  'return asked': 'returned',
  'return in transit': 'returned',
  'return received': 'returned',
};

const mapDhdStatusToSheet = (status: unknown): SheetStatus | null => {
  if (typeof status !== 'string') return null;
  const normalized = normalizeStatus(status);
  return DHD_STATUS_MAP[normalized] ?? null;
};

const normalizeFieldKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const extractTrackingStatus = (payload: any): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.status === 'string') return payload.status;
  if (payload.data && typeof payload.data.status === 'string') return payload.data.status;
  if (payload.order && typeof payload.order.status === 'string') return payload.order.status;
  if (payload.tracking && typeof payload.tracking.status === 'string') return payload.tracking.status;
  return null;
};

const Orders: React.FC = () => {
  const { token } = useContext(AuthContext);
  const [rows, setRows] = React.useState<OrderRow[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [statusSyncDisabled, setStatusSyncDisabled] = React.useState<boolean>(false);
  const syncDisabledRef = React.useRef<boolean>(false);
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

const OrderRowItem = React.memo(function OrderRowItem({ row, idx, headers, onUpdateStatus, onDelivered }: { row: OrderRow; idx: number; headers: string[]; onUpdateStatus: (rowId: string, status: SheetStatus, context?: UpdateStatusContext) => Promise<void>; onDelivered: (payload: { code?: string; name?: string; variant: string; quantity: number }, rowId: string) => Promise<void>; }) {
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
  const initialSheetStatus: SheetStatus = (
    String(row['etat'] ?? row['État'] ?? row['Etat'] ?? '').trim() || 'new'
  ) as SheetStatus;
  const sheetRowId = String(row['id-sheet'] ?? '').trim();
  const fallbackRowId = String(row['ID'] ?? '').trim();
  const rowId = sheetRowId || fallbackRowId;
  const displayRowLabel = fallbackRowId || sheetRowId;

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
  
  
  // stop_desk: 0 = a domicile, 1 = STOP DESK
  let stop_desk = '0';
  if ((row['Type de livraison'] || '').toLowerCase().includes('stop')) stop_desk = '1';
  else stop_desk = '0';

  // Calcul du total pour l'envoi API: quantité × total unitaire (sans tarif de livraison)
    const parseAmount = (value: unknown): number | null => {
    if (value === undefined || value === null) return null;
    const cleaned = String(value)
      .replace(/\s+/g, '')
      .replace(/[^\d,.-]/g, '')
      .replace(/,/g, '.');
    if (!cleaned) return null;
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const quantityForTotal = (() => {
    const raw = String(row['Quantité'] || row['Quantite'] || row['Qte'] || '1');
    const sanitized = raw.replace(/[^\d]/g, '');
    const n = parseInt(sanitized, 10);
    return Number.isNaN(n) || n <= 0 ? 1 : n;
  })();

  const unitPriceForTotal = (() => {
     const candidates = ['Prix unitaire', 'Prix', 'PrixU', 'PU', 'Prix U'];
    for (const key of candidates) {
      if (key in row) {
        const parsed = parseAmount(row[key]);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  })();

  const amountFromSheet = (() => {
    const candidates = ['Total', 'total', 'Montant', 'Montant total', 'Prix total'];
    for (const key of candidates) {
      if (key in row) {
        const parsed = parseAmount(row[key]);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  })();
  
  const computedFromUnit = unitPriceForTotal !== null ? unitPriceForTotal * quantityForTotal : null;
  const totalForApi = amountFromSheet ?? computedFromUnit ?? quantityForTotal * 1000;



  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [delivering, setDelivering] = React.useState<boolean>(false);
  const [abandoning, setAbandoning] = React.useState<boolean>(false);

  const handleDownload = useCallback(async () => {
    const confirmed = window.confirm(`Êtes-vous sûr de vouloir envoyer la validation pour ${nom_client} ?`);
    if (!confirmed) {
      return;
    }

    const adr = '.'; // Adresse fixe
    const produit = row['Produit'] || '';
    const remarque = row['ID'] || '';
    
    const realClientData = {
      nom_client: nom_client || 'CLIENT_INCONNU',
      telephone: telephone || '0000000000',
      telephone_2: telephone_2 || '0000000000',
      adresse: adr,
      code_wilaya: parseInt(String(code_wilaya)) || 16,
      montant: String(Math.round(totalForApi)),
      type: '1',
      stop_desk: stop_desk || '0',
      stock: '0',
      fragile: '0',
      produit: produit,
      remarque: remarque,
    };
    
    const commune = smartCommuneResolver(
      row['Commune'] || '',
      row['Wilaya'] || '',
      parseInt(String(code_wilaya)) || 16
    );
    
    const finalData = {
      ...realClientData,
      commune: commune || 'alger', 
    };
    
    console.log('Données normalisées:', {
      original_commune: row['Commune'],
      resolved_commune: commune,
      original_phone: row['Numero'] || row['Téléphone'],
      normalized_phone: telephone,
      original_name: row['Nom du client'],
      normalized_name: nom_client,
      wilaya_code: code_wilaya,
    });

    
    let currentStatus: SheetStatus = initialSheetStatus;

    const applyStatusUpdate = async (nextStatus: SheetStatus, trackingValue: string) => {
      await onUpdateStatus(rowId, nextStatus, {
        previousStatus: currentStatus,
        row: { ...row, etat: nextStatus },
        tracking: trackingValue || undefined,
      });
      currentStatus = nextStatus;
    };

    const syncTrackingStatus = async (trackingValue: string) => {
      if (!trackingValue) return;
      const trackingUrl = `${buildDhdUrl(DHD_TRACKING_PATH)}?tracking=${encodeURIComponent(trackingValue)}`;
      const controllerTracking = new AbortController();
      const timeoutTracking = setTimeout(() => controllerTracking.abort(), 10000);
      try {
        const respTracking = await fetch(trackingUrl, {
          method: 'GET',
          headers: {
            ...(DHD_API_TOKEN ? { Authorization: `Bearer ${DHD_API_TOKEN}` } : {}),
          },
          signal: controllerTracking.signal,
        });
        const textTracking = await respTracking.text();
        let dataTracking: any;
        try { dataTracking = JSON.parse(textTracking); } catch { dataTracking = textTracking; }
        if (!respTracking.ok) {
          throw new Error(`HTTP ${respTracking.status} - ${typeof dataTracking === 'string' ? dataTracking : JSON.stringify(dataTracking)}`);
        }
        const mappedStatus = mapDhdStatusToSheet(extractTrackingStatus(dataTracking));
        if (mappedStatus && mappedStatus !== currentStatus) {
          await applyStatusUpdate(mappedStatus, trackingValue);
        }
      } catch (trackingError) {
        console.error('Erreur lors de la récupération du statut DHD', trackingError);
      } finally {
        clearTimeout(timeoutTracking);
      }
    };

    const resolveTracking = (payload: any): string => {
      if (!payload || typeof payload !== 'object') return '';
      if (typeof payload.tracking === 'string') return payload.tracking;
      if (payload.data && typeof payload.data.tracking === 'string') return payload.data.tracking;
      if (payload.order && typeof payload.order.tracking === 'string') return payload.order.tracking;
      return '';
    };
    
    // Appel API DHD (POST JSON, timeout, bouton désactivé)
    try {
      setSubmitting(true);
      const url = buildDhdUrl(DHD_CREATE_PATH);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      console.log('Envoi vers DHD (POST JSON):', url);
      console.log('Données:', finalData);

      const doPost = async (payload: any) => {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(DHD_API_TOKEN ? { Authorization: `Bearer ${DHD_API_TOKEN}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const text = await resp.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }
        return { resp, data };
      };

      let response: Response | undefined;
      let responseData: any;
      try {
        ({ resp: response, data: responseData } = await doPost(finalData));
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response) {
        throw new Error('Réponse API vide');
      }

      console.log('Réponse DHD:', response);
      console.log('Données de réponse:', responseData);

      if (response.ok && (response.status === 200 || response.status === 201)) {
        const trackingValue = resolveTracking(responseData) || 'N/A';
        alert(`🎉 Création réussie !\n\nClient: ${nom_client}\nTracking: ${trackingValue}\n\nRéponse complète:\n${JSON.stringify(responseData, null, 2)}`);
        await applyStatusUpdate('ready_to_ship', trackingValue);
        await syncTrackingStatus(trackingValue === 'N/A' ? '' : trackingValue);
      } else if (response.status === 422) {
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

          pushCandidate(String(finalData.commune || ''));
          pushCandidate(String(row['Wilaya'] || ''));
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
              try {
                const { resp: r2, data: d2 } = await (async () => {
                  const r = await fetch(url, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(DHD_API_TOKEN ? { Authorization: `Bearer ${DHD_API_TOKEN}` } : {}),
                    },
                    body: JSON.stringify(attemptData),
                    signal: controllerRetry.signal,
                  });
                  const t = await r.text();
                  let d: any; try { d = JSON.parse(t); } catch { d = t; }
                  return { resp: r, data: d };
                })();
                if (r2.ok && (r2.status === 200 || r2.status === 201)) {
                  const trackingValue = resolveTracking(d2) || 'N/A';
                  alert(`🎉 Création réussie (fallback) !\n\nClient: ${nom_client}\nCommune: ${communeCandidate}\nTracking: ${trackingValue}`);
                  success = true;
                  await applyStatusUpdate('ready_to_ship', trackingValue);
                  await syncTrackingStatus(trackingValue === 'N/A' ? '' : trackingValue);
                  break;
                }
                if (r2.status !== 422) {
                  alert(`❌ Erreur API (${r2.status}) lors du fallback\n\n${JSON.stringify(d2, null, 2)}`);
                  break;
                }
              } finally {
                clearTimeout(timeoutRetry);
              }
            } catch (e) {
              console.log('Erreur retry commune', e);
            }
          }

          if (!success) {
            alert(`❌ Erreur de validation (422)\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(responseData, null, 2)}\n\nEssais effectués: ${candidates.join(', ')}`);
          }
        } else {
          alert(`❌ Erreur de validation (422)\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(responseData, null, 2)}`);
        }
      } else if (response.status === 429) {
        alert(`⚠️ Trop de requêtes (429)\n\nClient: ${nom_client}\n\nVeuillez réessayer plus tard.`);
      } else {
        alert(`❌ Erreur API (${response.status})\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(responseData, null, 2)}`);
      }

    } catch (error) {
      console.error('Erreur lors de l\'appel API:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`❌ Erreur réseau\n\nClient: ${nom_client}\n\nErreur: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  }, [nom_client, telephone, telephone_2, code_wilaya, totalForApi, stop_desk, row, onUpdateStatus, smartCommuneResolver, initialSheetStatus]);
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      {headers.map(h => (
        <td key={h} style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
          {row[h] || ''}
        </td>
      ))}

      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleDownload}
            disabled={submitting || abandoning}
            style={{ background: submitting ? '#9bbcf1' : '#007bff', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: 4, cursor: submitting || abandoning ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Envoi...' : 'Envoyer la validation'}
          </button>
          <button
            onClick={async () => {
              const confirmed = window.confirm(`Confirmer l'abandon de la commande ${displayRowLabel || ''} ?`);
              if (!confirmed) return;
              try {
                setAbandoning(true);
                await onUpdateStatus(rowId, 'abandoned', {
                  previousStatus: initialSheetStatus,
                  row: { ...row, etat: 'abandoned' },
                });
              } catch (e: any) {
                const message = e?.message || 'Erreur lors de la mise à jour du statut abandonné';
                alert(message);
              } finally {
                setAbandoning(false);
              }
            }}
            disabled={abandoning || submitting}
            style={{ background: abandoning ? '#d9534f99' : '#dc3545', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: 4, cursor: abandoning || submitting ? 'not-allowed' : 'pointer' }}
          >
            {abandoning ? 'Abandon…' : 'Abandonnée'}
          </button>
          <button
            onClick={async () => {
              try {
                setDelivering(true);
                const quantity = parseInt(String(row['Quantité'] || row['Quantite'] || row['Qte'] || '1').replace(/[^\d]/g, '')) || 1;
                const name = String(row['Produit'] || '').trim();
                const variant = String(row['Variante'] || row['Variation'] || row['Taille'] || 'default').trim() || 'default';
                await onDelivered({ name, variant, quantity }, rowId);
                await onUpdateStatus(rowId, 'delivered', {
                  previousStatus: initialSheetStatus,
                  row: { ...row, etat: 'delivered' },
                });
              } catch (e: any) {
                alert(e?.message || 'Erreur lors de la livraison');
              } finally {
                setDelivering(false);
              }
            }}
            disabled={delivering || submitting || abandoning}
            style={{ background: delivering ? '#8bc34a99' : '#28a745', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: 4, cursor: delivering || submitting || abandoning ? 'not-allowed' : 'pointer' }}
          >
            {delivering ? 'Traitement…' : 'Marquer livrée (décrémenter stock)'}
          </button>
        </div>
      </td>
      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
        {(() => {
          const fromSheet = String(row['etat'] ?? row['État'] ?? row['Etat'] ?? '').trim();
          return fromSheet ? fromSheet : 'new';
        })()}
      </td>
    </tr>
  );
});
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>('');
   const [currentPage, setCurrentPage] = React.useState<number>(1);

    const isFirstLoadRef = React.useRef(true);
  const cancelledRef = React.useRef(false);
  const fetchingRef = React.useRef(false);
  const disableStatusSync = React.useCallback((reason?: unknown) => {
    if (!syncDisabledRef.current) {
      syncDisabledRef.current = true;
      setStatusSyncDisabled(true);
      if (reason) {
        console.warn('Désactivation de la synchronisation du statut (backend injoignable)', reason);
      }
    }
  }, []);

  const syncStatus = React.useCallback(
    async (rowId: string, status: SheetStatus, context?: UpdateStatusContext) => {
            if (syncDisabledRef.current) {
        return Promise.resolve();
      }
            if (syncDisabledRef.current) {
        return;
      }
      if (!rowId) {
        throw new Error("Identifiant de commande manquant pour la mise à jour du statut");
      }
      try {
        const res = await fetch(SHEET_SYNC_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rowId,
            status,
            tracking: context?.tracking,
            row: context?.row,
          }),
        });
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }
        if (!res.ok) {
          const message = typeof data === 'string' ? data : data?.message;
          throw new Error(message || `HTTP ${res.status}`);
        }
        return data;
      } catch (error) {
        console.error('Erreur lors de la synchronisation du statut avec le Sheet', error);
                if (isNetworkError(error)) {
          disableStatusSync(error);
          return;
        }
        throw error;
      }
    },
    [disableStatusSync]
  );

  const loadSheetData = React.useCallback(
    async (withSpinner = false) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      const shouldShowSpinner = withSpinner || isFirstLoadRef.current;

      if (shouldShowSpinner) {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await fetch(buildCsvUrl(), { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const grid = parseCsv(text);
        if (grid.length === 0) {
          throw new Error('CSV vide');
        }
        const [headerRow, ...dataRows] = grid;
        if (!cancelledRef.current) {
          const normalizeHeader = (h: string) =>
            (h || '')
              .trim()
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');
              const hiddenHeaderSet = new Set([
            'date',
            'adresse',
            'total',
            'net a payer',
          ]);

          const originalHeaderByNormalized = new Map<string, string>();
          headerRow.forEach(h => {
            const normalized = normalizeHeader(h || '');
            if (!normalized) return;
            if (!originalHeaderByNormalized.has(normalized)) {
              originalHeaderByNormalized.set(normalized, h);
            }
          });

          const cleanedHeaders = headerRow.filter(h => {
            const normalized = normalizeHeader(h || '');
                        if (!normalized) return false;
            if (normalized === 'etat') return false;
            if (hiddenHeaderSet.has(normalized)) return false;
            return true;
          });

          const uniqueHeaders: string[] = [];
          const seenHeaders = new Set<string>();
          cleanedHeaders.forEach(h => {
            const normalized = normalizeHeader(h || '');
            if (!normalized || seenHeaders.has(normalized)) {
              return;
            }
            seenHeaders.add(normalized);
            uniqueHeaders.push(h);
          });
          
          const ensureHeader = (label: string) => {
             const normalized = normalizeHeader(label);
            if (!normalized || seenHeaders.has(normalized)) {
              return;
            }
                        const original = originalHeaderByNormalized.get(normalized);
            uniqueHeaders.push(original ?? label);
            seenHeaders.add(normalized);
          };
                   ['Nom du client', 'Numero', 'ID', 'id-sheet'].forEach(ensureHeader);

          const desiredOrder = ['Nom du client', 'Numero', 'ID', 'id-sheet'];
          const prioritized = desiredOrder
            .map(label => {
              const normalized = normalizeHeader(label);
              return uniqueHeaders.find(h => normalizeHeader(h) === normalized);
            })
            .filter((h): h is string => Boolean(h));
          const prioritizedSet = new Set(prioritized.map(h => normalizeHeader(h)));
          const remaining = uniqueHeaders.filter(
            h => !prioritizedSet.has(normalizeHeader(h))
          );

          setHeaders([...prioritized, ...remaining]);
          const mapped = dataRows
            .map((r, dataIndex) => {
              if (!r.some(cell => cell && cell.trim() !== '')) {
                return null;
              }
              const obj: OrderRow = {};
              headerRow.forEach((h, idx) => {
                const headerKey = typeof h === 'string' ? h.trim() : '';
                if (!headerKey) return;
                obj[headerKey] = r[idx] ?? '';
              });

              const idKey = Object.keys(obj).find(
                key => key.trim().toLowerCase() === 'id'
              );
              const existingIdRaw = idKey ? obj[idKey] : undefined;
              const normalizedId =
                typeof existingIdRaw === 'string'
                  ? existingIdRaw.trim()
                  : existingIdRaw !== undefined && existingIdRaw !== null
                  ? String(existingIdRaw).trim()
                  : '';
              const sheetRowNumber = dataIndex + 2; // +2 pour inclure la ligne d'en-tête
              obj['id-sheet'] = String(sheetRowNumber);
              if (normalizedId) {
                obj['ID'] = normalizedId;
              } else {
                obj['ID'] = String(sheetRowNumber);
              }
              if (idKey && idKey !== 'ID') {
                delete obj[idKey];
              }

              const sheetStatus = String(
                obj['etat'] ?? obj['État'] ?? obj['Etat'] ?? ''
              ).trim();

              obj['etat'] = sheetStatus;
              const ensureCanonicalField = (
                targetKey: string,
                matcher: (normalizedKey: string, tokens: string[]) => boolean
              ) => {
                const existing = obj[targetKey];
                if (existing && String(existing).trim()) {
                  obj[targetKey] = String(existing).trim();
                  return;
                }
                for (const key of Object.keys(obj)) {
                  const rawValue = obj[key];
                  if (rawValue === undefined || rawValue === null) continue;
                  const normalizedKey = normalizeFieldKey(key);
                  if (!normalizedKey) continue;
                  const tokens = normalizedKey
                    .replace(/[^a-z0-9]+/g, ' ')
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean);
                  if (!matcher(normalizedKey, tokens)) continue;
                  const value = String(rawValue).trim();
                  if (!value) continue;
                  obj[targetKey] = value;
                  return;
                }
              };

              ensureCanonicalField('Nom du client', (normalizedKey, tokens) => {
                const hasClient = tokens.some(token => token === 'client' || token === 'customer');
                const hasName = tokens.some(token => token === 'nom' || token === 'name');
                if (hasClient && hasName) return true;
                return normalizedKey.includes('client') && (normalizedKey.includes('nom') || normalizedKey.includes('name'));
              });

              ensureCanonicalField('Numero', (normalizedKey, tokens) => {
                if (tokens.some(token => token === 'numero')) return true;
                if (tokens.some(token => token === 'telephone' || token === 'tel' || token === 'phone')) return true;
                return (
                  normalizedKey.includes('numero') ||
                  normalizedKey.includes('telephone') ||
                  normalizedKey.includes('tel') ||
                  normalizedKey.includes('phone')
                );
              });

              return obj;
            })
            .filter((row): row is OrderRow => row !== null);
          setRows(mapped);
        }
      } catch (e: any) {
        if (!cancelledRef.current) setError(e?.message || 'Erreur inconnue');
      } finally {
        if (!cancelledRef.current && shouldShowSpinner) {
          setLoading(false);
        }
        fetchingRef.current = false;
        if (!cancelledRef.current) {
          isFirstLoadRef.current = false;
        }
      }
    },
    []
  );

  React.useEffect(() => {
    cancelledRef.current = false;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const initialise = async () => {
      await loadSheetData(true);
      intervalId = setInterval(() => {
        loadSheetData(false);
      }, 10000);
    };

    initialise();

    return () => {
      cancelledRef.current = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [loadSheetData]);

  const handleUpdateRowStatus = useCallback(
    async (rowId: string, status: SheetStatus, context: UpdateStatusContext = {}) => {
      if (!rowId) {
        throw new Error('Identifiant de commande manquant');
      }

      let recordedPrevious: SheetStatus | undefined;
      const matchesRow = (candidate: OrderRow) => {
        const candidateSheetId = String(candidate['id-sheet'] ?? '').trim();
        if (candidateSheetId) {
          return candidateSheetId === rowId;
        }
        const candidateFallbackId = String(candidate['ID'] ?? '').trim();
        return candidateFallbackId === rowId;
      };

      setRows(prevRows =>
        prevRows.map(r => {
          if (matchesRow(r)) {
            recordedPrevious = (String(r['etat'] ?? '') || 'new') as SheetStatus;
            return { ...r, etat: status };
          }
          return r;
        })
      );

      const fallbackStatus: SheetStatus = (context.previousStatus as SheetStatus) ?? recordedPrevious ?? 'new';

      try {
        await syncStatus(rowId, status, context);
      } catch (error) {
        setRows(prevRows =>
          prevRows.map(r => (matchesRow(r) ? { ...r, etat: fallbackStatus } : r))
        );
        throw error;
      }
    },
    [syncStatus]
  );

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
  }, [token]);

    const searchableHeaders = React.useMemo(() => {
    const keys: string[] = [];
    const pushKey = (key: string) => {
      if (!key) return;
      if (keys.includes(key)) return;
      keys.push(key);
    };
    ['Nom du client', 'Numero'].forEach(pushKey);
    headers.forEach(pushKey);
    ['Wilaya', 'Commune', 'ID', 'id-sheet', 'Type de livraison'].forEach(pushKey);
    return keys;
  }, [headers]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(row =>
      searchableHeaders
        .filter(k => k in row)
        .some(key => (row[key] || '').toLowerCase().includes(q))
    );
  }, [rows, query, searchableHeaders]);
  React.useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  React.useEffect(() => {
    setCurrentPage(prev => {
      const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      return Math.min(prev, maxPage);
    });
  }, [filtered.length]);

  const totalPages = React.useMemo(
    () => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    [filtered.length]
  );

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedRows = React.useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safeCurrentPage]);

  const pageRangeStart = filtered.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(filtered.length, (safeCurrentPage - 1) * PAGE_SIZE + paginatedRows.length);

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

            {statusSyncDisabled && (
        <p style={{ color: '#a94442', background: '#f2dede', padding: '0.6rem 0.8rem', borderRadius: 4 }}>
          Synchronisation du statut désactivée : impossible de contacter le service backend{' '}
          (<code>{SHEET_SYNC_ENDPOINT}</code>). Les changements locaux ne seront pas envoyés.
        </p>
      )}

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
                
                <th style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>Action</th>
                <th style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>etat</th>
              </tr>
             </thead>
             <tbody>
              {paginatedRows.map((row, idx) => (
                <OrderRowItem key={row['id-sheet'] || row['ID'] || idx} row={row} idx={idx} headers={headers} onUpdateStatus={handleUpdateRowStatus} onDelivered={handleDelivered} />
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

 {filtered.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginTop: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: '#555' }}>
            Affichage des commandes {pageRangeStart} à {pageRangeEnd} sur {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentPage(page => Math.max(page - 1, 1))}
              disabled={safeCurrentPage <= 1}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: 4,
                border: '1px solid #ced4da',
                background: safeCurrentPage <= 1 ? '#f1f3f5' : '#ffffff',
                color: safeCurrentPage <= 1 ? '#adb5bd' : '#212529',
                cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Précédent
            </button>
            <span style={{ fontSize: '0.9rem', color: '#555' }}>
              Page {safeCurrentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(page => Math.min(page + 1, totalPages))}
              disabled={safeCurrentPage >= totalPages}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: 4,
                border: '1px solid #ced4da',
                background: safeCurrentPage >= totalPages ? '#f1f3f5' : '#ffffff',
                color: safeCurrentPage >= totalPages ? '#adb5bd' : '#212529',
                cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Suivant
            </button>
          </div>
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