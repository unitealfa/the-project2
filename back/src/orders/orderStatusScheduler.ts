import connectDB from '../config/db';
import Order from './order.model';
import { syncOfficialStatuses } from './orderStatusSync.service';

const DEFAULT_INTERVAL_MS = Number(
  process.env.OFFICIAL_STATUS_SYNC_INTERVAL_MS ?? 10 * 60 * 1000
);

const FINAL_STATUSES = new Set([
  'delivered',
  'livrée',
  'livree',
  'returned',
  'retours',
  'abandoned',
  'annulée',
  'annulee',
  'canceled',
  'cancelled',
]);

export const startOrderStatusScheduler = () => {
  if (process.env.DISABLE_OFFICIAL_STATUS_CRON === 'true') {
    console.log('[DHD sync] Cron désactivé via DISABLE_OFFICIAL_STATUS_CRON=true');
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await connectDB();

      const candidates = await Order.find({
        deliveryType: { $ne: 'livreur' },
        tracking: { $exists: true, $ne: '' },
        status: { $nin: Array.from(FINAL_STATUSES) },
      })
        .select('rowId tracking status deliveryType row')
        .lean();

      if (!candidates.length) {
        running = false;
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
      console.error('[DHD sync] Erreur lors de la synchro planifiée:', error);
    } finally {
      running = false;
    }
  };

  // Premier passage immédiat
  tick().catch((err) =>
    console.error('[DHD sync] Erreur initiale dans le cron:', err)
  );

  setInterval(tick, DEFAULT_INTERVAL_MS);
  console.log(
    `[DHD sync] Cron initialisé (intervalle=${DEFAULT_INTERVAL_MS / 1000}s)`
  );
};

export default startOrderStatusScheduler;
