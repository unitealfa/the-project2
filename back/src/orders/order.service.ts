import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';

export interface UpdateStatusPayload {
  rowId: string;
  status: string;
  tracking?: string;
  carrierStatus?: string;
  carrierType?: 'api_dhd' | 'api_sook';
  row?: Record<string, unknown>;
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

const HEADER_CACHE_TTL_MS = 5 * 60 * 1000;

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
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `${sheetRangePrefix()}!1:1`,
    });
    const headers = (response.data.values?.[0] ?? []).map((cell) =>
      typeof cell === 'string' ? cell : String(cell ?? '')
    );
    this.headerCache = { headers, fetchedAt: Date.now() };
    return headers;
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
    updates.push({
      range: `${sheetRangePrefix()}!${statusColumn}${rowNumber}`,
      values: [[status]],
    });

    if (carrierStatus?.trim()) {
      const column = await this.resolveColumnLetter(CARRIER_STATUS_HEADER_CANDIDATES);
      if (column) {
        updates.push({
          range: `${sheetRangePrefix()}!${column}${rowNumber}`,
          values: [[carrierStatus.trim()]],
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
