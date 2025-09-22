import React, { useState, useMemo, useCallback } from 'react';

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

function getWilayaIdByName(name: string) {
  const found = WILAYAS.find(w => w.wilaya_name.trim().toLowerCase() === (name || '').trim().toLowerCase());
  return found ? found.wilaya_id : '';
}

const OrderRowItem = React.memo(function OrderRowItem({ row, idx, headers }: { row: OrderRow; idx: number; headers: string[] }) {

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
      .replace(/[''`]/g, '')
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
  const smartCommuneResolver = async (
    communeName: string, 
    wilayaName: string, 
    wilayaCode: number,
    realClientData: any
  ): Promise<string> => {
    // Fonction de normalisation universelle
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
        .replace(/[''`]/g, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b(centre|ville|commune|wilaya|daira)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    // Stratégies de résolution par ordre de priorité
    const strategies = [
      // 1. Utiliser la commune telle quelle (normalisée)
      () => normalizeText(communeName),
      
      // 2. Utiliser la wilaya comme fallback
      () => normalizeText(wilayaName),
      
      // 3. Utiliser le nom de la wilaya depuis le code
      () => {
        const wilaya = WILAYAS.find(w => w.wilaya_id === wilayaCode);
        return wilaya ? normalizeText(wilaya.wilaya_name) : '';
      },
      
      // 4. Fallback sur "alger" (commune la plus commune)
      () => 'alger'
    ];

    // Tester chaque stratégie avec les VRAIES données du client
    for (const strategy of strategies) {
      const candidateCommune = strategy();
      if (!candidateCommune) continue;

      try {
        // Utiliser les vraies données du client avec la commune candidate
        const testData = {
          ...realClientData,
          commune: candidateCommune
        };

        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(testData)) {
          params.append(key, String(value));
        }

        const testUrl = `https://platform.dhd-dz.com/api/v1/create/order?${params.toString()}`;
        
        // Test rapide (timeout court pour éviter les blocages)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 secondes max

        const response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer FmEdYRuMKmZOksnzHz2gvNhassrqr8wYNf4Lwcvn2EuOkTO9VZ1RXZb1nj4i`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Si pas d'erreur 422 (commune invalide), cette commune fonctionne
        if (response.status !== 422) {
          if (candidateCommune !== normalizeText(communeName)) {
            console.log(`✅ Commune "${communeName}" → "${candidateCommune}" (fallback réussi avec vraies données)`);
          }
          return candidateCommune;
        }
      } catch (error) {
        // En cas d'erreur réseau, continuer avec la stratégie suivante
        console.log(`⚠️ Test échoué pour "${candidateCommune}":`, error);
        continue;
      }
    }

    // Si toutes les stratégies échouent, retourner la commune normalisée
    return normalizeText(communeName);
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
  
  const montant = normalizeAmount(row['Total'] || '1000');
  // stop_desk: 0 = a domicile, 1 = STOP DESK
  let stop_desk = '0';
  if ((row['Type de livraison'] || '').toLowerCase().includes('stop')) stop_desk = '1';
  else stop_desk = '0';


  const handleDownload = useCallback(async () => {
    // Demander confirmation avant l'envoi
    const confirmed = window.confirm(`Êtes-vous sûr de vouloir envoyer la validation pour ${nom_client} ?`);
    if (!confirmed) {
      return;
    }
    
    const adr = '.'; // Adresse fixe
    
    // Préparer les vraies données du client
    const realClientData = {
      nom_client: nom_client || 'CLIENT_INCONNU',
      telephone: telephone || '0000000000',
      telephone_2: telephone_2 || '0000000000',
      adresse: adr,
      code_wilaya: parseInt(String(code_wilaya)) || 16, // Fallback sur Alger
      montant: montant || '1000',
      type: '1',
      stop_desk: stop_desk || '0',
      stock: '0',
      fragile: '0',
    };
    
    // Résolution intelligente de la commune avec les vraies données
    const commune = await smartCommuneResolver(
      row['Commune'] || '', 
      row['Wilaya'] || '', 
      parseInt(String(code_wilaya)) || 16,
      realClientData
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
    
    // Appel API DHD
    try {
      const TOKEN = 'FmEdYRuMKmZOksnzHz2gvNhassrqr8wYNf4Lwcvn2EuOkTO9VZ1RXZb1nj4i';
      const BASE = 'https://platform.dhd-dz.com/api/v1';
      const PATH = '/create/order';
      
      // Créer les paramètres de requête
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(finalData)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      
      const url = `${BASE}${PATH}?${params.toString()}`;
      
      console.log('Envoi vers DHD:', url);
      console.log('Données:', finalData);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = responseText;
      }
      
      console.log('Réponse DHD:', response);
      console.log('Données de réponse:', responseData);
      
      if (response.ok && (response.status === 200 || response.status === 201)) {
        // Succès
        const tracking = responseData?.tracking || 'N/A';
        alert(`🎉 Création réussie !\n\nClient: ${nom_client}\nTracking: ${tracking}\n\nRéponse complète:\n${JSON.stringify(responseData, null, 2)}`);
      } else if (response.status === 422) {
        // Erreur de validation
        alert(`❌ Erreur de validation (422)\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(responseData, null, 2)}\n\n→ Vérifiez les champs envoyés (commune, code_wilaya, etc.)`);
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
    }
  }, [nom_client, telephone, telephone_2, code_wilaya, montant, stop_desk, idx, row]);

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
      <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
        <button
          onClick={handleDownload}
          style={{ background: '#007bff', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: 4, cursor: 'pointer' }}
        >
          Envoyer la validation
        </button>
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
                <th style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <OrderRowItem key={idx} row={row} idx={idx} headers={headers} />
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
    </div>
  );
};

export default Orders; 