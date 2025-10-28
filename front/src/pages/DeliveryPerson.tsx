import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import '../styles/DeliveryPerson.css';

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
  row?: {
    'Nom du client'?: string;
    'Numero'?: string;
    'Téléphone'?: string;
    'Adresse'?: string;
    'Commune'?: string;
    'Wilaya'?: string;
    [key: string]: any;
  };
}

const DeliveryPerson: React.FC = () => {
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'livreur') {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/orders/delivery-person/${user?.id}/orders`);
      const data = await response.json();
      
      if (data.success) {
        setOrders(data.orders);
      } else {
        setError(data.message || 'Erreur lors de la récupération des commandes');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderAction = async (orderId: string, action: 'validate' | 'cancel') => {
    try {
      const response = await fetch('/api/orders/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rowId: orderId,
          status: action === 'validate' ? 'delivered' : 'returned',
          deliveryType: 'livreur',
          deliveryPersonId: user?.id,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Mettre à jour la liste des commandes
        setOrders(prevOrders => 
          prevOrders.filter(order => order.rowId !== orderId)
        );
        alert(action === 'validate' ? 'Commande validée avec succès' : 'Commande annulée');
      } else {
        alert(data.message || 'Erreur lors de la mise à jour');
      }
    } catch (err) {
      alert('Erreur de connexion');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'delivered':
      case 'livrée':
        return 'status-delivered';
      case 'returned':
      case 'annulée':
        return 'status-cancelled';
      case 'en cours':
        return 'status-in-progress';
      case 'assigné':
        return 'status-assigned';
      default:
        return 'status-pending';
    }
  };

  if (user?.role !== 'livreur') {
    return (
      <div className="delivery-person-page">
        <div className="delivery-person-error">
          <h2>Accès non autorisé</h2>
          <p>Vous devez être connecté en tant que livreur pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="delivery-person-page">
      <header className="delivery-person-header">
        <h1>Mes Commandes</h1>
        <p>Gérez vos commandes assignées</p>
      </header>

      {loading && (
        <div className="delivery-person-loading">
          <p>Chargement des commandes...</p>
        </div>
      )}

      {error && (
        <div className="delivery-person-error">
          <p>{error}</p>
          <button onClick={fetchOrders} className="delivery-person-retry">
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="delivery-person-content">
          {orders.length === 0 ? (
            <div className="delivery-person-empty">
              <h3>Aucune commande assignée</h3>
              <p>Vous n'avez actuellement aucune commande à traiter.</p>
            </div>
          ) : (
            <div className="delivery-person-orders">
              {orders.map((order) => (
                <div key={order._id} className="delivery-person-order">
                  <div className="delivery-person-order-header">
                    <h3>Commande #{order.rowId}</h3>
                    <span className={`delivery-person-status ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                  
                  <div className="delivery-person-order-details">
                    <div className="delivery-person-order-info">
                      <p><strong>Assignée le:</strong> {formatDate(order.createdAt)}</p>
                      {order.tracking && (
                        <p><strong>Tracking:</strong> {order.tracking}</p>
                      )}
                    </div>
                    
                    {order.row && (
                      <div className="delivery-person-order-client">
                        <h4>Informations client</h4>
                        <p><strong>Nom:</strong> {String(order.row?.['Nom du client'] || 'N/A')}</p>
                        <p><strong>Téléphone:</strong> {String(order.row?.['Numero'] || order.row?.['Téléphone'] || 'N/A')}</p>
                        <p><strong>Adresse:</strong> {String(order.row?.['Adresse'] || 'N/A')}</p>
                        <p><strong>Commune:</strong> {String(order.row?.['Commune'] || 'N/A')}</p>
                        <p><strong>Wilaya:</strong> {String(order.row?.['Wilaya'] || 'N/A')}</p>
                      </div>
                    )}
                  </div>
                  
                  {order.status !== 'delivered' && order.status !== 'returned' && order.status !== 'Livrée' && order.status !== 'Annulée' && (
                    <div className="delivery-person-order-actions">
                      <button
                        onClick={() => handleOrderAction(order.rowId, 'validate')}
                        className="delivery-person-btn delivery-person-btn--success"
                      >
                        Valider la livraison
                      </button>
                      <button
                        onClick={() => handleOrderAction(order.rowId, 'cancel')}
                        className="delivery-person-btn delivery-person-btn--danger"
                      >
                        Annuler (Retour)
                      </button>
                    </div>
                  )}
                  
                  {(order.status === 'delivered' || order.status === 'returned' || order.status === 'Livrée' || order.status === 'Annulée') && (
                    <div className="delivery-person-order-completed">
                      <p className="delivery-person-completed-message">
                        {(order.status === 'delivered' || order.status === 'Livrée')
                          ? '✅ Commande livrée avec succès' 
                          : '❌ Commande annulée'}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryPerson;
