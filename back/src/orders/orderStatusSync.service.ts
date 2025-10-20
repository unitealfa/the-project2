import axios from 'axios';
import sheetService from './order.service';

const DEFAULT_DHD_API_BASE_URL =
  process.env.DHD_API_URL ?? 'https://platform.dhd-dz.com';
const DEFAULT_DHD_API_TOKEN =
  process.env.DHD_API_TOKEN ??
  'FmEdYRuMKmZOksnzHz2gvNhassrqr8wYNf4Lwcvn2EuOkTO9VZ1RXZb1nj4i';

const DHD_ORDERS_PATH = '/api/v1/get/orders';
const OFFICIAL_SYNC_TIMEOUT_MS = 10000;
const MAX_PAGES_TO_SCAN = 250;

interface RawOfficialOrderEntry {
  tracking?: string | null;
  reference?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface SyncOrderPayload {
  rowId: string;
  tracking?: string;
  reference?: string;
  currentStatus?: string;
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
}

const normalizeStatus = (status: string): string =>
  status
    .replace(/_/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeIdentifier = (value: string | undefined): string =>
  (value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

const normalizeStatusForComparison = (status: string | undefined): string =>
  (status ?? '')
    .replace(/_/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const toNormalizedKeywords = (values: readonly string[]) =>
  values
    .map((value) =>
      value
        .replace(/_/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    )
    .filter((value) => Boolean(value));

const containsNormalizedKeyword = (
  normalizedText: string,
  keywords: readonly string[]
) => keywords.some((keyword) => normalizedText.includes(keyword));

const containsRawKeyword = (text: string, keywords: readonly string[]) =>
  keywords.some((keyword) => keyword && text.includes(keyword));

const DHD_SHIPPED_STATUSES = new Set<string>([
  'vers station',
  'en station',
  'vers wilaya',
  'en preparation',
  'en prepa',
  'en livraison',
  'en cours de livraison',
  'ramassage',
  'ramasse',
  'collecte',
  'prise en charge',
  'en cours',
  'depart station',
  'depart wilaya',
  'pret a expedier',
  'prete a expedier',
]);

const DHD_SHIPPED_KEYWORDS = toNormalizedKeywords([
  ...Array.from(DHD_SHIPPED_STATUSES),
  'livraison',
  'en chemin',
  'en route',
  'ready to ship',
  'expedition en cours',
  'expedie',
]);

const DHD_DELIVERED_KEYWORDS = toNormalizedKeywords([
  'livre',
  'livree',
  'colis livre',
  'commande livree',
  'livre au client',
  'livraison reussie',
  'delivered',
  'delivery done',
  'paye et archive',
  'paye et archivee',
  'payer et archive',
]);

const DHD_RETURNED_KEYWORDS = toNormalizedKeywords([
  'retour',
  'retours',
  'retourne',
  'retournee',
  'retour vers expediteur',
  'return to sender',
  'returned',
  'refus',
  'refuse',
  'client refuse',
  'colis refuse',
  'refusee',
  'non livre',
]);

const DHD_CANCELLED_KEYWORDS = toNormalizedKeywords([
  'annule',
  'annulee',
  'annule par client',
  'commande annulee',
  'cancelled',
  'canceled',
  'annulation',
  'annule marchand',
]);

const DHD_SHIPPED_KEYWORDS_AR = [
  'تم الشحن',
  'في الطريق',
  'في التوصيل',
];

const DHD_DELIVERED_KEYWORDS_AR = [
  'تم التسليم',
  'تم التوصيل',
  'سلمت',
  'سُلِّم',
];

const DHD_RETURNED_KEYWORDS_AR = [
  'راجع',
  'تم الارجاع',
  'تم الإرجاع',
  'مرتجع',
  'رفض الاستلام',
];

const DHD_CANCELLED_KEYWORDS_AR = [
  'ألغيت',
  'تم الإلغاء',
  'ملغاة',
];

const mapOfficialStatusToSheet = (status: unknown): string | null => {
  if (typeof status !== 'string') return null;
  const trimmedStatus = status.trim();
  if (!trimmedStatus) return null;
  const normalized = normalizeStatus(trimmedStatus);

  if (
    containsNormalizedKeyword(normalized, DHD_RETURNED_KEYWORDS) ||
    containsRawKeyword(trimmedStatus, DHD_RETURNED_KEYWORDS_AR)
  ) {
    return 'retours';
  }

  if (
    containsNormalizedKeyword(normalized, DHD_DELIVERED_KEYWORDS) ||
    containsRawKeyword(trimmedStatus, DHD_DELIVERED_KEYWORDS_AR)
  ) {
    return 'livrée';
  }

  if (
    DHD_SHIPPED_STATUSES.has(normalized) ||
    containsNormalizedKeyword(normalized, DHD_SHIPPED_KEYWORDS) ||
    containsRawKeyword(trimmedStatus, DHD_SHIPPED_KEYWORDS_AR)
  ) {
    return 'SHIPPED';
  }

  if (
    containsNormalizedKeyword(normalized, DHD_CANCELLED_KEYWORDS) ||
    containsRawKeyword(trimmedStatus, DHD_CANCELLED_KEYWORDS_AR)
  ) {
    return 'abandoned';
  }

  return null;
};

const statusesEqual = (a?: string, b?: string) => {
  if (!a || !b) {
    return false;
  }
  return (
    normalizeStatusForComparison(a) === normalizeStatusForComparison(b)
  );
};

const sanitizeOrders = (orders: SyncOrderPayload[]): SyncOrderPayload[] =>
  orders
    .map((order) => ({
      rowId: String(order?.rowId ?? '').trim(),
      tracking: order?.tracking ? String(order.tracking).trim() : undefined,
      reference: order?.reference
        ? String(order.reference).trim()
        : undefined,
      currentStatus: order?.currentStatus
        ? String(order.currentStatus).trim()
        : undefined,
    }))
    .filter((order) => order.rowId);

const buildRequestHeaders = () => {
  if (!DEFAULT_DHD_API_TOKEN) {
    return undefined;
  }
  return {
    Authorization: `Bearer ${DEFAULT_DHD_API_TOKEN}`,
  };
};

const fetchOrdersPage = async (
  page: number,
  startDate?: string,
  endDate?: string
): Promise<{
  data: RawOfficialOrderEntry[];
  current_page?: number;
  last_page?: number;
}> => {
  const params: Record<string, string | number> = { page };
  if (startDate) {
    params.start_date = startDate;
  }
  if (endDate) {
    params.end_date = endDate;
  }

  const response = await axios.get(
    `${DEFAULT_DHD_API_BASE_URL.replace(/\/$/, '')}${DHD_ORDERS_PATH}`,
    {
      params,
      headers: buildRequestHeaders(),
      timeout: OFFICIAL_SYNC_TIMEOUT_MS,
    }
  );

  const payload = response.data ?? {};
  const list = Array.isArray(payload?.data) ? payload.data : [];
  return {
    data: list,
    current_page: payload?.current_page,
    last_page: payload?.last_page,
  };
};

export const syncOfficialStatuses = async (
  params: SyncOfficialStatusesParams
): Promise<SyncOfficialStatusesResult> => {
  const sanitizedOrders = sanitizeOrders(params.orders ?? []);
  if (sanitizedOrders.length === 0) {
    return {
      updates: [],
      notFound: [],
      skipped: [],
      errors: [],
      fetchedOrders: 0,
      pagesFetched: 0,
    };
  }

  const ordersByTracking = new Map<string, SyncOrderPayload[]>();
  const ordersByReference = new Map<string, SyncOrderPayload[]>();

  sanitizedOrders.forEach((order) => {
    const trackingKey = normalizeIdentifier(order.tracking);
    if (trackingKey) {
      const bucket = ordersByTracking.get(trackingKey) ?? [];
      bucket.push(order);
      ordersByTracking.set(trackingKey, bucket);
    }
    const referenceKey = normalizeIdentifier(order.reference);
    if (referenceKey) {
      const bucket = ordersByReference.get(referenceKey) ?? [];
      bucket.push(order);
      ordersByReference.set(referenceKey, bucket);
    }
  });

  if (ordersByTracking.size === 0 && ordersByReference.size === 0) {
    return {
      updates: [],
      notFound: sanitizedOrders.map((order) => ({
        rowId: order.rowId,
        tracking: order.tracking,
        reference: order.reference,
      })),
      skipped: [],
      errors: [],
      fetchedOrders: 0,
      pagesFetched: 0,
    };
  }

  const matches = new Map<string, { entry: RawOfficialOrderEntry; status: string }>();
  let page = 1;
  let lastPage = 1;
  let pagesFetched = 0;
  let fetchedOrders = 0;

  while (page <= lastPage && page <= MAX_PAGES_TO_SCAN) {
    const { data, last_page } = await fetchOrdersPage(
      page,
      params.startDate,
      params.endDate
    );
    pagesFetched += 1;
    fetchedOrders += data.length;
    if (typeof last_page === 'number' && last_page > 0) {
      lastPage = last_page;
    }

    data.forEach((entry) => {
      const trackingKey = normalizeIdentifier(
        typeof entry?.tracking === 'string' ? entry.tracking : undefined
      );
      const referenceKey = normalizeIdentifier(
        typeof entry?.reference === 'string' ? entry.reference : undefined
      );
      const officialStatus =
        typeof entry?.status === 'string' ? entry.status : '';

      const associatedOrders = new Set<SyncOrderPayload>();

      if (trackingKey && ordersByTracking.has(trackingKey)) {
        ordersByTracking.get(trackingKey)?.forEach((order) =>
          associatedOrders.add(order)
        );
      }

      if (referenceKey && ordersByReference.has(referenceKey)) {
        ordersByReference.get(referenceKey)?.forEach((order) =>
          associatedOrders.add(order)
        );
      }

      associatedOrders.forEach((order) => {
        if (!matches.has(order.rowId)) {
          matches.set(order.rowId, {
            entry,
            status: officialStatus,
          });
        }
      });
    });

    if (matches.size >= sanitizedOrders.length) {
      break;
    }

    page += 1;
  }

  const updates: SyncOfficialStatusesResult['updates'] = [];
  const notFound: SyncOfficialStatusesResult['notFound'] = [];
  const skipped: SyncOfficialStatusesResult['skipped'] = [];
  const errors: SyncOfficialStatusesResult['errors'] = [];

  for (const order of sanitizedOrders) {
    const match = matches.get(order.rowId);
    if (!match) {
      notFound.push({
        rowId: order.rowId,
        tracking: order.tracking,
        reference: order.reference,
      });
      continue;
    }

    const mappedStatus = mapOfficialStatusToSheet(match.status);
    if (!mappedStatus) {
      skipped.push({
        rowId: order.rowId,
        tracking: order.tracking,
        reference: order.reference,
        reason: 'unknown_status',
      });
      continue;
    }

    if (statusesEqual(order.currentStatus, mappedStatus)) {
      continue;
    }

    try {
      await sheetService.updateStatus({
        rowId: order.rowId,
        status: mappedStatus,
        tracking: order.tracking,
      });

      updates.push({
        rowId: order.rowId,
        tracking: order.tracking,
        reference: order.reference,
        officialStatus: match.status ?? '',
        newStatus: mappedStatus,
        previousStatus: order.currentStatus,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur inconnue';
      errors.push({
        rowId: order.rowId,
        tracking: order.tracking,
        reference: order.reference,
        error: message,
      });
    }
  }

  return {
    updates,
    notFound,
    skipped,
    errors,
    fetchedOrders,
    pagesFetched,
  };
};
