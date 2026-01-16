import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';

interface UpdateStatusPayload {
  rowId: string;
  status: string;
  tracking?: string;
  row?: Record<string, unknown>;
}

const SERVICE_ACCOUNT_EMAIL =
  'sheet-bot@sheetbot-474512.iam.gserviceaccount.com';

const PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC8BBXdH8pFDgo7\nxrQlzIb2fa9aY8+NGU/ceQyRcaZBWazO06+dGwH+9n+P/U/quCQZ6gMDEsPtwzBp\n7va2OIZmshvRmO6vBG1bR6oqIzrLur20jt5bxWJvXOKtIT5sqKBWQHwi4oKpcBK/\n32Pd3TmWhbIVrNZdLxY6OOOzkb5uMiRx6GCdumI/oZzK7TFOrUd8o4bhwxkxawt0\nB6acHkFCNxeem1b/6DeHo3E7ZcGmWK2kWgK6tvbvNf3/5dcN5zgT/8sUIaktHf9V\nuhkMpu6SuXr1goMcigW7UERQHpw6il/Wo3JIDobsVjFYvgtve+8ymIV/NwtKEpu5\nufmGeOl7AgMBAAECggEAPwF3ejSPCfkcgM+jyw7xI2UXAEl2YihbVNzT02GsfzXX\n7S+PKCzGzHQ6ZzxSLawrnOuIutzs/55rePR1hLcIgx2oqOKBCfGH3BD1+0z3BRK9\nQ+akqUhKJluQMshzLOKNaJoPf3k8pB9EiTwJMW5TQBfph831wCBpaHVsCN8MW8yq\nzokRtH2mEfy5ZJohYXloTBRy44XIp962PBnI0/8qdBgkcuW48A/WLZ3D20U1vo3f\ntxxUX/eXBe3UD9j6Dz7ShTWdnE+HtetNG3WM7sNgpTYZfarQAdoN7EJoDvUWuxxU\n2XKPl8B9rS/HMovndAccLnbmkOt3Kbl9ardvhak/kQKBgQDe7KFiPGm9c7Nsf+F8\nLABuf68xxj0vUCWVYukGQCXGd4TOzGwOy9LAINi0kU3xVABbjW/x1matwtdHS58x\nfUr/rarkr4kXRK6LGEm8N7Pi1WIF+m8/u5ru3NsKQItlZVxpUyXakdA1/WEW4Nqc\n4TxG2GWk6XNBI1LLA69N2/U7vQKBgQDX6YZPGEhuV3kGVm2TYgHlZYcfguKUptVB\nKQPmHUI8mfEnPPrCgYVF0jgI0N+YI90D3Ok7kxF4Fa0vcivoZpEOXbRJhUpyptIg\nQfovOlt4vouTnePBTsW8FaLMzNz66n+g+xfXs9FhlSmBq9Ehk7KEsDwBA/cH2NRj\nKTKsQmmxlwKBgQDazF5J0QnnzNvaLlneSkHSMrh9nhkHix6YVRBp9iQde8l6P+H/\nU8ZylMqdz9A0gUIomdW6A7mb6pTpgSuqo1MtSANnmXJwyBSYqSoV9oY0qUMgowD2\nCOi0cUj78wXea3IcXmPU9zDpDNxyXBe1yswirNp21jstP8JPSDqTrMQx8QKBgAWT\n3clbSju3fMPiJbCB/qSLa+MvgWTvrmChi509MkHYhDdMRvoRWH0GQjZQFwaaHpKD\n+W51jST6AmBQZbv6MlMZrpebnuG5V4JH0gu4STakTXzBvml2/HqwYGVEAY1l02g4\nNFR5K7aGoOzdoGhqpVjyKIqqLI6CVnI9VTbH/Gz/AoGAcJzq3A3xDHsqMXvJOg21\n2iJcm9WjzmlTANNsN4An4MM2/h5hfdaT/ry8Nc5oUXsXufoCu5qXZawWboFvtj6n\n0EPk+DPpznm81nOsX13ZMtxBXWrGkjPkxelDaKdArAuoPRUOet+MFW9uQP+yAhLE\niA9k96y0JSMWHWW2V9gM8jg=\n-----END PRIVATE KEY-----\n
`;

const SPREADSHEET_ID = '1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q';
const SHEET_NAME = 'Mirocho';
const STATUS_COLUMN_LETTER = 'L';
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

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const direct = Number(trimmed);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.floor(direct);
    }

    const digitsMatch = trimmed.match(/\d+/);
    if (digitsMatch) {
      const parsed = Number(digitsMatch[0]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
      }
    }
  }

  return null;
};

export class SheetSyncService {
  private sheetsClientPromise?: Promise<sheets_v4.Sheets>;
  private headerCache?: { headers: string[]; fetchedAt: number };

  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    if (!this.sheetsClientPromise) {
      const auth = new JWT({
        email: SERVICE_ACCOUNT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClientPromise = Promise.resolve(
        google.sheets({ version: 'v4', auth })
      );
    }

    return this.sheetsClientPromise;
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
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!1:1`,
    });
    const headers = (response.data.values?.[0] ?? []).map((cell) =>
      typeof cell === 'string' ? cell : String(cell ?? '')
    );
    this.headerCache = { headers, fetchedAt: Date.now() };
    return headers;
  }

  private async resolveColumnLetter(
    candidates: string[]
  ): Promise<string | null> {
    const headers = await this.getHeaderRow();
    const normalizedHeaders = headers.map((header) =>
      this.normalizeHeaderName(header)
    );
    const normalizedCandidates = candidates.map((candidate) =>
      this.normalizeHeaderName(candidate)
    );

    for (let index = 0; index < normalizedHeaders.length; index++) {
      const header = normalizedHeaders[index];
      if (normalizedCandidates.includes(header)) {
        return this.columnIndexToLetter(index);
      }
    }
    return null;
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

  async updateStatus(payload: UpdateStatusPayload) {
    const { rowId, status, tracking, row } = payload;
    if (!rowId) {
      throw new Error('Le champ "rowId" est requis.');
    }
    if (!status) {
      throw new Error('Le champ "status" est requis.');
    }

    const sheets = await this.getSheetsClient();
    const rowNumber = this.resolveRowNumber(rowId, row);
    const updates: Array<{ range: string; values: string[][] }> = [];

    const statusRange = `${SHEET_NAME}!${STATUS_COLUMN_LETTER}${rowNumber}`;
    updates.push({ range: statusRange, values: [[status]] });

    const variantValue = this.extractVariantValue(row);
    if (variantValue) {
      const variantColumn = await this.resolveColumnLetter(
        VARIANT_HEADER_CANDIDATES
      );
      if (variantColumn) {
        updates.push({
          range: `${SHEET_NAME}!${variantColumn}${rowNumber}`,
          values: [[variantValue]],
        });
      }
    }

    const deliveryTypeValue = this.extractDeliveryTypeValue(row);
    if (deliveryTypeValue) {
      const deliveryTypeColumn = await this.resolveColumnLetter(
        DELIVERY_TYPE_HEADER_CANDIDATES
      );
      if (deliveryTypeColumn) {
        updates.push({
          range: `${SHEET_NAME}!${deliveryTypeColumn}${rowNumber}`,
          values: [[deliveryTypeValue]],
        });
      }
    }

     if (tracking) {
      const trimmedTracking = tracking.trim();
      if (trimmedTracking) {
        const trackingColumn = await this.resolveColumnLetter(
          TRACKING_HEADER_CANDIDATES
        );
        if (trackingColumn) {
          updates.push({
            range: `${SHEET_NAME}!${trackingColumn}${rowNumber}`,
            values: [[trimmedTracking]],
          });
        }
      }
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    });

    return {
      updatedRanges: updates.map((update) => update.range),
      status,
      tracking: tracking ?? null,
    };
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
          range: `${SHEET_NAME}!${wilayaColumn}${rowNumber}`,
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
          range: `${SHEET_NAME}!${communeColumn}${rowNumber}`,
          values: [[commune]],
        });
      }
    }

    if (updates.length === 0) {
      throw new Error('Aucune colonne trouvée pour mettre à jour wilaya ou commune.');
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
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
