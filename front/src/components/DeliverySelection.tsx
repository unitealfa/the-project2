import React, { useState, useEffect } from 'react';

interface DeliverySelectionProps {
  onDeliveryTypeChange: (type: 'api_dhd' | 'livreur') => void;
  onDeliveryPersonChange: (personId: string | null) => void;
  deliveryType: 'api_dhd' | 'livreur';
  deliveryPersonId: string | null;
  compact?: boolean; // Nouveau prop pour le mode compact
}

interface DeliveryPerson {
  id: string;
  name: string;
  email: string;
}

const DeliverySelection: React.FC<DeliverySelectionProps> = ({
  onDeliveryTypeChange,
  onDeliveryPersonChange,
  deliveryType,
  deliveryPersonId,
  compact = false
}) => {
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDeliveryPersons = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/orders/delivery-persons');
        const data = await response.json();
        if (data.success) {
          setDeliveryPersons(data.deliveryPersons);
        }
      } catch (error) {
        console.error('Erreur lors de la récupération des livreurs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDeliveryPersons();
  }, []);

  if (compact) {
    return (
      <div className="delivery-selection-compact">
        <select
          value={deliveryType === 'api_dhd' ? 'api_dhd' : deliveryPersonId || ''}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'api_dhd') {
              onDeliveryTypeChange('api_dhd');
              onDeliveryPersonChange(null);
            } else {
              onDeliveryTypeChange('livreur');
              onDeliveryPersonChange(value);
            }
          }}
          className="delivery-selection-compact__select"
          disabled={loading}
        >
          <option value="api_dhd">DHD (par défaut)</option>
          {deliveryPersons.length === 0 && !loading ? (
            <option value="" disabled>Aucun livreur disponible</option>
          ) : (
            deliveryPersons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))
          )}
        </select>
      </div>
    );
  }

  return (
    <div className="delivery-selection">
      <div className="delivery-selection__type">
        <label className="delivery-selection__label">
          <input
            type="radio"
            name="deliveryType"
            value="api_dhd"
            checked={deliveryType === 'api_dhd'}
            onChange={(e) => {
              onDeliveryTypeChange('api_dhd');
              onDeliveryPersonChange(null);
            }}
          />
          <span>API DHD (par défaut)</span>
        </label>
        
        <label className="delivery-selection__label">
          <input
            type="radio"
            name="deliveryType"
            value="livreur"
            checked={deliveryType === 'livreur'}
            onChange={(e) => onDeliveryTypeChange('livreur')}
          />
          <span>Livreur</span>
        </label>
      </div>

      {deliveryType === 'livreur' && (
        <div className="delivery-selection__person">
          <label htmlFor="deliveryPerson" className="delivery-selection__person-label">
            Sélectionner un livreur:
          </label>
          <select
            id="deliveryPerson"
            value={deliveryPersonId || ''}
            onChange={(e) => onDeliveryPersonChange(e.target.value || null)}
            className="delivery-selection__person-select"
            disabled={loading}
          >
            <option value="">-- Choisir un livreur --</option>
            {deliveryPersons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.email})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default DeliverySelection;
