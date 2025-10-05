import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { OrderDto } from '../types';

const WILAYA_NAMES: Record<number, string> = {
  1: 'Adrar',
  2: 'Chlef',
  3: 'Laghouat',
  4: 'Oum El Bouaghi',
  5: 'Batna',
  6: 'Béjaïa',
  7: 'Biskra',
  8: 'Béchar',
  9: 'Blida',
  10: 'Bouira',
  11: 'Tamanrasset',
  12: 'Tébessa',
  13: 'Tlemcen',
  14: 'Tiaret',
  15: 'Tizi Ouzou',
  16: 'Alger',
  17: 'Djelfa',
  18: 'Jijel',
  19: 'Sétif',
  20: 'Saïda',
  21: 'Skikda',
  22: "Sidi Bel Abbès",
  23: 'Annaba',
  24: 'Guelma',
  25: 'Constantine',
  26: 'Médéa',
  27: 'Mostaganem',
  28: "M'Sila",
  29: 'Mascara',
  30: 'Ouargla',
  31: 'Oran',
  32: 'El Bayadh',
  33: 'Illizi',
  34: 'Bordj Bou Arreridj',
  35: 'Boumerdès',
  36: 'El Tarf',
  37: 'Tindouf',
  38: 'Tissemsilt',
  39: 'El Oued',
  40: 'Khenchela',
  41: 'Souk Ahras',
  42: 'Tipaza',
  43: 'Mila',
  44: 'Aïn Defla',
  45: 'Naâma',
  46: 'Aïn Témouchent',
  47: 'Ghardaïa',
  48: 'Relizane',
};

const Confirmateur: React.FC = () => {
  const { user, token } = useContext(AuthContext);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Erreur ${res.status}`);
      }
      const payload = await res.json();
      const list: OrderDto[] = Array.isArray(payload?.orders)
        ? payload.orders.map((o: any) => ({
            id: o._id,
            reference: o.reference,
            customerName: o.customerName,
            phone: o.phone,
            address: o.address,
            commune: o.commune,
            wilayaCode: o.wilayaCode,
            amount: o.amount,
            status: o.status,
            carrierPayload: o.carrierPayload || null,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
          }))
        : [];
      setOrders(list);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du chargement des commandes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && user?.role === 'confirmateur') {
      fetchOrders();
    }
  }, [token, user, fetchOrders]);

  const handleStatusUpdate = useCallback(
    async (orderId: string, nextStatus: string) => {
      if (!token) return;
      setUpdating(orderId);
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.message || `Impossible de mettre à jour (${res.status})`);
        }
        const updatedOrder = data?.order;
        setOrders(prev => prev.map(order => (order.id === orderId ? {
          ...order,
          status: updatedOrder?.status ?? nextStatus,
          updatedAt: updatedOrder?.updatedAt ?? new Date().toISOString(),
        } : order)));
      } catch (err: any) {
        alert(err?.message || 'Erreur lors de la mise à jour du statut');
      } finally {
        setUpdating(null);
      }
    },
    [token]
  );

  const filteredOrders = useMemo(() => {
    if (!query.trim()) return orders;
    const q = query.trim().toLowerCase();
    return orders.filter(order => {
      const haystack = [
        order.reference,
        order.customerName,
        order.phone,
        order.commune,
        WILAYA_NAMES[order.wilayaCode] || String(order.wilayaCode),
      ];
      return haystack.some(value => value && value.toLowerCase().includes(q));
    });
  }, [orders, query]);

  if (!user) {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Non authentifié</p>;
  }

  if (user.role !== 'confirmateur') {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Accès refusé</p>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Tableau de confirmation</h2>
          <p style={{ margin: 0, color: '#666' }}>Commandes importées automatiquement</p>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          style={{
            padding: '0.5rem 0.9rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Rechercher (référence, client, wilaya, téléphone…)"
          style={{ flex: 1, minWidth: 260, padding: '0.45rem 0.6rem' }}
        />
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: 6, marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={thStyle}>Référence</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Téléphone</th>
              <th style={thStyle}>Wilaya</th>
              <th style={thStyle}>Commune</th>
              <th style={thStyle}>Montant (DA)</th>
              <th style={thStyle}>Statut</th>
              <th style={thStyle}>Importée le</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(order => {
              const wilayaName = WILAYA_NAMES[order.wilayaCode] || `#${order.wilayaCode}`;
              return (
                <tr key={order.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}>{order.reference}</td>
                  <td style={tdStyle}>{order.customerName || '-'}</td>
                  <td style={tdStyle}>{order.phone || '-'}</td>
                  <td style={tdStyle}>{wilayaName}</td>
                  <td style={tdStyle}>{order.commune || '-'}</td>
                  <td style={tdStyle}>{order.amount?.toLocaleString('fr-FR')}</td>
                  <td style={tdStyle}>{order.status}</td>
                  <td style={tdStyle}>{new Date(order.createdAt).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleStatusUpdate(order.id, 'prete_a_expedier')}
                        disabled={updating === order.id}
                        style={buttonSecondaryStyle}
                      >
                        Prête à expédier
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(order.id, 'livree')}
                        disabled={updating === order.id}
                        style={buttonPrimaryStyle}
                      >
                        Marquer livrée
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                  Aucune commande trouvée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.5rem',
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#475569',
};

const tdStyle: React.CSSProperties = {
  padding: '0.65rem 0.5rem',
  fontSize: 14,
  color: '#1e293b',
};

const buttonPrimaryStyle: React.CSSProperties = {
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  padding: '0.35rem 0.65rem',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};

const buttonSecondaryStyle: React.CSSProperties = {
  background: '#f97316',
  color: '#fff',
  border: 'none',
  padding: '0.35rem 0.65rem',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};

export default Confirmateur;

