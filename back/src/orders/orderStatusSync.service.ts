import sheetService from './order.service';
import Order from './order.model';
import {
  chunkTrackings,
  DeliveryApiType,
  EcotrackClient,
  EcotrackStatusEntry,
} from './ecotrack.client';
import {
  getMissingCarrierBusinessStatus,
  mapCarrierStatus,
  normalizeCarrierIdentifier,
} from './orderStatus';
import { reconcileOrderStock } from './orderStockReconciliation.service';

export interface SyncOrderPayload {
  rowId: string;
  tracking?: string;
  reference?: string;
  currentStatus?: string;
  deliveryType?: DeliveryApiType | 'livreur' | string | null;
}

export interface SyncOfficialStatusesParams {
  orders: SyncOrderPayload[];
  startDate?: string;
  endDate?: string;
}

export interface SyncOfficialStatusesResult {
  updates: Array<{
    rowId: string;
    tracking?: string;
    reference?: string;
    officialStatus: string;
    newStatus: string;
    previousStatus?: string;
    changed: boolean;
  }>;
  notFound: Array<{
    rowId: string;
    tracking?: string;
    reference?: string;
  }>;
  skipped: Array<{
    rowId: string;
    tracking?: string;
    reference?: string;
    reason: string;
  }>;
  errors: Array<{
    rowId: string;
    tracking?: string;
    reference?: string;
    error: string;
  }>;
  fetchedOrders: number;
  pagesFetched: number;
  requestsMade: number;
}

const normalizeStatus = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .replace(/_/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    : '';

const statusesEqual = (left: unknown, right: unknown): boolean => {
  const normalizedLeft = normalizeStatus(left);
  const normalizedRight = normalizeStatus(right);
  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
};

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Erreur ECOTRACK inconnue';

const sanitizeOrders = (orders: SyncOrderPayload[]): SyncOrderPayload[] => {
  const seen = new Set<string>();
  return orders
    .map((order) => ({
      rowId: String(order?.rowId ?? '').trim(),
      tracking:
        typeof order?.tracking === 'string' ? order.tracking.trim() : undefined,
      reference:
        typeof order?.reference === 'string'
          ? order.reference.trim()
          : undefined,
      currentStatus:
        typeof order?.currentStatus === 'string'
          ? order.currentStatus.trim()
          : undefined,
      deliveryType:
        typeof order?.deliveryType === 'string'
          ? order.deliveryType.trim().toLowerCase()
          : undefined,
    }))
    .filter((order) => {
      if (
        !order.rowId ||
        order.rowId.length > 100 ||
        (order.tracking?.length ?? 0) > 100 ||
        (order.reference?.length ?? 0) > 200 ||
        (order.currentStatus?.length ?? 0) > 100 ||
        (typeof order.deliveryType === 'string' && order.deliveryType.length > 32) ||
        seen.has(order.rowId)
      ) {
        return false;
      }
      seen.add(order.rowId);
      return true;
    });
};

const recordSyncError = async (rowId: string, message: string) => {
  await Order.updateOne(
    { rowId },
    {
      $set: {
        lastSyncAttemptAt: new Date(),
        lastSyncError: message.slice(0, 500),
      },
    }
  ).catch(() => undefined);
};

const processWithConcurrency = async <T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) => {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    }
  );
  await Promise.all(runners);
};

const persistMatchedStatus = async (params: {
  order: SyncOrderPayload;
  deliveryType: DeliveryApiType;
  carrierStatus: string;
  sheetAlreadyUpdated?: boolean;
}) => {
  const { order, deliveryType, carrierStatus, sheetAlreadyUpdated } = params;
  const mappedStatus = mapCarrierStatus(carrierStatus);
  const existing = await Order.findOne({ rowId: order.rowId });
  // Mongo est prioritaire sur la copie potentiellement périmée envoyée par le
  // navigateur. Cela évite qu'un statut transporteur inconnu fasse régresser
  // une commande déjà mise à jour par un cron plus récent.
  const previousStatus =
    existing?.status || order.currentStatus || 'new';
  const nextStatus = mappedStatus || previousStatus;
  const changed = !statusesEqual(previousStatus, nextStatus);
  const now = new Date();

  if (!sheetAlreadyUpdated) {
    await sheetService.updateStatus({
      rowId: order.rowId,
      status: nextStatus,
      tracking: order.tracking,
      carrierStatus,
      carrierType: deliveryType,
      row: existing?.row,
    });
  }

  const savedOrder = await Order.findOneAndUpdate(
    { rowId: order.rowId },
    {
      $set: {
        rowId: order.rowId,
        status: nextStatus,
        tracking: order.tracking,
        deliveryType,
        carrierStatus,
        carrierStatusUpdatedAt: now,
        lastSyncAttemptAt: now,
        lastSyncError: '',
      },
    },
    { upsert: true, new: true }
  );

  if (savedOrder.row) {
    try {
      await reconcileOrderStock(order.rowId, nextStatus);
    } catch (error) {
      await Order.updateOne(
        { rowId: order.rowId },
        { $set: { lastSyncError: `Stock: ${safeErrorMessage(error)}` } }
      );
    }
  }

  return { mappedStatus, previousStatus, nextStatus, changed };
};

const persistMissingCarrierStatus = async (params: {
  order: SyncOrderPayload;
  deliveryType: DeliveryApiType;
  sheetAlreadyUpdated?: boolean;
}) => {
  const { order, deliveryType, sheetAlreadyUpdated } = params;
  const nextStatus = getMissingCarrierBusinessStatus(deliveryType);
  const existing = await Order.findOne({ rowId: order.rowId });
  const previousStatus = existing?.status || order.currentStatus || 'new';
  const changed = !statusesEqual(previousStatus, nextStatus);
  const now = new Date();

  if (!sheetAlreadyUpdated) {
    await sheetService.updateStatus({
      rowId: order.rowId,
      status: nextStatus,
      tracking: order.tracking,
      carrierType: deliveryType,
      row: existing?.row,
    });
  }

  // "Supprimé" est un état métier déduit d'une réponse de statut réussie qui
  // n'inclut plus ce tracking. Le dernier carrierStatus officiel est conservé
  // séparément et le cron continuera à vérifier le tracking.
  const savedOrder = await Order.findOneAndUpdate(
    { rowId: order.rowId },
    {
      $set: {
        rowId: order.rowId,
        status: nextStatus,
        tracking: order.tracking,
        deliveryType,
        lastSyncAttemptAt: now,
        lastSyncError: 'tracking_not_found',
      },
    },
    { upsert: true, new: true }
  );

  if (savedOrder.row) {
    try {
      await reconcileOrderStock(order.rowId, nextStatus);
    } catch (error) {
      await Order.updateOne(
        { rowId: order.rowId },
        { $set: { lastSyncError: `Stock: ${safeErrorMessage(error)}` } }
      );
    }
  }

  return { previousStatus, nextStatus, changed };
};

export const syncOfficialStatuses = async (
  params: SyncOfficialStatusesParams
): Promise<SyncOfficialStatusesResult> => {
  const sanitizedOrders = sanitizeOrders(params.orders ?? []);
  const result: SyncOfficialStatusesResult = {
    updates: [],
    notFound: [],
    skipped: [],
    errors: [],
    fetchedOrders: 0,
    pagesFetched: 0,
    requestsMade: 0,
  };

  if (sanitizedOrders.length === 0) return result;

  const grouped = new Map<DeliveryApiType, SyncOrderPayload[]>();
  sanitizedOrders.forEach((order) => {
    if (order.deliveryType === 'livreur') {
      result.skipped.push({ ...order, reason: 'delivery_person_order' });
      return;
    }
    if (
      order.deliveryType !== 'api_dhd' &&
      order.deliveryType !== 'api_sook'
    ) {
      result.skipped.push({ ...order, reason: 'missing_or_unknown_delivery_type' });
      return;
    }
    if (!normalizeCarrierIdentifier(order.tracking)) {
      result.skipped.push({ ...order, reason: 'missing_tracking' });
      return;
    }
    const type: DeliveryApiType = order.deliveryType;
    const bucket = grouped.get(type) ?? [];
    bucket.push(order);
    grouped.set(type, bucket);
  });

  for (const [deliveryType, orders] of grouped.entries()) {
    let client: EcotrackClient;
    try {
      client = new EcotrackClient(deliveryType);
    } catch (error) {
      const message = safeErrorMessage(error);
      for (const order of orders) {
        result.errors.push({ ...order, error: message });
        await recordSyncError(order.rowId, message);
      }
      continue;
    }

    const ordersByTracking = new Map<string, SyncOrderPayload[]>();
    orders.forEach((order) => {
      const key = normalizeCarrierIdentifier(order.tracking);
      const bucket = ordersByTracking.get(key) ?? [];
      bucket.push(order);
      ordersByTracking.set(key, bucket);
    });

    const chunks = chunkTrackings(
      Array.from(ordersByTracking.keys()),
      100
    );

    for (const chunk of chunks) {
      let statuses: Map<string, EcotrackStatusEntry>;
      try {
        statuses = await client.getStatuses(chunk);
        result.requestsMade += 1;
        result.pagesFetched += 1;
        result.fetchedOrders += statuses.size;
      } catch (error) {
        const message = safeErrorMessage(error);
        for (const tracking of chunk) {
          for (const order of ordersByTracking.get(tracking) ?? []) {
            result.errors.push({ ...order, error: message });
            await recordSyncError(order.rowId, message);
          }
        }
        continue;
      }

      const sheetPayloads: Array<{
        rowId: string;
        status: string;
        tracking?: string;
        carrierStatus?: string;
        carrierType: DeliveryApiType;
      }> = [];
      const matchedForPersistence: Array<{
        order: SyncOrderPayload;
        carrierStatus: string;
      }> = [];
      const missingForPersistence: SyncOrderPayload[] = [];
      for (const tracking of chunk) {
        const entry = statuses.get(tracking);
        const matchedOrders = ordersByTracking.get(tracking) ?? [];
        if (!entry) {
          for (const order of matchedOrders) {
            sheetPayloads.push({
              rowId: order.rowId,
              status: getMissingCarrierBusinessStatus(deliveryType),
              tracking: order.tracking,
              carrierType: deliveryType,
            });
          }
          continue;
        }
        const carrierStatus =
          typeof entry?.status === 'string' ? entry.status.trim() : '';
        if (!carrierStatus) continue;
        for (const order of matchedOrders) {
          sheetPayloads.push({
            rowId: order.rowId,
            status:
              mapCarrierStatus(carrierStatus) ||
              order.currentStatus ||
              'new',
            tracking: order.tracking,
            carrierStatus,
            carrierType: deliveryType,
          });
        }
      }

      let sheetBatchError = '';
      if (sheetPayloads.length > 0) {
        try {
          for (let index = 0; index < sheetPayloads.length; index += 100) {
            await sheetService.updateStatuses(
              sheetPayloads.slice(index, index + 100)
            );
          }
        } catch (error) {
          sheetBatchError = safeErrorMessage(error);
        }
      }

      for (const tracking of chunk) {
        const matchedOrders = ordersByTracking.get(tracking) ?? [];
        const entry = statuses.get(tracking);
        if (!entry) {
          for (const order of matchedOrders) {
            result.notFound.push({
              rowId: order.rowId,
              tracking: order.tracking,
              reference: order.reference,
            });
            if (sheetBatchError) {
              result.errors.push({ ...order, error: sheetBatchError });
              await recordSyncError(order.rowId, sheetBatchError);
            } else {
              missingForPersistence.push(order);
            }
          }
          continue;
        }

        const carrierStatus =
          typeof entry.status === 'string' ? entry.status.trim() : '';
        if (!carrierStatus) {
          for (const order of matchedOrders) {
            result.skipped.push({ ...order, reason: 'missing_carrier_status' });
            await recordSyncError(order.rowId, 'missing_carrier_status');
          }
          continue;
        }

        for (const order of matchedOrders) {
          if (sheetBatchError) {
            result.errors.push({ ...order, error: sheetBatchError });
            await recordSyncError(order.rowId, sheetBatchError);
            continue;
          }
          matchedForPersistence.push({ order, carrierStatus });
        }
      }

      await processWithConcurrency(
        matchedForPersistence,
        10,
        async ({ order, carrierStatus }) => {
          try {
            const persisted = await persistMatchedStatus({
              order,
              deliveryType,
              carrierStatus,
              sheetAlreadyUpdated: true,
            });
            result.updates.push({
              rowId: order.rowId,
              tracking: order.tracking,
              reference: order.reference,
              officialStatus: carrierStatus,
              newStatus: persisted.nextStatus,
              previousStatus: persisted.previousStatus,
              changed: persisted.changed,
            });
            if (!persisted.mappedStatus) {
              result.skipped.push({ ...order, reason: 'unknown_status_preserved' });
            }
          } catch (error) {
            const message = safeErrorMessage(error);
            result.errors.push({ ...order, error: message });
            await recordSyncError(order.rowId, message);
          }
        }
      );

      await processWithConcurrency(
        missingForPersistence,
        10,
        async (order) => {
          try {
            await persistMissingCarrierStatus({
              order,
              deliveryType,
              sheetAlreadyUpdated: true,
            });
          } catch (error) {
            const message = safeErrorMessage(error);
            result.errors.push({ ...order, error: message });
            await recordSyncError(order.rowId, message);
          }
        }
      );
    }
  }

  return result;
};
