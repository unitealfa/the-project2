
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../styles/DeliveryHistory.css';

interface OrderRow {
  [key: string]: any;
  'Nom du client'?: string;
  'Numero'?: string;
  'Numero 2'?: string;
  'Téléphone'?: string;
  'Téléphone 2'?: string;
  'Adresse'?: string;
  'Commune'?: string;
  'Wilaya'?: string;
}

interface Order {
  _id: string;
  rowId: string;
  status: string;
  tracking?: string;
  deliveryType: 'api_dhd' | 'api_sook' | 'livreur';
  deliveryPersonId?: string;
  deliveryPersonName?: string;
  createdAt: string;
  updatedAt: string;
  row?: OrderRow;
}

type StatusFilter = 'all' | 'delivered' | 'returned';

const deliveredStatuses = ['delivered', 'livree'];
const returnedStatuses = ['returned', 'retour', 'retournee', 'annulee'];

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const normalize = (value?: string | null) =>
  value?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '';

const isDeliveredStatus = (status?: string) => {
  if (!status) return false;
  const normalizedStatus = normalize(status);
  return deliveredStatuses.some((candidate) => normalizedStatus.includes(candidate));
};

const isReturnedStatus = (status?: string) => {
  if (!status) return false;
  const normalizedStatus = normalize(status);
  return returnedStatuses.some((candidate) => normalizedStatus.includes(candidate));
};

const DeliveryHistory: React.FC = () => {
  const { user } = useContext(AuthContext);
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user?.role === 'livreur') {
      fetchHistory();
    }
  }, [user]);

  const fetchHistory = async () => {
    try {
      if (!user?.id) {
        setHistory([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const response = await fetch(`/api/orders/delivery-person/${user.id}/history`);
      const data = await response.json();

      if (data.success) {
        setHistory(data.orders ?? []);
        setError(null);
      } else {
        setError(data.message || 'Erreur lors du chargement de l\'historique');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = useMemo(() => {
    const term = normalize(searchTerm.trim());

    return history.filter((order) => {
      if (statusFilter === 'delivered' && !isDeliveredStatus(order.status)) {
        return false;
      }

      if (statusFilter === 'returned' && !isReturnedStatus(order.status)) {
        return false;
      }

      if (!term) {
        return true;
      }

      const clientName = normalize(String(order.row?.['Nom du client'] ?? ''));
      const rowId = normalize(order.rowId);
      const tracking = normalize(order.tracking ?? '');
      const phone = normalize(String(order.row?.['Numero'] ?? order.row?.['Téléphone'] ?? ''));

      return [clientName, rowId, tracking, phone].some((value) => value.includes(term));
    });
  }, [history, statusFilter, searchTerm]);

  const deliveredCount = history.filter((order) => isDeliveredStatus(order.status)).length;

  const returnedCount = history.filter((order) => isReturnedStatus(order.status)).length;

  if (user?.role !== 'livreur') {
    return (
      <div className="delivery-history-page">
        <div className="delivery-history-error">
          <h2>Accès refusé</h2>
          <p>Seul un livreur peut consulter l'historique de ses livraisons.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="delivery-history-page">
      <header className="delivery-history-header">
        <div>
          <h1>Historique des livraisons</h1>
          <p>Consultez les commandes que vous avez confirmées</p>
        </div>
        <Link to={`/livreur/${user.id}`} className="delivery-history-back">
          ← Retour à mes commandes
        </Link>
      </header>

      <section className="delivery-history-summary">
        <div>
          <p>Total livrées</p>
          <strong>{deliveredCount}</strong>
        </div>
        <div>
          <p>Total retournées / annulées</p>
          <strong>{returnedCount}</strong>
        </div>
        <div>
          <p>Commandes suivies</p>
          <strong>{history.length}</strong>
        </div>
      </section>

      <section className="delivery-history-toolbar">
        <div className="delivery-history-filters">
          <button
            className={statusFilter === 'all' ? 'active' : ''}
            onClick={() => setStatusFilter('all')}
            type="button"
          >
            Toutes
          </button>
          <button
            className={statusFilter === 'delivered' ? 'active' : ''}
            onClick={() => setStatusFilter('delivered')}
            type="button"
          >
            Livrées
          </button>
          <button
            className={statusFilter === 'returned' ? 'active' : ''}
            onClick={() => setStatusFilter('returned')}
            type="button"
          >
            Retours / Annulées
          </button>
        </div>
        <input
          type="search"
          placeholder="Rechercher une commande, un client ou un tracking"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </section>

      {loading && (
        <div className="delivery-history-empty">
          <p>Chargement de l'historique...</p>
        </div>
      )}

      {error && !loading && (
        <div className="delivery-history-error">
          <p>{error}</p>
          <button onClick={fetchHistory} type="button">
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="delivery-history-list">
          {filteredHistory.length === 0 ? (
            <div className="delivery-history-empty">
              <p>Aucune commande ne correspond à votre recherche.</p>
            </div>
          ) : (
            filteredHistory.map((order) => (
              <article key={order._id} className="delivery-history-card">
                <div className="delivery-history-card-header">
                  <div>
                    <h3>Commande #{order.rowId}</h3>
                    <p>Confirmée le {formatDate(order.updatedAt)}</p>
                  </div>
                  <span className={`delivery-history-status ${isDeliveredStatus(order.status) ? 'delivered' : 'returned'}`}>
                    {order.status}
                  </span>
                </div>

                <div className="delivery-history-card-body">
                  <div>
                    <p><strong>Client :</strong> {order.row?.['Nom du client'] ?? 'N/A'}</p>
                    <p><strong>Téléphone :</strong> {order.row?.['Numero'] ?? order.row?.['Téléphone'] ?? 'N/A'}</p>
                    <p><strong>Adresse :</strong> {order.row?.['Adresse'] ?? 'N/A'}</p>
                    <p><strong>Commune :</strong> {order.row?.['Commune'] ?? 'N/A'} — {order.row?.['Wilaya'] ?? 'N/A'}</p>
                  </div>
                  <div className="delivery-history-card-meta">
                    <p><strong>Assignée le :</strong> {formatDate(order.createdAt)}</p>
                    {order.tracking && (
                      <p><strong>Tracking :</strong> {order.tracking}</p>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryHistory;