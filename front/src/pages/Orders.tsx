import React from 'react';

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
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  {headers.map(h => (
                    <td key={h} style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
                      {row[h] || ''}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={headers.length} style={{ padding: '0.8rem' }}>
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