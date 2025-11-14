import React, { useState, useEffect, useContext } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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

const formatPhoneNumber = (value?: string | number | null): string => {
  if (value === undefined || value === null) {
    return 'N/A';
  }

  const raw = String(value).trim();
  if (!raw) {
    return 'N/A';
  }

  let digits = raw.replace(/\D/g, '');
  if (!digits) {
    return 'N/A';
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('213') && digits.length >= 12) {
    digits = digits.slice(3);
  }

  if (digits.length === 9) {
    digits = `0${digits}`;
  } else if (!digits.startsWith('0') && digits.length > 9) {
    digits = `0${digits.slice(-9)}`;
  } else if (!digits.startsWith('0')) {
    digits = `0${digits}`;
  }

  if (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.slice(0, 10);
  }

  return digits || 'N/A';
};

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

  const handleDownloadBordereau = async (order: Order) => {
    const pdfElementId = `delivery-person-pdf-${order._id || order.rowId}`;
    const element = document.getElementById(pdfElementId);

    if (!element) {
      alert('Impossible de générer le bordereau pour cette commande.');
      return;
    }

    try {
       const canvas = await html2canvas(element, {
        scale: window.devicePixelRatio || 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = (canvas.height * pageWidth) / canvas.width;

      pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight);
      pdf.save(`bordereau_${order.rowId || order._id}.pdf`);
    } catch (err) {
      console.error('Erreur lors de la génération du PDF:', err);
      alert('Erreur lors de la génération du bordereau');
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
              {orders.map((order) => {
                const primaryPhone = formatPhoneNumber(order.row?.['Numero'] ?? order.row?.['Téléphone']);
                const secondaryPhone = formatPhoneNumber(order.row?.['Numero 2'] ?? order.row?.['Téléphone 2']);
                const phoneParts = [primaryPhone, secondaryPhone].filter(phone => phone && phone !== 'N/A');
                const phoneDisplay = phoneParts.length > 0 ? phoneParts.join(' / ') : 'N/A';
                const pdfElementId = `delivery-person-pdf-${order._id || order.rowId}`;

                return (
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
                        <p><strong>Téléphone:</strong> {phoneDisplay}</p>
                        <p><strong>Adresse:</strong> {String(order.row?.['Adresse'] || 'N/A')}</p>
                        <p><strong>Commune:</strong> {String(order.row?.['Commune'] || 'N/A')}</p>
                        <p><strong>Wilaya:</strong> {String(order.row?.['Wilaya'] || 'N/A')}</p>
                      </div>
                    )}
                  </div>
                  
                    <div className="delivery-person-order-actions">
                    <button
                      onClick={() => handleDownloadBordereau(order)}
                      className="delivery-person-btn delivery-person-btn--info"
                      style={{ marginBottom: order.status !== 'delivered' && order.status !== 'returned' && order.status !== 'Livrée' && order.status !== 'Annulée' ? '10px' : '0' }}
                    >
                      📄 Télécharger le bordereau
                    </button>
                    {order.status !== 'delivered' && order.status !== 'returned' && order.status !== 'Livrée' && order.status !== 'Annulée' && (
                      <>
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
                      </>
                    )}
                  </div>
                  
                  {(order.status === 'delivered' || order.status === 'returned' || order.status === 'Livrée' || order.status === 'Annulée') && (
                      <div className="delivery-person-order-completed">
                        <p className="delivery-person-completed-message">
                          {(order.status === 'delivered' || order.status === 'Livrée')
                            ? '✅ Commande livrée avec succès'
                            : '❌ Commande annulée'}
                        </p>
                      </div>
                    )}
                    <div id={pdfElementId} className="delivery-person-pdf-card" aria-hidden="true">
                      <div className="delivery-person-pdf-header">
                        <h2>Commande #{order.rowId}</h2>
                        <p><strong>Assignée le:</strong> {formatDate(order.createdAt)}</p>
                        {order.tracking && (
                          <p><strong>Tracking:</strong> {order.tracking}</p>
                        )}
                      </div>
                      <div className="delivery-person-pdf-section">
                        <h3>Informations client</h3>
                        <p><span>Nom:</span> {String(order.row?.['Nom du client'] || 'N/A')}</p>
                        <p><span>Téléphone:</span> {phoneDisplay}</p>
                        <p><span>Adresse:</span> {String(order.row?.['Adresse'] || 'N/A')}</p>
                        <p><span>Commune:</span> {String(order.row?.['Commune'] || 'N/A')}</p>
                        <p><span>Wilaya:</span> {String(order.row?.['Wilaya'] || 'N/A')}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryPerson;
