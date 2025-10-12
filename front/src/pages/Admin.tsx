// front/src/pages/Admin.tsx

import React, { useEffect, useState, useContext } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const Admin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(10);
  const [showButton, setShowButton] = useState<boolean>(true);
  const adminUser = user && user.role === "admin" ? user : null;

  useEffect(() => {
    if (!adminUser) {
      return;
    }
    if (id && adminUser.id !== id) {
      navigate(`/admin/${adminUser.id}`, { replace: true });
    }
  }, [adminUser, id, navigate]);

  // Chargement des commandes (Google Sheet) pour calculer le montant total visualisé
  useEffect(() => {
    const SHEET_ID = '1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q';
    const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

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
      { id: 1, name: 'Adrar' },{ id: 2, name: 'Chlef' },{ id: 3, name: 'Laghouat' },{ id: 4, name: 'Oum El Bouaghi' },{ id: 5, name: 'Batna' },{ id: 6, name: 'Béjaïa' },{ id: 7, name: 'Biskra' },{ id: 8, name: 'Béchar' },{ id: 9, name: 'Blida' },{ id: 10, name: 'Bouira' },{ id: 11, name: 'Tamanrasset' },{ id: 12, name: 'Tébessa' },{ id: 13, name: 'Tlemcen' },{ id: 14, name: 'Tiaret' },{ id: 15, name: 'Tizi Ouzou' },{ id: 16, name: 'Alger' },{ id: 17, name: 'Djelfa' },{ id: 18, name: 'Jijel' },{ id: 19, name: 'Sétif' },{ id: 20, name: 'Saïda' },{ id: 21, name: 'Skikda' },{ id: 22, name: 'Sidi Bel Abbès' },{ id: 23, name: 'Annaba' },{ id: 24, name: 'Guelma' },{ id: 25, name: 'Constantine' },{ id: 26, name: 'Médéa' },{ id: 27, name: 'Mostaganem' },{ id: 28, name: "M'Sila" },{ id: 29, name: 'Mascara' },{ id: 30, name: 'Ouargla' },{ id: 31, name: 'Oran' },{ id: 32, name: 'El Bayadh' },{ id: 33, name: 'Illizi' },{ id: 34, name: 'Bordj Bou Arreridj' },{ id: 35, name: 'Boumerdès' },{ id: 36, name: 'El Tarf' },{ id: 37, name: 'Tindouf' },{ id: 38, name: 'Tissemsilt' },{ id: 39, name: 'El Oued' },{ id: 40, name: 'Khenchela' },{ id: 41, name: 'Souk Ahras' },{ id: 42, name: 'Tipaza' },{ id: 43, name: 'Mila' },{ id: 44, name: 'Aïn Defla' },{ id: 45, name: 'Naâma' },{ id: 46, name: 'Aïn Témouchent' },{ id: 47, name: 'Ghardaïa' },{ id: 48, name: 'Relizane' }
    ];

    const DELIVERY_TARIFFS: Record<number, { domicile: number; stop: number }> = {
      1:{domicile:1100,stop:600},2:{domicile:700,stop:400},3:{domicile:900,stop:500},4:{domicile:800,stop:400},5:{domicile:800,stop:400},6:{domicile:700,stop:400},7:{domicile:900,stop:500},8:{domicile:1100,stop:600},9:{domicile:500,stop:250},10:{domicile:650,stop:400},11:{domicile:1300,stop:800},12:{domicile:800,stop:500},13:{domicile:800,stop:400},14:{domicile:800,stop:400},15:{domicile:650,stop:400},16:{domicile:400,stop:200},17:{domicile:900,stop:500},18:{domicile:700,stop:400},19:{domicile:700,stop:400},20:{domicile:800,stop:400},21:{domicile:700,stop:400},22:{domicile:700,stop:400},23:{domicile:700,stop:400},24:{domicile:800,stop:400},25:{domicile:700,stop:400},26:{domicile:600,stop:400},27:{domicile:700,stop:400},28:{domicile:800,stop:500},29:{domicile:700,stop:400},30:{domicile:1000,stop:500},31:{domicile:700,stop:400},32:{domicile:1000,stop:500},33:{domicile:1300,stop:600},34:{domicile:700,stop:400},35:{domicile:600,stop:350},36:{domicile:800,stop:400},37:{domicile:1300,stop:600},38:{domicile:800,stop:400},39:{domicile:900,stop:500},40:{domicile:800,stop:500},41:{domicile:800,stop:500},42:{domicile:600,stop:350},43:{domicile:700,stop:400},44:{domicile:600,stop:400},45:{domicile:1000,stop:500},46:{domicile:700,stop:400},47:{domicile:1000,stop:500},48:{domicile:700,stop:400},49:{domicile:1300,stop:600},51:{domicile:900,stop:500},52:{domicile:1300,stop:0},53:{domicile:1300,stop:600},55:{domicile:900,stop:500},57:{domicile:900,stop:0},58:{domicile:1000,stop:500}
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
      if (!amount) return 1000;
      let normalized = amount.replace(/[^\d.,]/g, '').replace(',', '.');
      const n = parseFloat(normalized);
      if (Number.isNaN(n)) return 1000;
      return n;
    };

    (async () => {
      try {
        const res = await fetch(CSV_URL);
        const text = await res.text();
        const grid = parseCsv(text);
        if (grid.length === 0) return;
        const [hdr, ...data] = grid;
        setHeaders(hdr);
        const mapped = data
          .filter(r => r.some(cell => cell && cell.trim() !== ''))
          .map(r => {
            const o: Record<string, string> = {};
            hdr.forEach((h, i) => o[h] = r[i] ?? '');
            // Calculer et injecter le montant total calculé
            const qty = parseInt((o['Quantité'] || o['Quantite'] || o['Qte'] || '1').toString().replace(/[^\d]/g, '')) || 1;
            const unit = normalizeAmount(o['Total'] || '1000');
            const code = getWilayaIdByName(o['Wilaya']);
            const stopFlag = (o['Type de livraison'] || '').toLowerCase().includes('stop') ? '1' : '0';
            const tariff = getDeliveryTariff(code, stopFlag);
            const grand = unit * qty + tariff;
            o['__MONTANT_TOTAL_CALC__'] = String(grand);
            return o;
          });
        setRows(mapped);
      } catch (e) {
        // silencieux
      }
    })();
  }, []);

  // Si pas connecté ou pas admin
  if (!adminUser) {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem" }}>
        Accès non autorisé
      </p>
    );
  }
  // Erreur ou chargement
  if (id && adminUser.id !== id) {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem" }}>Chargement…</p>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "2rem auto" }}>
      <h1>
        Bienvenue {adminUser.firstName} {adminUser.lastName}
      </h1>

      {/* Tableau commandes avec montant total en rouge */}
      <div style={{ marginTop: '2rem', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r, i) => {
              return (
                <tr key={i}>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Admin;
