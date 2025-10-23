import React from 'react';

interface DeliveryCellProps {
  row: any;
  orderDeliverySettings: Record<string, {
    deliveryType: 'api_dhd' | 'livreur';
    deliveryPersonId: string | null;
  }>;
  setOrderDeliverySettings: React.Dispatch<React.SetStateAction<Record<string, {
    deliveryType: 'api_dhd' | 'livreur';
    deliveryPersonId: string | null;
  }>>>;
  deliveryPersons: Array<{ id: string; name: string; email: string }>;
}

const DeliveryCell: React.FC<DeliveryCellProps> = ({
  row,
  orderDeliverySettings,
  setOrderDeliverySettings,
  deliveryPersons
}) => {
  const rowId = String(row["id-sheet"] || row["ID"] || "");
  const currentSettings = orderDeliverySettings[rowId] || { deliveryType: 'api_dhd', deliveryPersonId: null };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'api_dhd') {
      setOrderDeliverySettings(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          deliveryType: 'api_dhd',
          deliveryPersonId: null
        }
      }));
    } else {
      setOrderDeliverySettings(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          deliveryType: 'livreur',
          deliveryPersonId: value
        }
      }));
    }
  };

  const currentValue = currentSettings.deliveryType === 'api_dhd' ? 'api_dhd' : currentSettings.deliveryPersonId || 'api_dhd';

  return (
    <div className="delivery-selection-compact">
      <select
        value={currentValue}
        onChange={handleChange}
        className="delivery-selection-compact__select"
      >
        <option value="api_dhd">DHD (par défaut)</option>
        {deliveryPersons.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DeliveryCell;
