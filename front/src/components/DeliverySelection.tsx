import React, { useState, useEffect, useMemo, useCallback } from 'react';

interface DeliverySelectionProps {
  onDeliveryTypeChange: (type: 'api_dhd' | 'livreur') => void;
  onDeliveryPersonChange: (personId: string | null) => void;
  deliveryType: 'api_dhd' | 'livreur';
  deliveryPersonId: string | null;
  compact?: boolean; // Nouveau prop pour le mode compact
  rowId?: string; // ID unique pour éviter les conflits
}

interface DeliveryPerson {
  id: string;
  name: string;
  email: string;
}

const DeliverySelection: React.FC<DeliverySelectionProps> = React.memo(({
  onDeliveryTypeChange,
  onDeliveryPersonChange,
  deliveryType,
  deliveryPersonId,
  compact = false,
  rowId = 'default'
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

  const currentValue = useMemo(() => {
    return deliveryType === 'api_dhd' ? 'api_dhd' : deliveryPersonId || 'api_dhd';
  }, [deliveryType, deliveryPersonId]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'api_dhd') {
      onDeliveryTypeChange('api_dhd');
      onDeliveryPersonChange(null);
    } else {
      onDeliveryTypeChange('livreur');
      onDeliveryPersonChange(value);
    }
  }, [onDeliveryTypeChange, onDeliveryPersonChange]);

  const dropdownOptions = useMemo(() => {
    return (
      <>
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
      </>
    );
  }, [deliveryPersons, loading]);

  if (compact) {
    return (
      <div className="delivery-selection-compact">
        <select
          key={`delivery-select-${rowId}`}
          value={currentValue}
          onChange={handleChange}
          className="delivery-selection-compact__select"
          disabled={loading}
        >
          {dropdownOptions}
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
});

DeliverySelection.displayName = 'DeliverySelection';

export default DeliverySelection;
