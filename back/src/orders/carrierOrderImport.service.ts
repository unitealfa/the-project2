import Order from './order.model';
import CarrierImportState from './carrierImportState.model';
import {
  DeliveryApiType,
  EcotrackClient,
  EcotrackListedOrder,
  EcotrackOrdersPage,
} from './ecotrack.client';
import sheetService, { CarrierSheetOrder } from './order.service';
import { mapCarrierStatus, normalizeCarrierIdentifier } from './orderStatus';

export interface ImportCarrierOrdersResult {
  carrierType: DeliveryApiType;
  pagesFetched: number;
  fetched: number;
  invalid: number;
  imported: number;
  appended: number;
  linkedByReference: number;
  existing: number;
  conflicts: number;
  ambiguousReferences: number;
  nextPage: number;
  lastPage: number;
  pageErrors: number;
}

export type CarrierImportErrorCode =
  | 'import_dhd_first_page'
  | 'import_mongo_read'
  | 'import_sheet_write'
  | 'import_mongo_write'
  | 'import_cursor_write'
  | 'import_unknown';

export class CarrierOrderImportError extends Error {
  readonly code: CarrierImportErrorCode;

  constructor(code: CarrierImportErrorCode) {
    super(code);
    this.name = 'CarrierOrderImportError';
    this.code = code;
  }
}

export const getCarrierImportErrorCode = (
  error: unknown
): CarrierImportErrorCode =>
  error instanceof CarrierOrderImportError ? error.code : 'import_unknown';

const runImportStage = async <T>(
  code: CarrierImportErrorCode,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CarrierOrderImportError) throw error;
    throw new CarrierOrderImportError(code);
  }
};

export const collectCarrierOrderPages = async (options: {
  firstPage: EcotrackOrdersPage;
  nextPage?: number;
  maxPages: number;
  fetchPage: (page: number) => Promise<EcotrackOrdersPage>;
}): Promise<{
  pages: EcotrackOrdersPage[];
  nextPage: number;
  lastPage: number;
  pageErrors: number;
}> => {
  const pages = [options.firstPage];
  const lastPage = Math.max(options.firstPage.lastPage, 1);
  let cursor =
    Number.isSafeInteger(options.nextPage) && Number(options.nextPage) >= 2
      ? Number(options.nextPage)
      : 2;
  if (cursor > lastPage) cursor = 2;
  let pageErrors = 0;

  while (pages.length < safePageBudget(options.maxPages) && lastPage > 1) {
    try {
      pages.push(await options.fetchPage(cursor));
      cursor = cursor >= lastPage ? 2 : cursor + 1;
    } catch {
      // La page 1 reste exploitable. Le curseur ne bouge pas et la page lente
      // ou indisponible sera retentee au prochain clic/cron.
      pageErrors += 1;
      break;
    }
  }
  return { pages, nextPage: lastPage > 1 ? cursor : 2, lastPage, pageErrors };
};

const safePageBudget = (value: number): number =>
  Math.min(
    Math.max(Number.isFinite(value) ? Math.floor(value) : 1, 1),
    process.env.VERCEL ? 2 : 10
  );

const toSheetOrder = (
  order: EcotrackListedOrder,
  carrierType: DeliveryApiType
): CarrierSheetOrder => ({
  ...order,
  businessStatus: mapCarrierStatus(order.status) || 'new',
  carrierStatus: order.status,
  carrierType,
});

export const importCarrierOrders = async (options: {
  carrierType?: DeliveryApiType;
  maxPages?: number;
  startDate?: string;
  endDate?: string;
} = {}): Promise<ImportCarrierOrdersResult> => {
  const carrierType = options.carrierType ?? 'api_dhd';
  const maxPages = safePageBudget(options.maxPages ?? 1);
  let client: EcotrackClient;
  let firstPage: EcotrackOrdersPage;
  try {
    client = new EcotrackClient(carrierType);
    firstPage = await client.listOrders({
      page: 1,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  } catch {
    throw new CarrierOrderImportError('import_dhd_first_page');
  }
  const state = await runImportStage('import_mongo_read', () =>
    CarrierImportState.findById(carrierType).lean().exec()
  );
  const collected = await collectCarrierOrderPages({
    firstPage,
    nextPage: state?.nextPage,
    maxPages,
    fetchPage: (page) =>
      client.listOrders({
        page,
        startDate: options.startDate,
        endDate: options.endDate,
      }),
  });
  const { pages, lastPage, nextPage, pageErrors } = collected;

  const discoveredByTracking = new Map<string, EcotrackListedOrder>();
  for (const order of pages.flatMap((page) => page.orders)) {
    const tracking = normalizeCarrierIdentifier(order.tracking);
    if (tracking) discoveredByTracking.set(tracking, order);
  }
  const discovered = Array.from(discoveredByTracking.values());
  const trackedOrders = await runImportStage('import_mongo_read', () =>
    Order.find({
      deliveryType: { $in: ['api_dhd', 'api_sook'] },
      tracking: { $type: 'string', $nin: ['', 'N/A'] },
    })
      .select('rowId tracking deliveryType source stockSyncEnabled')
      .lean()
      .exec()
  );
  const preferredRowIdsByTracking: Record<string, string> = {};
  const occupiedRowTrackings: Record<string, string> = {};
  const externalRowIds: string[] = [];
  const carrierTrackingCounts = new Map<string, number>();
  for (const order of trackedOrders) {
    const tracking = normalizeCarrierIdentifier(order.tracking);
    const rowId = String(order.rowId ?? '').trim();
    if (!tracking || !rowId) continue;
    occupiedRowTrackings[rowId] = tracking;
    if (order.source === 'carrier_import' || order.stockSyncEnabled === false) {
      externalRowIds.push(rowId);
    }
    if (order.deliveryType === carrierType) {
      carrierTrackingCounts.set(
        tracking,
        (carrierTrackingCounts.get(tracking) ?? 0) + 1
      );
      preferredRowIdsByTracking[tracking] = rowId;
    }
  }
  const blockedTrackings = Array.from(carrierTrackingCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([tracking]) => tracking);
  blockedTrackings.forEach((tracking) => {
    delete preferredRowIdsByTracking[tracking];
  });

  const sheetResult = await runImportStage('import_sheet_write', () =>
    sheetService.upsertCarrierOrders(
      discovered.map((order) => toSheetOrder(order, carrierType)),
      {
        preferredRowIdsByTracking,
        occupiedRowTrackings,
        externalRowIds,
        blockedTrackings,
      }
    )
  );
  const now = new Date();
  if (sheetResult.matches.length > 0) {
    await runImportStage('import_mongo_write', () =>
      Order.bulkWrite(
        sheetResult.matches.map((match) => {
          const carrierOrder = discoveredByTracking.get(match.tracking);
          const carrierStatus = String(carrierOrder?.status ?? '').trim();
          const mappedStatus = mapCarrierStatus(carrierStatus);
          const externallyCreated = match.externalSource;
          const previousRowId = preferredRowIdsByTracking[match.tracking];
          const filter =
            previousRowId && previousRowId !== match.rowId
              ? {
                  $or: [
                    { rowId: match.rowId },
                    {
                      rowId: previousRowId,
                      tracking: match.tracking,
                      deliveryType: carrierType,
                    },
                  ],
                }
              : { rowId: match.rowId };
          return {
            updateOne: {
              filter,
              update: {
                $set: {
                  rowId: match.rowId,
                  ...(mappedStatus ? { status: mappedStatus } : {}),
                  tracking: match.tracking,
                  deliveryType: carrierType,
                  row: match.row,
                  carrierStatus,
                  carrierStatusUpdatedAt: now,
                  lastSyncAttemptAt: now,
                  lastSyncError: '',
                },
                $setOnInsert: {
                  ...(!mappedStatus ? { status: 'new' } : {}),
                  source: externallyCreated ? 'carrier_import' : 'site',
                  stockSyncEnabled: !externallyCreated,
                  stockAdjustmentState: 'not_debited',
                },
                $unset: { deliveryPersonId: 1, deliveryPersonName: 1 },
              },
              upsert: true,
            },
          };
        }),
        { ordered: false }
      )
    );
  }

  await runImportStage('import_cursor_write', () =>
    CarrierImportState.findByIdAndUpdate(
      carrierType,
      {
        $set: {
          nextPage,
          lastPage,
          lastCompletedAt: now,
        },
      },
      { upsert: true }
    ).exec()
  );

  return {
    carrierType,
    pagesFetched: pages.length,
    fetched: discovered.length,
    invalid: pages.reduce((sum, page) => sum + page.invalidOrders, 0),
    imported: sheetResult.matches.length,
    appended: sheetResult.appended,
    linkedByReference: sheetResult.linkedByReference,
    existing: sheetResult.existing,
    conflicts: sheetResult.conflicts,
    ambiguousReferences: sheetResult.ambiguousReferences,
    nextPage,
    lastPage,
    pageErrors,
  };
};

export default importCarrierOrders;
