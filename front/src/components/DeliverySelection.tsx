import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from '../utils/api';

type DeliveryType = 'api_dhd' | 'api_sook' | 'livreur';

interface DeliverySelectionProps {
  onDeliveryTypeChange: (type: DeliveryType) => void;
  onDeliveryPersonChange: (personId: string | null) => void;
  deliveryType: DeliveryType;
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
        const response = await apiFetch('/api/orders/delivery-persons');
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
    if (deliveryType === 'livreur') {
      return deliveryPersonId || 'api_dhd';
    }
    return deliveryType;
  }, [deliveryType, deliveryPersonId]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'api_dhd' || value === 'api_sook') {
      onDeliveryTypeChange(value);
      onDeliveryPersonChange(null);
    } else {
      onDeliveryTypeChange('livreur');
      onDeliveryPersonChange(value);
    }
  }, [onDeliveryTypeChange, onDeliveryPersonChange]);

  const dropdownOptions = useMemo(() => {
    return (
      <>
        <option value="api_dhd">BL Bébé (API)</option>
        <option value="api_sook">Sook en ligne (API)</option>
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
          <span>API BL Bébé</span>
        </label>

        <label className="delivery-selection__label">
          <input
            type="radio"
            name="deliveryType"
            value="api_sook"
            checked={deliveryType === 'api_sook'}
            onChange={() => {
              onDeliveryTypeChange('api_sook');
              onDeliveryPersonChange(null);
            }}
          />
          <span>API Sook en ligne</span>
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
