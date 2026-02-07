import React from 'react';

interface DeliveryCellProps {
  row: any;
  orderDeliverySettings: Record<string, {
    deliveryType: 'api_dhd' | 'api_sook' | 'livreur';
    deliveryPersonId: string | null;
  }>;
  setOrderDeliverySettings: React.Dispatch<React.SetStateAction<Record<string, {
    deliveryType: 'api_dhd' | 'api_sook' | 'livreur';
    deliveryPersonId: string | null;
  }>>>;
  deliveryPersons: Array<{ id: string; name: string; email: string }>;
  preserveScroll: (action: () => void | Promise<unknown>) => void;
  debugLog?: (...args: any[]) => void;
}

const DeliveryCell: React.FC<DeliveryCellProps> = ({
  row,
  orderDeliverySettings,
  setOrderDeliverySettings,
  deliveryPersons,
  preserveScroll,
  debugLog
}) => {
  const rowId = String(row["id-sheet"] || row["ID"] || "");
  const currentSettings = orderDeliverySettings[rowId] || { deliveryType: 'api_dhd', deliveryPersonId: null };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    debugLog?.("delivery-cell change", { rowId, value });
    if (value === 'api_dhd' || value === 'api_sook') {
      setOrderDeliverySettings(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          deliveryType: value,
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

  const currentValue = currentSettings.deliveryType === 'livreur'
    ? currentSettings.deliveryPersonId || 'api_dhd'
    : currentSettings.deliveryType;

  return (
    <div className="delivery-selection-compact">
      <select
        value={currentValue}
        onChange={handleChange}
        className="delivery-selection-compact__select"
        onClick={(event) => event.stopPropagation()}
      >
        <option value="api_dhd">BL Bébé (API)</option>
        <option value="api_sook">Sook en ligne (API)</option>
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
