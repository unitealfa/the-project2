// front/src/pages/Confirmateur.tsx

import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { parseLocaleAmount, parsePositiveIntegerQuantity } from '../utils/numberParsing';
import '../styles/Confirmateur.css';

const Confirmateur: React.FC = () => {
  const { user } = useContext(AuthContext);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const parseCsv = (csvText: string): string[][] => {
      const out: string[][] = [];
      let field = '';
      let row: string[] = [];
      let inQuotes = false;
      for (let i = 0; i < csvText.length; i++) {
        const c = csvText[i];
        const n = csvText[i + 1];
        if (inQuotes) {
          if (c === '"') { if (n === '"') { field += '"'; i++; } else { inQuotes = false; } }
          else { field += c; }
        } else {
          if (c === '"') inQuotes = true;
          else if (c === ',') { row.push(field); field = ''; }
          else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
          else if (c === '\r') { /* ignore */ }
          else { field += c; }
        }
      }
      if (field.length > 0 || inQuotes || row.length > 0) { row.push(field); out.push(row); }
      return out;
    };

    const WILAYAS = [
      { id: 1, name: 'Adrar' },{ id: 2, name: 'Chlef' },{ id: 3, name: 'Laghouat' },{ id: 4, name: 'Oum El Bouaghi' },{ id: 5, name: 'Batna' },{ id: 6, name: 'Béjaïa' },{ id: 7, name: 'Biskra' },{ id: 8, name: 'Béchar' },{ id: 9, name: 'Blida' },{ id: 10, name: 'Bouira' },{ id: 11, name: 'Tamanrasset' },{ id: 12, name: 'Tébessa' },{ id: 13, name: 'Tlemcen' },{ id: 14, name: 'Tiaret' },{ id: 15, name: 'Tizi Ouzou' },{ id: 16, name: 'Alger' },{ id: 17, name: 'Djelfa' },{ id: 18, name: 'Jijel' },{ id: 19, name: 'Sétif' },{ id: 20, name: 'Saïda' },{ id: 21, name: 'Skikda' },{ id: 22, name: 'Sidi Bel Abbès' },{ id: 23, name: 'Annaba' },{ id: 24, name: 'Guelma' },{ id: 25, name: 'Constantine' },{ id: 26, name: 'Médéa' },{ id: 27, name: 'Mostaganem' },{ id: 28, name: "M'Sila" },{ id: 29, name: 'Mascara' },{ id: 30, name: 'Ouargla' },{ id: 31, name: 'Oran' },{ id: 32, name: 'El Bayadh' },{ id: 33, name: 'Illizi' },{ id: 34, name: 'Bordj Bou Arreridj' },{ id: 35, name: 'Boumerdès' },{ id: 36, name: 'El Tarf' },{ id: 37, name: 'Tindouf' },{ id: 38, name: 'Tissemsilt' },{ id: 39, name: 'El Oued' },{ id: 40, name: 'Khenchela' },{ id: 41, name: 'Souk Ahras' },{ id: 42, name: 'Tipaza' },{ id: 43, name: 'Mila' },{ id: 44, name: 'Aïn Defla' },{ id: 45, name: 'Naâma' },{ id: 46, name: 'Aïn Témouchent' },{ id: 47, name: 'Ghardaïa' },{ id: 48, name: 'Relizane' },{ id: 49, name: 'Timimoun' },{ id: 50, name: 'Bordj Badji Mokhtar' },{ id: 51, name: 'Ouled Djellal' },{ id: 52, name: 'Beni Abbes' },{ id: 53, name: 'In Salah' },{ id: 54, name: 'In Guezzam' },{ id: 55, name: 'Touggourt' },{ id: 56, name: 'Djanet' },{ id: 57, name: "El M'Ghair" },{ id: 58, name: 'El Meniaa' }
    ];

    const DELIVERY_TARIFFS: Record<number, { domicile: number; stop: number }> = {
      1:{domicile:1100,stop:600},2:{domicile:700,stop:400},3:{domicile:900,stop:500},4:{domicile:800,stop:400},5:{domicile:800,stop:400},6:{domicile:700,stop:400},7:{domicile:900,stop:500},8:{domicile:1100,stop:600},9:{domicile:500,stop:250},10:{domicile:650,stop:400},11:{domicile:1300,stop:800},12:{domicile:800,stop:500},13:{domicile:800,stop:400},14:{domicile:800,stop:400},15:{domicile:650,stop:400},16:{domicile:400,stop:200},17:{domicile:900,stop:500},18:{domicile:700,stop:400},19:{domicile:700,stop:400},20:{domicile:800,stop:400},21:{domicile:700,stop:400},22:{domicile:700,stop:400},23:{domicile:700,stop:400},24:{domicile:800,stop:400},25:{domicile:700,stop:400},26:{domicile:600,stop:400},27:{domicile:700,stop:400},28:{domicile:800,stop:500},29:{domicile:700,stop:400},30:{domicile:1000,stop:500},31:{domicile:700,stop:400},32:{domicile:1000,stop:500},33:{domicile:1300,stop:600},34:{domicile:700,stop:400},35:{domicile:600,stop:350},36:{domicile:800,stop:400},37:{domicile:1300,stop:600},38:{domicile:800,stop:400},39:{domicile:900,stop:500},40:{domicile:800,stop:500},41:{domicile:800,stop:500},42:{domicile:600,stop:350},43:{domicile:700,stop:400},44:{domicile:600,stop:400},45:{domicile:1000,stop:500},46:{domicile:700,stop:400},47:{domicile:1000,stop:500},48:{domicile:700,stop:400},49:{domicile:1300,stop:600},50:{domicile:1500,stop:800},51:{domicile:900,stop:500},52:{domicile:1300,stop:0},53:{domicile:1300,stop:600},54:{domicile:1500,stop:800},55:{domicile:900,stop:500},56:{domicile:1500,stop:800},57:{domicile:900,stop:0},58:{domicile:1000,stop:500}
    };

    const getWilayaIdByName = (name: string) => {
      const normalize = (s: string) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
      const target = normalize(name);
      const found = WILAYAS.find(w => normalize(w.name) === target);
      return found ? found.id : 16;
    };

    const getDeliveryTariff = (wilayaCode: number | string, stopDeskFlag: string | number) => {
      const code = typeof wilayaCode === 'string' ? parseInt(wilayaCode) : wilayaCode;
      const isStop = String(stopDeskFlag) === '1';
      const safe = (!code || Number.isNaN(code)) ? 16 : code;
      let tariffs = DELIVERY_TARIFFS[safe];
      if (!tariffs) tariffs = DELIVERY_TARIFFS[16];
      if (!tariffs) return 0;
      return isStop ? tariffs.stop : tariffs.domicile;
    };

    const normalizeAmount = (amount: string): number => {
      return parseLocaleAmount(amount) ?? 1000;
    };

    (async () => {
      try {
        const res = await apiFetch('/api/orders/sheet', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const grid = parseCsv(text);
        if (grid.length === 0) return;
        const [hdr, ...data] = grid;
        const mapped = data
          .filter(r => r.some(cell => cell && cell.trim() !== ''))
          .map(r => {
            const o: Record<string, string> = {};
            hdr.forEach((h, i) => o[h] = r[i] ?? '');
            const qty = parsePositiveIntegerQuantity(o['Quantité'] || o['Quantite'] || o['Qte']) ?? 1;
            const unit = normalizeAmount(o['Total'] || '1000');
            const code = getWilayaIdByName(o['Wilaya']);
            const stopFlag = (o['Type de livraison'] || '').toLowerCase().includes('stop') ? '1' : '0';
            const tariff = getDeliveryTariff(code, stopFlag);
            const grand = unit * qty + tariff;
            o['__MONTANT_TOTAL_CALC__'] = String(grand);
            return o;
          });
        setRows(mapped);
        setLoadError('');
      } catch {
        setLoadError('Les statistiques de commandes sont momentanément indisponibles.');
      }
    })();
  }, []);

  if (!user) {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Non authentifié</p>;
  }
  if (user.role !== 'confirmateur') {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Accès refusé</p>;
  }

  const normalizeStatus = (row: Record<string, string>) =>
    String(row.etat ?? row['État'] ?? row.Etat ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  const finalStatuses = new Set(['delivered', 'livree', 'returned', 'retours', 'abandoned', 'annulee']);
  const finalizedCount = rows.filter((row) => finalStatuses.has(normalizeStatus(row))).length;
  const pendingCount = rows.filter((row) => {
    const status = normalizeStatus(row);
    return !status || status === 'new' || status === 'en attente';
  }).length;

  return (
    <div className="confirmateur-page">
      <header className="confirmateur-hero">
        <p className="confirmateur-role">Rôle : Confirmateur</p>
        <h1>Bienvenue {user.firstName} {user.lastName}</h1>
        <p className="confirmateur-subtitle">
          Retrouvez ici toutes les informations essentielles pour préparer vos journées de confirmation.
          Ce tableau de bord mobile-first regroupe les tâches clés et des rappels rapides pour vous aider à rester concentré.
        </p>
        <Link
          to={`/confirmateur/${user.id}/orders`}
          className="confirmateur-primary-action"
        >
          Accéder aux commandes
        </Link>
      </header>

      <section className="confirmateur-grid">
        {loadError && <p role="alert" className="confirmateur-card-note">{loadError}</p>}
        <article className="confirmateur-card">
          <h2>Résumé du jour</h2>
          <ul>
            <li><strong>Commandes chargées :</strong> {rows.length}</li>
            <li><strong>Commandes à confirmer :</strong> {pendingCount}</li>
            <li><strong>Commandes finalisées :</strong> {finalizedCount}</li>
          </ul>
          <p className="confirmateur-card-note">Ces chiffres proviennent de la feuille de commandes protégée.</p>
        </article>

        <article className="confirmateur-card">
          <h2>Raccourcis utiles</h2>
          <ul className="confirmateur-shortcuts">
            <li>✅ Vérifier les coordonnées clients avant d'appeler</li>
            <li>📦 Confirmer le mode de livraison et la disponibilité</li>
            <li>🗒️ Noter les retours et commentaires importants</li>
          </ul>
        </article>

        <article className="confirmateur-card">
          <h2>Conseils rapides</h2>
          <p>
            Adoptez un ton cordial et rassurant, privilégiez les créneaux horaires annoncés et gardez toujours un historique
            des échanges pour faciliter le suivi par les gestionnaires.
          </p>
          <p>
            En cas d'imprévu, informez immédiatement l'équipe logistique afin de réattribuer la commande au besoin.
          </p>
        </article>
      </section>

      <footer className="confirmateur-footer">
        <p><strong>Email :</strong> {user.email}</p>
        <p className="confirmateur-footer-note">
          Un doute ou une urgence ? Contactez le support interne pour obtenir de l'aide rapide.
        </p>
      </footer>
    </div>
  );
};

export default Confirmateur;
