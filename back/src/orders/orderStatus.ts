export type BusinessOrderStatus =
  | 'ready_to_ship'
  | 'SHIPPED'
  | 'suspended'
  | 'livrée'
  | 'RETURN_IN_PROGRESS'
  | 'retours'
  | 'abandoned';

const normalize = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const OFFICIAL_SYNC_TERMINAL_STATUSES = [
  'returned',
  'retours',
  'abandoned',
  'annulée',
  'annulee',
  'canceled',
  'cancelled',
] as const;

const OFFICIAL_SYNC_TERMINAL_STATUS_SET = new Set<string>(
  OFFICIAL_SYNC_TERMINAL_STATUSES.map(normalize)
);

const READY_TO_SHIP = new Set([
  'prete a expedier',
  'pret a expedier',
  'prete a preparer',
  'pret a preparer',
  'order information received by carrier',
]);

const IN_TRANSIT = new Set([
  'en ramassage',
  'en preparation stock',
  'stock en preparation',
  'vers hub',
  'en hub',
  'vers wilaya',
  'en preparation',
  'en livraison',
  'picked',
  'accepted by carrier',
  'dispatched to driver',
  'attempt delivery',
]);

const SUSPENDED = new Set(['suspendu', 'suspendus', 'suspended']);

const DELIVERED = new Set([
  'livre',
  'livree',
  'delivered',
  'livre non encaisse',
  'encaisse non paye',
  'paiements prets',
  'paiement pret',
  'paye et archive',
  'livred',
  'encaissed',
  'payed',
]);

const RETURN_IN_PROGRESS = new Set([
  'retour demande',
  'retour asked',
  'return asked',
  'retour chez livreur',
  'retours chez livreur',
  'retour transit entrepot',
  'retour en traitement',
  'retours en traitement',
  'retours prets',
  'retours a dispatcher vers stock',
  'retours en transit stock',
  'return in transit',
]);

const RETURNED = new Set([
  'retour recu',
  'retours recu',
  'retours recus',
  'retour archive',
  'retours archive',
  'retours en stock',
  'return received',
  'returned',
  'retours',
]);

const CANCELLED = new Set([
  'annule',
  'annulee',
  'canceled',
  'cancelled',
  'abandoned',
]);

export const mapCarrierStatus = (
  carrierStatus: unknown
): BusinessOrderStatus | null => {
  if (typeof carrierStatus !== 'string' || !carrierStatus.trim()) {
    return null;
  }

  const status = normalize(carrierStatus);
  if (READY_TO_SHIP.has(status)) return 'ready_to_ship';
  if (IN_TRANSIT.has(status)) return 'SHIPPED';
  if (SUSPENDED.has(status)) return 'suspended';
  if (DELIVERED.has(status)) return 'livrée';
  if (RETURN_IN_PROGRESS.has(status)) return 'RETURN_IN_PROGRESS';
  if (RETURNED.has(status)) return 'retours';
  if (CANCELLED.has(status)) return 'abandoned';
  return null;
};

export const isFinalBusinessStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') return false;
  const normalized = normalize(status);
  return (
    DELIVERED.has(normalized) ||
    RETURNED.has(normalized) ||
    CANCELLED.has(normalized)
  );
};

export const shouldContinueOfficialStatusSync = (status: unknown): boolean =>
  typeof status !== 'string' ||
  !OFFICIAL_SYNC_TERMINAL_STATUS_SET.has(normalize(status));

export const normalizeCarrierIdentifier = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim().replace(/\s+/g, '').toUpperCase()
    : '';
