import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import Order from './order.model';
import OrderSyncLock from './orderSyncLock.model';
import sheetService from './order.service';
import {
  DeliveryApiType,
  EcotrackApiError,
  EcotrackClient,
  EcotrackOrderPayload,
} from './ecotrack.client';
import { reconcileOrderStock } from './orderStockReconciliation.service';
import { syncOfficialStatuses as syncOfficialStatusesService } from './orderStatusSync.service';
import { isFinalBusinessStatus } from './orderStatus';

const ORDER_FIELDS = [
  'reference',
  'nom_client',
  'telephone',
  'telephone_2',
  'adresse',
  'code_postal',
  'commune',
  'code_wilaya',
  'montant',
  'remarque',
  'produit',
  'stock',
  'quantite',
  'produit_a_recuperer',
  'boutique',
  'type',
  'stop_desk',
  'weight',
  'fragile',
  'gps_link',
] as const;

const stringValue = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim();

const sanitizeOrderRow = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 250)) {
    const key = rawKey.trim();
    if (!key || key.length > 160 || key.startsWith('$') || key.includes('.') || key.includes('\0')) {
      continue;
    }
    if (typeof rawValue === 'string') sanitized[key] = rawValue.slice(0, 5_000);
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) sanitized[key] = rawValue;
    else if (typeof rawValue === 'boolean' || rawValue === null) sanitized[key] = rawValue;
  }
  return sanitized;
};

const sanitizeOrderPayload = (payload: unknown): EcotrackOrderPayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new EcotrackApiError('Les donnees de la commande sont invalides.');
  }
  const source = payload as Record<string, unknown>;
  const sanitized: EcotrackOrderPayload = {};
  ORDER_FIELDS.forEach((field) => {
    if (source[field] === undefined || source[field] === null) return;
    sanitized[field] =
      typeof source[field] === 'number' || typeof source[field] === 'boolean'
        ? (source[field] as number | boolean)
        : stringValue(source[field]).slice(0, field === 'gps_link' ? 1000 : 255);
  });

  const required = [
    'nom_client',
    'telephone',
    'adresse',
    'commune',
    'code_wilaya',
    'montant',
    'type',
  ] as const;
  const missing = required.filter((field) => !stringValue(sanitized[field]));
  if (missing.length > 0) {
    throw new EcotrackApiError(
      `Champs commande manquants: ${missing.join(', ')}.`
    );
  }

  const phone = stringValue(sanitized.telephone).replace(/\D/g, '');
  if (phone.length < 9 || phone.length > 10) {
    throw new EcotrackApiError('Le telephone doit contenir 9 ou 10 chiffres.');
  }
  sanitized.telephone = phone;

  const wilaya = Number(sanitized.code_wilaya);
  if (!Number.isInteger(wilaya) || wilaya < 1 || wilaya > 58) {
    throw new EcotrackApiError('Le code wilaya doit etre compris entre 1 et 58.');
  }
  sanitized.code_wilaya = wilaya;

  const amount = Number(sanitized.montant);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new EcotrackApiError('Le montant de la commande est invalide.');
  }
  sanitized.montant = amount;

  const type = Number(sanitized.type);
  if (!Number.isInteger(type) || type < 1 || type > 4) {
    throw new EcotrackApiError('Le type ECOTRACK doit etre compris entre 1 et 4.');
  }
  sanitized.type = type;
  return sanitized;
};

const isValidStoredTracking = (value: unknown): value is string => {
  const tracking = stringValue(value);
  return Boolean(
    tracking.length >= 5 &&
      !['N/A', 'NA', 'NONE', '0'].includes(tracking.toUpperCase())
  );
};

const deliveryTypeFrom = (value: unknown): DeliveryApiType => {
  if (value === 'api_sook') return 'api_sook';
  if (value === 'api_dhd') return 'api_dhd';
  throw new EcotrackApiError('Transporteur API invalide.');
};

const publicError = (error: unknown) => {
  if (error instanceof EcotrackApiError) {
    return {
      message: error.message,
      apiCode: error.apiCode,
      details: error.details,
      upstreamStatus: error.httpStatus,
    };
  }
  return {
    message: 'Erreur interne lors du traitement de la commande.',
  };
};

export const sendOrderToCarrier = async (req: Request, res: Response) => {
  const rowId = stringValue(req.body?.rowId);
  if (!rowId || rowId.length > 100) {
    return res.status(400).json({ success: false, message: 'rowId est requis.' });
  }

  let deliveryType: DeliveryApiType;
  let orderPayload: EcotrackOrderPayload;
  try {
    deliveryType = deliveryTypeFrom(req.body?.deliveryType);
    orderPayload = sanitizeOrderPayload(req.body?.order);
  } catch (error) {
    return res.status(400).json({ success: false, ...publicError(error) });
  }

  const row = sanitizeOrderRow(req.body?.row);
  const shouldValidate = req.body?.validate !== false;
  const askCollection: 0 | 1 = Number(req.body?.askCollection) === 1 ? 1 : 0;
  let carrierTracking = '';
  let carrierCreated = false;
  let sendLockAcquired = false;

  try {
    const client = new EcotrackClient(deliveryType);
    let existing;
    try {
      const now = new Date();
      existing = await Order.findOneAndUpdate(
        {
          rowId,
          $or: [
            { sendInProgressUntil: { $lte: now } },
            { sendInProgressUntil: { $exists: false } },
          ],
        },
        {
          $setOnInsert: { rowId, status: 'new', deliveryType },
          $set: { sendInProgressUntil: new Date(now.getTime() + 2 * 60_000) },
        },
        { upsert: true, new: true }
      );
      sendLockAcquired = Boolean(existing);
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Un envoi de cette commande est déjà en cours.',
        });
      }
      throw error;
    }
    if (!existing) {
      return res.status(409).json({
        success: false,
        message: 'Un envoi de cette commande est déjà en cours.',
      });
    }
    if (
      isValidStoredTracking(existing?.tracking) &&
      existing?.deliveryType !== deliveryType
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Cette commande possede deja un tracking chez un autre transporteur. Changez le transporteur uniquement apres verification manuelle.',
      });
    }
    if (
      isValidStoredTracking(existing?.tracking) &&
      isFinalBusinessStatus(existing?.status)
    ) {
      return res.status(409).json({
        success: false,
        message: 'Cette commande possede deja un tracking et un statut final.',
      });
    }
    let tracking = isValidStoredTracking(existing?.tracking)
      ? existing.tracking
      : '';
    let reused = Boolean(tracking);

    if (!tracking) {
      const created = await client.createOrder(orderPayload);
      tracking = created.tracking;
      carrierCreated = true;
      reused = false;
    }
    carrierTracking = tracking;
    const targetStatus = reused
      ? stringValue(existing?.status) || 'ready_to_ship'
      : 'ready_to_ship';

    const now = new Date();
    const saved = await Order.findOneAndUpdate(
      { rowId },
      {
        $set: {
          rowId,
          status: targetStatus,
          tracking,
          deliveryType,
          row: row ?? existing?.row,
          carrierStatus: existing?.carrierStatus || 'prete_a_expedier',
          carrierStatusUpdatedAt: existing?.carrierStatusUpdatedAt || now,
          lastSyncAttemptAt: now,
          lastSyncError: '',
        },
        $unset: { deliveryPersonId: 1, deliveryPersonName: 1 },
      },
      { upsert: true, new: true }
    );

    try {
      await sheetService.updateStatus({
        rowId,
        status: targetStatus,
        tracking,
        carrierStatus: saved.carrierStatus,
        carrierType: deliveryType,
        row: row ?? saved.row,
      });
    } catch (error) {
      const message = `Google Sheets: ${publicError(error).message}`;
      await Order.updateOne({ rowId }, { $set: { lastSyncError: message } });
      return res.status(502).json({
        success: false,
        partialSuccess: true,
        tracking,
        message:
          'Commande creee chez ECOTRACK, mais la sauvegarde Google Sheets a echoue.',
      });
    }

    if (
      shouldValidate &&
      !saved.carrierValidatedAt &&
      (!reused || targetStatus === 'ready_to_ship')
    ) {
      try {
        await client.validateOrder(tracking, askCollection);
        saved.carrierValidatedAt = new Date();
        saved.lastSyncError = '';
        await saved.save();
      } catch (error) {
        const safe = publicError(error);
        const message = `Validation ECOTRACK: ${safe.message}`;
        await Order.updateOne({ rowId }, { $set: { lastSyncError: message } });
        return res.status(502).json({
          ...safe,
          success: false,
          partialSuccess: true,
          tracking,
          message:
            'Commande creee et sauvegardee, mais ECOTRACK ne l’a pas validee pour expedition.',
        });
      }
    }

    let stockWarning: string | undefined;
    try {
      await reconcileOrderStock(rowId, targetStatus);
    } catch (error) {
      stockWarning = publicError(error).message;
      await Order.updateOne(
        { rowId },
        { $set: { lastSyncError: `Stock: ${stockWarning}` } }
      );
    }

    return res.json({
      success: true,
      tracking,
      reused,
      validated: shouldValidate,
      status: targetStatus,
      carrierStatus: saved.carrierStatus,
      ...(stockWarning ? { warning: `Stock non ajuste: ${stockWarning}` } : {}),
    });
  } catch (error) {
    const safe = publicError(error);
    const status =
      error instanceof EcotrackApiError &&
      (error.httpStatus === 422 || error.httpStatus === 429)
        ? error.httpStatus
        : 502;
    return res.status(status).json({
      success: false,
      ...safe,
      ...(carrierCreated && carrierTracking
        ? {
            partialSuccess: true,
            tracking: carrierTracking,
            message:
              'Commande creee chez ECOTRACK, mais sa persistance locale a echoue. Ne la renvoyez pas avant verification.',
          }
        : {}),
    });
  } finally {
    if (sendLockAcquired) {
      await Order.updateOne(
        { rowId },
        { $unset: { sendInProgressUntil: 1 } }
      ).catch(() => undefined);
    }
  }
};

export const getOrderMetadata = async (req: Request, res: Response) => {
  const rowIds = Array.isArray(req.body?.rowIds)
    ? Array.from(
        new Set(
          req.body.rowIds
            .map((value: unknown) => stringValue(value))
            .filter((value: string) => Boolean(value) && value.length <= 100)
        )
      ).slice(0, 1000)
    : [];
  if (rowIds.length === 0) {
    return res.status(400).json({ success: false, message: 'rowIds est requis.' });
  }

  try {
    const orders = await Order.find({ rowId: { $in: rowIds } })
      .select(
        'rowId status tracking deliveryType deliveryPersonId deliveryPersonName carrierStatus carrierStatusUpdatedAt carrierValidatedAt lastSyncAttemptAt lastSyncError stockAdjustmentState'
      )
      .lean();
    return res.json({ success: true, orders });
  } catch (error) {
    return res.status(500).json({ success: false, ...publicError(error) });
  }
};

export const getCarrierActivity = async (req: Request, res: Response) => {
  const rowId = stringValue(req.params.rowId);
  if (!rowId || rowId.length > 100) {
    return res.status(400).json({ success: false, message: 'rowId invalide.' });
  }
  try {
    const order = await Order.findOne({ rowId }).select(
      'tracking deliveryType rowId'
    );
    if (!order || !isValidStoredTracking(order.tracking)) {
      return res.status(404).json({ success: false, message: 'Tracking introuvable.' });
    }
    if (order.deliveryType === 'livreur') {
      return res.json({ success: true, activity: [] });
    }
    const client = new EcotrackClient(
      order.deliveryType === 'api_sook' ? 'api_sook' : 'api_dhd'
    );
    const activity = await client.getTrackingActivity(order.tracking);
    return res.json({ success: true, activity });
  } catch (error) {
    return res.status(502).json({ success: false, ...publicError(error) });
  }
};

const constantTimeSecretMatches = (provided: string, expected: string): boolean => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
};

export const acquireStatusSyncLock = async (): Promise<boolean> => {
  const now = new Date();
  const configuredDuration = Number(process.env.ORDER_SYNC_LOCK_MS);
  const durationMs =
    Number.isFinite(configuredDuration) && configuredDuration > 0
      ? Math.min(configuredDuration, 30 * 60 * 1000)
      : 4 * 60 * 1000;
  try {
    const lock = await OrderSyncLock.findOneAndUpdate(
      {
        _id: 'ecotrack-status-sync',
        $or: [
          { lockedUntil: { $lte: now } },
          { lockedUntil: { $exists: false } },
        ],
      },
      { $set: { lockedUntil: new Date(now.getTime() + durationMs) } },
      { upsert: true, new: true }
    );
    return Boolean(lock);
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return false;
    throw error;
  }
};

export const releaseStatusSyncLock = async () => {
  await OrderSyncLock.updateOne(
    { _id: 'ecotrack-status-sync' },
    { $set: { lockedUntil: new Date(0) } }
  );
};

export const cronSyncOfficialStatuses = async (req: Request, res: Response) => {
  const secret = stringValue(process.env.CRON_SECRET);
  const authorization = stringValue(req.headers.authorization);
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!secret) {
    return res.status(503).json({ success: false, message: 'CRON_SECRET non configure.' });
  }
  if (!provided || !constantTimeSecretMatches(provided, secret)) {
    return res.status(401).json({ success: false, message: 'Cron non autorise.' });
  }

  try {
    if (!(await acquireStatusSyncLock())) {
      return res.status(409).json({ success: false, message: 'Synchronisation deja en cours.' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, ...publicError(error) });
  }

  try {
    const configuredLimit = Number(process.env.ORDER_SYNC_BATCH_LIMIT);
    const limit = Math.min(
      Math.max(
        Number.isFinite(configuredLimit) ? Math.floor(configuredLimit) : 100,
        1
      ),
      100
    );
    const candidates = await Order.find({
      deliveryType: { $in: ['api_dhd', 'api_sook'] },
      tracking: { $type: 'string', $regex: /\S{5}/, $nin: ['', 'N/A'] },
      status: {
        $nin: [
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
        ],
      },
    })
      .select('rowId tracking status deliveryType row')
      .sort({ lastSyncAttemptAt: 1, updatedAt: 1 })
      .limit(limit)
      .lean();

    if (candidates.length === 0) {
      return res.json({ success: true, processed: 0, updates: 0 });
    }

    const result = await syncOfficialStatusesService({
      orders: candidates.map((order) => ({
        rowId: String(order.rowId),
        tracking: stringValue(order.tracking),
        currentStatus: stringValue(order.status),
        deliveryType: order.deliveryType,
      })),
    });
    return res.json({
      success: true,
      processed: candidates.length,
      updates: result.updates.length,
      notFound: result.notFound.length,
      skipped: result.skipped.length,
      errors: result.errors.length,
      requestsMade: result.requestsMade,
    });
  } catch (error) {
    return res.status(500).json({ success: false, ...publicError(error) });
  } finally {
    await releaseStatusSyncLock().catch(() => undefined);
  }
};
