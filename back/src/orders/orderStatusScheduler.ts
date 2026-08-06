import connectDB from '../config/db';
import Order from './order.model';
import OrderSyncLock from './orderSyncLock.model';
import { syncOfficialStatuses } from './orderStatusSync.service';
import { OFFICIAL_SYNC_TERMINAL_STATUSES } from './orderStatus';
import { importCarrierOrders } from './carrierOrderImport.service';

const getIntervalMs = (): number => {
  const configuredInterval = Number(process.env.OFFICIAL_STATUS_SYNC_INTERVAL_MS);
  return Number.isFinite(configuredInterval) && configuredInterval >= 60_000
    ? Math.min(configuredInterval, 24 * 60 * 60 * 1000)
    : 5 * 60 * 1000;
};

const acquireSyncLock = async (): Promise<boolean> => {
  const now = new Date();
  try {
    const lock = await OrderSyncLock.findOneAndUpdate(
      {
        _id: 'ecotrack-status-sync',
        $or: [
          { lockedUntil: { $lte: now } },
          { lockedUntil: { $exists: false } },
        ],
      },
      { $set: { lockedUntil: new Date(now.getTime() + 4 * 60_000) } },
      { upsert: true, new: true }
    );
    return Boolean(lock);
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return false;
    throw error;
  }
};

const releaseSyncLock = async (): Promise<void> => {
  await OrderSyncLock.updateOne(
    { _id: 'ecotrack-status-sync' },
    { $set: { lockedUntil: new Date(0) } }
  );
};

export const startOrderStatusScheduler = () => {
  if (process.env.DISABLE_OFFICIAL_STATUS_CRON === 'true') {
    console.log('[DHD sync] Cron désactivé via DISABLE_OFFICIAL_STATUS_CRON=true');
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    let lockAcquired = false;
    try {
      await connectDB();
      lockAcquired = await acquireSyncLock();
      if (!lockAcquired) return;

      try {
        await importCarrierOrders({
          carrierType: 'api_dhd',
          maxPages: Number(process.env.ORDER_IMPORT_CRON_PAGES ?? 2),
        });
      } catch {
        console.error('[DHD import] Echec de la decouverte planifiee');
      }

      const candidates = await Order.find({
        deliveryType: { $in: ['api_dhd', 'api_sook'] },
        tracking: { $type: 'string', $regex: /\S{5}/, $nin: ['', 'N/A'] },
        // Une livraison peut encore devenir un retour chez ECOTRACK. Seuls
        // les retours finaux et annulations quittent la surveillance.
        status: { $nin: [...OFFICIAL_SYNC_TERMINAL_STATUSES] },
      })
        .select('rowId tracking status deliveryType row')
        .sort({ lastSyncAttemptAt: 1, updatedAt: 1 })
        .limit(100)
        .lean();

      if (!candidates.length) {
        return;
      }

      const orders = candidates.map((order) => ({
        rowId: String(order.rowId),
        tracking: order.tracking ? String(order.tracking).trim() : undefined,
        reference:
          typeof order.row?.reference === 'string'
            ? String(order.row.reference).trim()
            : undefined,
        currentStatus: order.status ? String(order.status).trim() : undefined,
        deliveryType: order.deliveryType,
      }));

      console.log(
        `[DHD sync] Lancement auto pour ${orders.length} commandes en attente`
      );

      await syncOfficialStatuses({
        orders,
      });
    } catch (error) {
      console.error('[DHD sync] Erreur lors de la synchro planifiée');
    } finally {
      if (lockAcquired) {
        await releaseSyncLock().catch(() => undefined);
      }
      running = false;
    }
  };

  // Premier passage immédiat
  tick().catch(() =>
    console.error('[DHD sync] Erreur initiale dans le cron')
  );

  const intervalMs = getIntervalMs();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  console.log(
    `[DHD sync] Cron initialisé (intervalle=${intervalMs / 1000}s)`
  );
};

export default startOrderStatusScheduler;
