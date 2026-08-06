import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';

const RETRYABLE_SHEETS_HTTP_STATUSES = new Set([
  408, 429, 500, 502, 503, 504,
]);
const RETRYABLE_SHEETS_NETWORK_CODES = new Set([
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

const retryIdempotentSheetsOperation = async <T>(
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const candidate = error as {
      code?: unknown;
      cause?: { code?: unknown };
      response?: { status?: unknown };
    };
    const httpStatus = Number(candidate.response?.status ?? candidate.code);
    const networkCode = String(
      candidate.cause?.code ?? candidate.code ?? ''
    ).toUpperCase();
    const retryable =
      RETRYABLE_SHEETS_HTTP_STATUSES.has(httpStatus) ||
      RETRYABLE_SHEETS_NETWORK_CODES.has(networkCode);
    if (!retryable) throw error;

    // Une seule relance bornee suffit pour les erreurs transitoires observees
    // sans allonger excessivement une fonction Vercel. Cette aide ne doit
    // jamais entourer values.append, qui n'est pas idempotent si la reponse
    // reseau est perdue apres l'ajout effectif.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return operation();
  }
};

export interface UpdateStatusPayload {
  rowId: string;
  status: string;
  tracking?: string;
  carrierStatus?: string;
  carrierType?: 'api_dhd' | 'api_sook';
  row?: Record<string, unknown>;
}

export interface CarrierSheetOrder {
  tracking: string;
  reference?: string;
  client?: string;
  phone?: string;
  phone2?: string;
  address?: string;
  commune?: string;
  wilayaId?: number;
  amount?: string;
  typeId?: number;
  createdAt?: string;
  products?: string;
  businessStatus: string;
  carrierStatus?: string;
  carrierType: 'api_dhd' | 'api_sook';
  source?: 'site' | 'carrier_import';
}

export interface CarrierSheetMatch {
  tracking: string;
  rowId: string;
  row: Record<string, unknown>;
  matchType: 'mongo' | 'tracking' | 'reference' | 'appended';
  externalSource: boolean;
}

export interface UpsertCarrierSheetOrdersResult {
  matches: CarrierSheetMatch[];
  appended: number;
  linkedByReference: number;
  existing: number;
  conflicts: number;
  ambiguousReferences: number;
}

const getSpreadsheetId = (): string => {
  const spreadsheetId = String(process.env.GOOGLE_SPREADSHEET_ID ?? '').trim();
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID doit être configuré.');
  }
  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(spreadsheetId)) {
    throw new Error('GOOGLE_SPREADSHEET_ID est invalide.');
  }
  return spreadsheetId;
};

export const getSheetEditUrl = (): string =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(getSpreadsheetId())}/edit`;

const getSheetName = (): string => {
  const sheetName = String(process.env.GOOGLE_SHEET_NAME ?? 'Mirocho').trim();
  if (!sheetName || sheetName.length > 100 || /[\r\n]/.test(sheetName)) {
    throw new Error('GOOGLE_SHEET_NAME est invalide.');
  }
  return sheetName;
};

const sheetRangePrefix = (): string =>
  `'${getSheetName().replace(/'/g, "''")}'`;
const STATUS_HEADER_CANDIDATES = ['etat', 'État', 'Etat', 'Statut', 'Status'];
const CARRIER_STATUS_HEADER_CANDIDATES = [
  'Statut transporteur',
  'Statut DHD',
  'Statut ECOTRACK',
  'Carrier status',
  'État du colis',
  'Etat du colis',
  'Statut du colis',
  'Statut colis',
];
const CARRIER_TYPE_HEADER_CANDIDATES = [
  'Transporteur',
  'Prestataire de livraison',
  'Compte transporteur',
  'Carrier',
];
const VARIANT_HEADER_CANDIDATES = [
  'Variante',
  'Variation',
  'Taille',
  'Variante produit',
  'Variant',
];
const TRACKING_HEADER_CANDIDATES = [
  'Tracking',
  'tracking',
  'Tracking number',
  'tracking number',
  'Numéro de suivi',
  'numero de suivi',
  'Num de suivi',
  'num de suivi',
  'Code de suivi',
  'code de suivi',
  'Code suivi',
  'code suivi',
  'AWB',
  'awb',
  'AWB number',
  'awb number',
];
const DELIVERY_TYPE_HEADER_CANDIDATES = [
  'Type de livraison',
  'Type livraison',
  'Mode de livraison',
  'Livraison',
  'Livraison type',
];
const WILAYA_HEADER_CANDIDATES = [
  'Wilaya',
  'wilaya',
  'Wilaya de destination',
  'Wilaya destination',
];
const COMMUNE_HEADER_CANDIDATES = [
  'Commune',
  'commune',
  'Commune de destination',
  'Commune destination',
  'Ville',
  'ville',
];
const ID_HEADER_CANDIDATES = ['ID', 'Identifiant', 'Order ID'];
const REFERENCE_HEADER_CANDIDATES = [
  'Référence',
  'Reference',
  'Ref',
  'Référence commande',
  'Reference commande',
];
const CLIENT_HEADER_CANDIDATES = [
  'Nom du client',
  'Nom client',
  'Client',
  'Nom',
];
const PHONE_HEADER_CANDIDATES = [
  'Numero',
  'Numéro',
  'Téléphone',
  'Telephone',
  'Tel',
  'Phone',
];
const PHONE_2_HEADER_CANDIDATES = [
  'Téléphone 2',
  'Telephone 2',
  'Numero 2',
  'Numéro 2',
  'Phone 2',
];
const ADDRESS_HEADER_CANDIDATES = ['Adresse', 'Address'];
const AMOUNT_HEADER_CANDIDATES = [
  'Total',
  'Montant',
  'Montant total',
  'Prix total',
];
const PRODUCT_HEADER_CANDIDATES = [
  'Produit',
  'Product',
  'Article',
  'Nom du produit',
];
const DATE_HEADER_CANDIDATES = ['Date', 'Date commande', 'Created at'];
const OPERATION_TYPE_HEADER_CANDIDATES = [
  'Type opération DHD',
  'Type operation DHD',
];
const SOURCE_HEADER_CANDIDATES = [
  'Source commande',
  'Source',
  'Order source',
];

const IMPORT_REQUIRED_HEADERS: Array<{
  label: string;
  candidates: string[];
}> = [
  { label: 'Nom du client', candidates: CLIENT_HEADER_CANDIDATES },
  { label: 'Numero', candidates: PHONE_HEADER_CANDIDATES },
  { label: 'Téléphone 2', candidates: PHONE_2_HEADER_CANDIDATES },
  { label: 'Adresse', candidates: ADDRESS_HEADER_CANDIDATES },
  { label: 'Commune', candidates: COMMUNE_HEADER_CANDIDATES },
  { label: 'Wilaya', candidates: WILAYA_HEADER_CANDIDATES },
  { label: 'Total', candidates: AMOUNT_HEADER_CANDIDATES },
  { label: 'Produit', candidates: PRODUCT_HEADER_CANDIDATES },
  { label: 'Date', candidates: DATE_HEADER_CANDIDATES },
  { label: 'ID', candidates: ID_HEADER_CANDIDATES },
  { label: 'Référence', candidates: REFERENCE_HEADER_CANDIDATES },
  { label: 'Tracking', candidates: TRACKING_HEADER_CANDIDATES },
  { label: 'Statut transporteur', candidates: CARRIER_STATUS_HEADER_CANDIDATES },
  { label: 'Transporteur', candidates: CARRIER_TYPE_HEADER_CANDIDATES },
  { label: 'Type opération DHD', candidates: OPERATION_TYPE_HEADER_CANDIDATES },
  { label: 'Source commande', candidates: SOURCE_HEADER_CANDIDATES },
];

const HEADER_CACHE_TTL_MS = 5 * 60 * 1000;

export const selectPrimarySheetStatus = (
  businessStatus: string,
  carrierStatus: string | undefined,
  hasDedicatedCarrierStatusColumn: boolean
): string => {
  const officialStatus = carrierStatus?.trim();
  return officialStatus && !hasDedicatedCarrierStatusColumn
    ? officialStatus
    : businessStatus;
};

const normalizeHeaderForImport = (header: string): string =>
  header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]+/g, '')
    .trim()
    .toLowerCase();

const findHeaderIndex = (headers: string[], candidates: string[]): number => {
  const normalizedCandidates = new Set(
    candidates.map(normalizeHeaderForImport)
  );
  return headers.findIndex((header) =>
    normalizedCandidates.has(normalizeHeaderForImport(header))
  );
};

const normalizedTracking = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim().replace(/\s+/g, '').toUpperCase()
    : '';

export const buildCarrierSheetRowValues = (
  headers: string[],
  order: CarrierSheetOrder
): string[] => {
  const values = Array.from({ length: headers.length }, () => '');
  const set = (candidates: string[], value: unknown) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const index = findHeaderIndex(headers, candidates);
    if (index >= 0) values[index] = String(value).trim();
  };
  set(ID_HEADER_CANDIDATES, order.reference || `DHD-${order.tracking}`);
  set(REFERENCE_HEADER_CANDIDATES, order.reference);
  set(CLIENT_HEADER_CANDIDATES, order.client);
  set(PHONE_HEADER_CANDIDATES, order.phone);
  set(PHONE_2_HEADER_CANDIDATES, order.phone2);
  set(ADDRESS_HEADER_CANDIDATES, order.address);
  set(COMMUNE_HEADER_CANDIDATES, order.commune);
  set(WILAYA_HEADER_CANDIDATES, order.wilayaId);
  set(AMOUNT_HEADER_CANDIDATES, order.amount);
  set(PRODUCT_HEADER_CANDIDATES, order.products);
  set(DATE_HEADER_CANDIDATES, order.createdAt);
  set(TRACKING_HEADER_CANDIDATES, order.tracking);
  set(STATUS_HEADER_CANDIDATES, order.businessStatus);
  set(CARRIER_STATUS_HEADER_CANDIDATES, order.carrierStatus);
  set(CARRIER_TYPE_HEADER_CANDIDATES, order.carrierType);
  set(OPERATION_TYPE_HEADER_CANDIDATES, order.typeId);
  set(SOURCE_HEADER_CANDIDATES, order.source);
  return values;
};

const extractRowNumber = (value: unknown): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value >= 2 && value <= 1_000_000 ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const directMatch = trimmed.match(/^\d+$/);
    const labelledMatch = trimmed.match(
      /^(?:row|ligne|sheet)[\s#:_-]*(\d+)$/i
    );
    const parsed = Number(directMatch?.[0] ?? labelledMatch?.[1]);
    if (Number.isSafeInteger(parsed) && parsed >= 2 && parsed <= 1_000_000) {
      return parsed;
    }
  }

  return null;
};

export class SheetSyncService {
  private sheetsClientPromise?: Promise<sheets_v4.Sheets>;
  private headerCache?: { headers: string[]; fetchedAt: number };

  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    if (!this.sheetsClientPromise) {
      getSpreadsheetId();
      const email = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '').trim();
      const key = String(process.env.GOOGLE_PRIVATE_KEY ?? '')
        .replace(/\\n/g, '\n')
        .trim();
      if (!email || !key) {
        throw new Error(
          'GOOGLE_SERVICE_ACCOUNT_EMAIL et GOOGLE_PRIVATE_KEY doivent etre configures.'
        );
      }
      const auth = new JWT({
        email,
        key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClientPromise = Promise.resolve(
        google.sheets({ version: 'v4', auth })
      );
    }

    return this.sheetsClientPromise;
  }

  async getSheetCsv(): Promise<string> {
    const sheets = await this.getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: sheetRangePrefix(),
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const rows = response.data.values ?? [];
    const escapeCell = (value: unknown): string => {
      const text = value === undefined || value === null ? '' : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  }

  private normalizeHeaderName(header: string): string {
    return header
      .normalize('NFD')
      .replace(/[\u0300-\u036f]+/g, '')
      .trim()
      .toLowerCase();
  }

  private columnIndexToLetter(index: number): string {
    let result = '';
    let current = index;
    while (current >= 0) {
      result = String.fromCharCode((current % 26) + 65) + result;
      current = Math.floor(current / 26) - 1;
    }
    return result;
  }

  private async getHeaderRow(): Promise<string[]> {
    if (
      this.headerCache &&
      Date.now() - this.headerCache.fetchedAt < HEADER_CACHE_TTL_MS
    ) {
      return this.headerCache.headers;
    }

    const sheets = await this.getSheetsClient();
    const response = await retryIdempotentSheetsOperation(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: getSpreadsheetId(),
        range: `${sheetRangePrefix()}!1:1`,
      })
    );
    const headers = (response.data.values?.[0] ?? []).map((cell) =>
      typeof cell === 'string' ? cell : String(cell ?? '')
    );
    this.headerCache = { headers, fetchedAt: Date.now() };
    return headers;
  }

  private async ensureCarrierImportHeaders(): Promise<string[]> {
    const currentHeaders = await this.getHeaderRow();
    const additions = IMPORT_REQUIRED_HEADERS.filter(
      ({ candidates }) => findHeaderIndex(currentHeaders, candidates) < 0
    ).map(({ label }) => label);
    if (additions.length === 0) return currentHeaders;

    const sheets = await this.getSheetsClient();
    const startColumn = this.columnIndexToLetter(currentHeaders.length);
    const endColumn = this.columnIndexToLetter(
      currentHeaders.length + additions.length - 1
    );
    await retryIdempotentSheetsOperation(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `${sheetRangePrefix()}!${startColumn}1:${endColumn}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [additions] },
      })
    );
    // L'update reussie confirme exactement ces en-tetes. Les reutiliser
    // evite une relecture immediate pouvant retourner temporairement une
    // ligne tronquee et decaler la derniere colonne technique de l'import.
    const updatedHeaders = [...currentHeaders, ...additions];
    this.headerCache = { headers: updatedHeaders, fetchedAt: Date.now() };
    return updatedHeaders;
  }

  async upsertCarrierOrders(
    rawOrders: CarrierSheetOrder[],
    links: {
      preferredRowIdsByTracking?: Record<string, string>;
      occupiedRowTrackings?: Record<string, string>;
      externalRowIds?: string[];
      blockedTrackings?: string[];
    } = {}
  ): Promise<UpsertCarrierSheetOrdersResult> {
    if (rawOrders.length > 400) {
      throw new Error('Un import Google Sheets ne peut pas depasser 400 colis.');
    }
    const uniqueOrders = Array.from(
      new Map(
        rawOrders
          .map((order) => [normalizedTracking(order.tracking), order] as const)
          .filter(([tracking]) => Boolean(tracking))
      ).values()
    );
    if (uniqueOrders.length === 0) {
      return {
        matches: [],
        appended: 0,
        linkedByReference: 0,
        existing: 0,
        conflicts: 0,
        ambiguousReferences: 0,
      };
    }

    const headers = await this.ensureCarrierImportHeaders();
    const sheets = await this.getSheetsClient();
    const response = await retryIdempotentSheetsOperation(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: getSpreadsheetId(),
        range: sheetRangePrefix(),
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
      })
    );
    const sheetRows = (response.data.values ?? []).slice(1).map((raw, index) => {
      const values = Array.from({ length: headers.length }, (_, column) =>
        String(raw[column] ?? '').trim()
      );
      return { rowNumber: index + 2, values };
    });
    const trackingIndex = findHeaderIndex(headers, TRACKING_HEADER_CANDIDATES);
    const referenceIndex = findHeaderIndex(headers, REFERENCE_HEADER_CANDIDATES);
    const idIndex = findHeaderIndex(headers, ID_HEADER_CANDIDATES);
    const statusIndex = findHeaderIndex(headers, STATUS_HEADER_CANDIDATES);
    const sourceIndex = findHeaderIndex(headers, SOURCE_HEADER_CANDIDATES);
    if (trackingIndex < 0 || referenceIndex < 0) {
      throw new Error('Colonnes techniques DHD introuvables apres initialisation.');
    }

    const rowsByNumber = new Map(
      sheetRows.map((row) => [String(row.rowNumber), row])
    );
    const rowsByTracking = new Map<string, typeof sheetRows>();
    const rowsByReference = new Map<string, typeof sheetRows>();
    const addToIndex = (
      index: Map<string, typeof sheetRows>,
      key: string,
      row: (typeof sheetRows)[number]
    ) => {
      if (!key) return;
      const bucket = index.get(key) ?? [];
      if (!bucket.some((candidate) => candidate.rowNumber === row.rowNumber)) {
        bucket.push(row);
      }
      index.set(key, bucket);
    };
    for (const row of sheetRows) {
      addToIndex(
        rowsByTracking,
        normalizedTracking(row.values[trackingIndex]),
        row
      );
      addToIndex(
        rowsByReference,
        String(row.values[referenceIndex] ?? '').trim().toUpperCase(),
        row
      );
      if (idIndex >= 0) {
        addToIndex(
          rowsByReference,
          String(row.values[idIndex] ?? '').trim().toUpperCase(),
          row
        );
      }
    }

    const preferred = new Map(
      Object.entries(links.preferredRowIdsByTracking ?? {}).map(([key, value]) => [
        normalizedTracking(key),
        String(value).trim(),
      ])
    );
    const occupied = new Map(
      Object.entries(links.occupiedRowTrackings ?? {}).map(([key, value]) => [
        String(key).trim(),
        normalizedTracking(value),
      ])
    );
    const knownMongoTrackings = new Set(
      Array.from(occupied.values()).filter(Boolean)
    );
    const externalRowIds = new Set(
      (links.externalRowIds ?? []).map((value) => String(value).trim())
    );
    const blockedTrackings = new Set(
      (links.blockedTrackings ?? []).map(normalizedTracking).filter(Boolean)
    );
    const claimedRows = new Set<number>();
    const matches: CarrierSheetMatch[] = [];
    const appendOrders: CarrierSheetOrder[] = [];
    const cellUpdates: Array<{ range: string; values: string[][] }> = [];
    let linkedByReference = 0;
    let existing = 0;
    let conflicts = 0;
    let ambiguousReferences = 0;

    const toRowObject = (rowNumber: number, values: string[]) => {
      const row: Record<string, unknown> = { 'id-sheet': String(rowNumber) };
      headers.forEach((header, index) => {
        if (header) row[header] = values[index] ?? '';
      });
      return row;
    };
    const canUseRow = (
      row: (typeof sheetRows)[number],
      tracking: string
    ) => {
      const sheetTracking = normalizedTracking(row.values[trackingIndex]);
      const mongoTracking = occupied.get(String(row.rowNumber));
      const mongoConfirmsRow =
        mongoTracking === tracking &&
        (!sheetTracking ||
          sheetTracking === tracking ||
          !knownMongoTrackings.has(sheetTracking));
      return (
        !claimedRows.has(row.rowNumber) &&
        (mongoConfirmsRow || !sheetTracking || sheetTracking === tracking) &&
        (!mongoTracking || mongoTracking === tracking)
      );
    };

    for (const order of uniqueOrders) {
      const tracking = normalizedTracking(order.tracking);
      if (blockedTrackings.has(tracking)) {
        conflicts += 1;
        continue;
      }
      const preferredRowId = preferred.get(tracking);
      let matchedRow = preferredRowId
        ? rowsByNumber.get(preferredRowId)
        : undefined;
      let matchType: CarrierSheetMatch['matchType'] = 'mongo';
      if (matchedRow && !canUseRow(matchedRow, tracking)) {
        conflicts += 1;
        continue;
      }
      if (!matchedRow) {
        const trackingRows = rowsByTracking.get(tracking) ?? [];
        if (trackingRows.length > 1) {
          conflicts += 1;
          continue;
        }
        matchedRow = trackingRows.find((row) => canUseRow(row, tracking));
        matchType = 'tracking';
      }
      if (!matchedRow && order.reference) {
        const candidates = (rowsByReference.get(order.reference.trim().toUpperCase()) ?? [])
          .filter((row) => canUseRow(row, tracking));
        if (candidates.length === 1) {
          matchedRow = candidates[0];
          matchType = 'reference';
          linkedByReference += 1;
        } else if (candidates.length > 1) {
          ambiguousReferences += 1;
        }
      }
      if (!matchedRow) {
        appendOrders.push(order);
        continue;
      }

      claimedRows.add(matchedRow.rowNumber);
      const externalSource =
        externalRowIds.has(String(matchedRow.rowNumber)) ||
        (sourceIndex >= 0 &&
          normalizeHeaderForImport(matchedRow.values[sourceIndex]) ===
            'carrier_import');
      const importedValues = buildCarrierSheetRowValues(headers, {
        ...order,
        source: externalSource ? 'carrier_import' : 'site',
      });
      const mongoTracking = occupied.get(String(matchedRow.rowNumber));
      const repairMisalignedExternalRow =
        externalSource &&
        mongoTracking === tracking &&
        normalizedTracking(matchedRow.values[trackingIndex]) !== tracking;
      const metadataIndexes = new Set(
        [
          TRACKING_HEADER_CANDIDATES,
          REFERENCE_HEADER_CANDIDATES,
          STATUS_HEADER_CANDIDATES,
          CARRIER_STATUS_HEADER_CANDIDATES,
          CARRIER_TYPE_HEADER_CANDIDATES,
          OPERATION_TYPE_HEADER_CANDIDATES,
          SOURCE_HEADER_CANDIDATES,
        ]
          .map((candidates) => findHeaderIndex(headers, candidates))
          .filter((index) => index >= 0)
      );
      if (repairMisalignedExternalRow) {
        // Une ancienne version utilisait le nom d'onglet seul comme plage
        // d'append; Google a alors commence en colonne L. Ces lignes sont
        // identifiees a la fois par Mongo (source externe + tracking) et par
        // le tracking Sheet incoherent. Reecrire A:T et effacer U:AE repare
        // toutes les donnees decalees sans toucher aux lignes historiques.
        const overflowColumnsToClear = 11;
        const repairedValues = [
          ...importedValues,
          ...Array.from({ length: overflowColumnsToClear }, () => ''),
        ];
        matchedRow.values = [...importedValues];
        cellUpdates.push({
          range: `${sheetRangePrefix()}!A${matchedRow.rowNumber}:${this.columnIndexToLetter(repairedValues.length - 1)}${matchedRow.rowNumber}`,
          values: [repairedValues],
        });
      } else {
        importedValues.forEach((value, column) => {
          if (!value) return;
          if (
            column === statusIndex &&
            order.businessStatus === 'new' &&
            Boolean(order.carrierStatus) &&
            Boolean(matchedRow?.values[column])
          ) {
            return;
          }
          const shouldWrite =
            metadataIndexes.has(column) || !matchedRow?.values[column];
          if (!shouldWrite || matchedRow?.values[column] === value) return;
          matchedRow.values[column] = value;
          cellUpdates.push({
            range: `${sheetRangePrefix()}!${this.columnIndexToLetter(column)}${matchedRow.rowNumber}`,
            values: [[value]],
          });
        });
      }
      matches.push({
        tracking,
        rowId: String(matchedRow.rowNumber),
        row: toRowObject(matchedRow.rowNumber, matchedRow.values),
        matchType,
        externalSource,
      });
      existing += matchType === 'reference' ? 0 : 1;
    }

    for (let index = 0; index < cellUpdates.length; index += 500) {
      await retryIdempotentSheetsOperation(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: getSpreadsheetId(),
          requestBody: {
            valueInputOption: 'RAW',
            data: cellUpdates.slice(index, index + 500),
          },
        })
      );
    }

    if (appendOrders.length > 0) {
      // values.append choisit la premiere colonne d'une "table logique" et
      // peut donc ignorer A meme avec une plage A:T. La lecture precedente
      // donne la derniere ligne non vide; le verrou global DHD protege les
      // appels applicatifs concurrents. Une update explicite fixe A:T sans
      // aucune detection heuristique de table par Google.
      const firstRow = (response.data.values ?? []).length + 1;
      const lastRow = firstRow + appendOrders.length - 1;
      const appendedValues = appendOrders.map((order) =>
        buildCarrierSheetRowValues(headers, {
          ...order,
          source: 'carrier_import',
        })
      );
      await retryIdempotentSheetsOperation(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId: getSpreadsheetId(),
          range: `${sheetRangePrefix()}!A${firstRow}:${this.columnIndexToLetter(headers.length - 1)}${lastRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: appendedValues },
        })
      );
      appendOrders.forEach((order, index) => {
        const rowNumber = firstRow + index;
        const values = appendedValues[index];
        matches.push({
          tracking: normalizedTracking(order.tracking),
          rowId: String(rowNumber),
          row: toRowObject(rowNumber, values),
          matchType: 'appended',
          externalSource: true,
        });
      });
    }

    return {
      matches,
      appended: appendOrders.length,
      linkedByReference,
      existing,
      conflicts,
      ambiguousReferences,
    };
  }

  private async resolveColumnLetter(
    candidates: string[],
    rejectAmbiguous = false
  ): Promise<string | null> {
    const headers = await this.getHeaderRow();
    const normalizedHeaders = headers.map((header) =>
      this.normalizeHeaderName(header)
    );
    const normalizedCandidates = candidates.map((candidate) =>
      this.normalizeHeaderName(candidate)
    );

    const matches: number[] = [];
    for (let index = 0; index < normalizedHeaders.length; index++) {
      if (normalizedCandidates.includes(normalizedHeaders[index])) {
        matches.push(index);
      }
    }
    if (rejectAmbiguous && matches.length > 1) {
      throw new Error(
        `Colonnes ambigues dans "${getSheetName()}": ${matches
          .map((index) => headers[index])
          .join(', ')}.`
      );
    }
    return matches.length > 0 ? this.columnIndexToLetter(matches[0]) : null;
  }

  private extractVariantValue(
    row: Record<string, unknown> | undefined
  ): string | undefined {
    if (!row) {
      return undefined;
    }
    for (const [key, value] of Object.entries(row)) {
      if (!value && value !== 0) continue;
      const normalizedKey = this.normalizeHeaderName(String(key));
      if (
        VARIANT_HEADER_CANDIDATES.some(
          (candidate) =>
            this.normalizeHeaderName(candidate) === normalizedKey
        )
      ) {
        const trimmed = String(value ?? '').trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return undefined;
  }

  private extractDeliveryTypeValue(
    row: Record<string, unknown> | undefined
  ): string | undefined {
    if (!row) {
      return undefined;
    }
    for (const [key, value] of Object.entries(row)) {
      if (!value && value !== 0) continue;
      const normalizedKey = this.normalizeHeaderName(String(key));
      if (
        DELIVERY_TYPE_HEADER_CANDIDATES.some(
          (candidate) =>
            this.normalizeHeaderName(candidate) === normalizedKey
        )
      ) {
        const trimmed = String(value ?? '').trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return undefined;
  }

  private resolveRowNumber(
    rowId: string,
    row: Record<string, unknown> | undefined
  ): number {
    const trimmed = rowId.trim();
    if (!trimmed) {
      throw new Error('Identifiant de ligne vide fourni.');
    }

    const cleaned = trimmed.replace(/\$/g, '');
    const directRow = extractRowNumber(cleaned);
    if (directRow) {
      return directRow;
    }

    if (row) {
      const candidateKeys = [
        'id-sheet',
        'ID',
        'id',
        'row',
        'rowId',
        'ligne',
        'index',
      ];

      for (const key of candidateKeys) {
        const value = row[key];
        const extracted = extractRowNumber(value);
        if (extracted) {
          return extracted;
        }
      }
    }

    throw new Error(
      `Impossible de déterminer la ligne cible dans le Google Sheet pour l'identifiant "${rowId}".`
    );
  }

  private async buildStatusUpdates(payload: UpdateStatusPayload) {
    const { rowId, status, tracking, carrierStatus, carrierType, row } = payload;
    if (!rowId) throw new Error('Le champ "rowId" est requis.');
    if (!status) throw new Error('Le champ "status" est requis.');

    const rowNumber = this.resolveRowNumber(rowId, row);
    const updates: Array<{ range: string; values: string[][] }> = [];
    const statusColumn = await this.resolveColumnLetter(
      STATUS_HEADER_CANDIDATES,
      true
    );
    if (!statusColumn) {
      throw new Error(`Colonne statut introuvable dans la feuille "${getSheetName()}".`);
    }
    const officialCarrierStatus = carrierStatus?.trim();
    const carrierStatusColumn = officialCarrierStatus
      ? await this.resolveColumnLetter(CARRIER_STATUS_HEADER_CANDIDATES)
      : null;
    updates.push({
      range: `${sheetRangePrefix()}!${statusColumn}${rowNumber}`,
      values: [[
        selectPrimarySheetStatus(
          status,
          officialCarrierStatus,
          Boolean(carrierStatusColumn)
        ),
      ]],
    });

    if (officialCarrierStatus && carrierStatusColumn) {
      if (carrierStatusColumn === statusColumn) {
        updates[0].values = [[officialCarrierStatus]];
      } else {
        updates.push({
          range: `${sheetRangePrefix()}!${carrierStatusColumn}${rowNumber}`,
          values: [[officialCarrierStatus]],
        });
      }
    }
    if (carrierType) {
      const column = await this.resolveColumnLetter(CARRIER_TYPE_HEADER_CANDIDATES);
      if (column) {
        updates.push({
          range: `${sheetRangePrefix()}!${column}${rowNumber}`,
          values: [[carrierType]],
        });
      }
    }
    const variantValue = this.extractVariantValue(row);
    if (variantValue) {
      const column = await this.resolveColumnLetter(VARIANT_HEADER_CANDIDATES);
      if (column) {
        updates.push({
          range: `${sheetRangePrefix()}!${column}${rowNumber}`,
          values: [[variantValue]],
        });
      }
    }
    const deliveryTypeValue = this.extractDeliveryTypeValue(row);
    if (deliveryTypeValue) {
      const column = await this.resolveColumnLetter(DELIVERY_TYPE_HEADER_CANDIDATES);
      if (column) {
        updates.push({
          range: `${sheetRangePrefix()}!${column}${rowNumber}`,
          values: [[deliveryTypeValue]],
        });
      }
    }
    const trimmedTracking = tracking?.trim();
    if (trimmedTracking) {
      const column = await this.resolveColumnLetter(TRACKING_HEADER_CANDIDATES);
      if (column) {
        updates.push({
          range: `${sheetRangePrefix()}!${column}${rowNumber}`,
          values: [[trimmedTracking]],
        });
      }
    }
    return updates;
  }

  async updateStatus(payload: UpdateStatusPayload) {
    const { rowId, status, tracking, carrierStatus, carrierType, row } = payload;
    if (!rowId) {
      throw new Error('Le champ "rowId" est requis.');
    }
    if (!status) {
      throw new Error('Le champ "status" est requis.');
    }

    const sheets = await this.getSheetsClient();
    const updates = await this.buildStatusUpdates(payload);

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });

    return {
      updatedRanges: updates.map((update) => update.range),
      status,
      tracking: tracking ?? null,
    };
  }

  async updateStatuses(payloads: UpdateStatusPayload[]) {
    if (payloads.length === 0) return { updatedRanges: [] as string[] };
    if (payloads.length > 100) {
      throw new Error('Un lot Google Sheets ne peut pas depasser 100 commandes.');
    }
    const sheets = await this.getSheetsClient();
    // Remplit le cache une seule fois avant de construire le lot.
    await this.getHeaderRow();
    const updates: Array<{ range: string; values: string[][] }> = [];
    for (const payload of payloads) {
      updates.push(...(await this.buildStatusUpdates(payload)));
    }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { valueInputOption: 'RAW', data: updates },
    });
    return { updatedRanges: updates.map((update) => update.range) };
  }

  async updateWilayaAndCommune(payload: {
    rowId: string;
    wilaya?: string;
    commune?: string;
    row?: Record<string, unknown>;
  }) {
    const { rowId, wilaya, commune, row } = payload;
    if (!rowId) {
      throw new Error('Le champ "rowId" est requis.');
    }
    if (!wilaya && !commune) {
      throw new Error('Au moins un des champs "wilaya" ou "commune" doit être fourni.');
    }

    const sheets = await this.getSheetsClient();
    const rowNumber = this.resolveRowNumber(rowId, row);
    const updates: Array<{ range: string; values: string[][] }> = [];

    if (wilaya) {
      const wilayaColumn = await this.resolveColumnLetter(
        WILAYA_HEADER_CANDIDATES
      );
      if (wilayaColumn) {
        updates.push({
          range: `${sheetRangePrefix()}!${wilayaColumn}${rowNumber}`,
          values: [[wilaya]],
        });
      }
    }

    if (commune) {
      const communeColumn = await this.resolveColumnLetter(
        COMMUNE_HEADER_CANDIDATES
      );
      if (communeColumn) {
        updates.push({
          range: `${sheetRangePrefix()}!${communeColumn}${rowNumber}`,
          values: [[commune]],
        });
      }
    }

    if (updates.length === 0) {
      throw new Error('Aucune colonne trouvée pour mettre à jour wilaya ou commune.');
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });

    return {
      updatedRanges: updates.map((update) => update.range),
      wilaya: wilaya ?? null,
      commune: commune ?? null,
    };
  }
}

const sheetService = new SheetSyncService();

export default sheetService;
