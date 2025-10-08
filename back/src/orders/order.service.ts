import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';

interface UpdateStatusPayload {
  rowId: string;
  status: string;
  tracking?: string;
  row?: Record<string, unknown>;
}

interface SheetUpdateInstruction {
  range: string;
  values: string[][];
}

const normalizeHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const columnIndexToLetter = (index: number) => {
  if (index <= 0) {
    throw new Error(`Indice de colonne invalide: ${index}`);
  }
  let letter = '';
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    current = Math.floor((current - 1) / 26);
  }
  return letter;
};

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

class SheetSyncService {
  private readonly spreadsheetId?: string;
  private readonly sheetName: string;
  private readonly statusColumnLetterEnv?: string;
  private readonly statusColumnHeaderEnv?: string;
  private readonly trackingColumnLetterEnv?: string;
  private readonly trackingColumnHeaderEnv?: string;
  private readonly headerCacheTtlMs = 5 * 60 * 1000;

  private sheetsClientPromise?: Promise<sheets_v4.Sheets>;
  private headerCache: { values: string[]; expiresAt: number } | null = null;

  constructor() {
    this.spreadsheetId =
      process.env.GOOGLE_SHEET_ID ||
      process.env.SHEET_ID ||
      process.env.GOOGLE_SPREADSHEET_ID;

    this.sheetName =
      process.env.GOOGLE_SHEET_TAB_NAME ||
      process.env.SHEET_TAB_NAME ||
      process.env.GOOGLE_SHEET_NAME ||
      'Mirocho';

    this.statusColumnLetterEnv =
      process.env.GOOGLE_SHEET_STATUS_COLUMN_LETTER ||
      process.env.GOOGLE_SHEET_STATUS_COLUMN;

    this.statusColumnHeaderEnv =
      process.env.GOOGLE_SHEET_STATUS_HEADER ||
      process.env.GOOGLE_SHEET_STATUS_COLUMN_HEADER ||
      'etat';

    this.trackingColumnLetterEnv =
      process.env.GOOGLE_SHEET_TRACKING_COLUMN_LETTER ||
      process.env.GOOGLE_SHEET_TRACKING_COLUMN;

    this.trackingColumnHeaderEnv =
      process.env.GOOGLE_SHEET_TRACKING_HEADER ||
      process.env.GOOGLE_SHEET_TRACKING_COLUMN_HEADER;
  }

  private ensureSpreadsheetId(): string {
    if (!this.spreadsheetId) {
      throw new Error(
        "La variable d'environnement GOOGLE_SHEET_ID (ou SHEET_ID / GOOGLE_SPREADSHEET_ID) est requise pour synchroniser le statut."
      );
    }
    return this.spreadsheetId;
  }

  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    if (!this.sheetsClientPromise) {
      const email =
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
        process.env.GOOGLE_SHEET_CLIENT_EMAIL ||
        process.env.GOOGLE_SHEET_SERVICE_ACCOUNT_EMAIL;

      if (!email) {
        throw new Error(
          "La variable d'environnement GOOGLE_SERVICE_ACCOUNT_EMAIL (ou GOOGLE_SHEET_CLIENT_EMAIL / GOOGLE_SHEET_SERVICE_ACCOUNT_EMAIL) est requise."
        );
      }

      const rawKey =
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
        process.env.GOOGLE_SHEET_PRIVATE_KEY ||
        '';

      const privateKey = rawKey.replace(/\\n/g, '\n').trim();
      if (!privateKey) {
        throw new Error(
          "La clé privée du compte de service (GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ou GOOGLE_SHEET_PRIVATE_KEY) est requise."
        );
      }

      const auth = new JWT({
        email,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheetsClientPromise = Promise.resolve(
        google.sheets({ version: 'v4', auth })
      );
    }

    return this.sheetsClientPromise;
  }

  private async getHeaderRow(): Promise<string[]> {
    const now = Date.now();
    if (this.headerCache && now < this.headerCache.expiresAt) {
      return this.headerCache.values;
    }

    const sheets = await this.getSheetsClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: this.ensureSpreadsheetId(),
      range: `${this.sheetName}!1:1`,
      majorDimension: 'ROWS',
    });

    const firstRow = result.data.values?.[0];
    if (!firstRow || !Array.isArray(firstRow) || firstRow.length === 0) {
      throw new Error(
        'Impossible de récupérer la ligne des en-têtes dans le Google Sheet.'
      );
    }

    const headers = firstRow.map(cell => (cell === undefined || cell === null ? '' : String(cell)));
    this.headerCache = {
      values: headers,
      expiresAt: now + this.headerCacheTtlMs,
    };

    return headers;
  }

  private async resolveColumnLetter(
    headerName: string | undefined,
    fallbackLetter: string | undefined,
    mandatory: boolean
  ): Promise<string | null> {
    if (fallbackLetter) {
      const sanitized = fallbackLetter.trim();
      if (!/^([A-Za-z]+)$/.test(sanitized)) {
        throw new Error(
          `La colonne spécifiée (${fallbackLetter}) n'est pas un identifiant valide.`
        );
      }
      return sanitized.toUpperCase();
    }

    if (!headerName) {
      if (mandatory) {
        throw new Error(
          "Impossible de déterminer la colonne cible : aucun en-tête n'a été fourni."
        );
      }
      return null;
    }

    const headers = await this.getHeaderRow();
    const normalizedTarget = normalizeHeader(headerName);
    const index = headers.findIndex(h => normalizeHeader(h) === normalizedTarget);

    if (index === -1) {
      if (mandatory) {
        throw new Error(
          `Impossible de trouver la colonne "${headerName}" dans la feuille "${this.sheetName}".`
        );
      }
      return null;
    }

    return columnIndexToLetter(index + 1);
  }

  private async getStatusColumnLetter(): Promise<string> {
    const letter = await this.resolveColumnLetter(
      this.statusColumnHeaderEnv,
      this.statusColumnLetterEnv,
      true
    );

    if (!letter) {
      throw new Error('Impossible de déterminer la colonne du statut.');
    }

    return letter;
  }

  private async getTrackingColumnLetter(): Promise<string | null> {
    return this.resolveColumnLetter(
      this.trackingColumnHeaderEnv,
      this.trackingColumnLetterEnv,
      false
    );
  }

  private resolveRowTarget(
    rowId: string,
    row: Record<string, unknown> | undefined
  ): { rowNumber: number; statusColumnLetterOverride?: string } {
    const trimmed = rowId.trim();
    if (!trimmed) {
      throw new Error('Identifiant de ligne vide fourni.');
    }

    const cleaned = trimmed.replace(/\$/g, '');
    if (/^[A-Za-z]+\d+$/.test(cleaned)) {
      const columnPart = cleaned.replace(/\d+/g, '').toUpperCase();
      const rowPart = cleaned.replace(/\D+/g, '');
      const parsedRow = Number(rowPart);
      if (!Number.isFinite(parsedRow) || parsedRow <= 0) {
        throw new Error(`Numéro de ligne invalide détecté dans l'identifiant: ${rowId}`);
      }

      return {
        rowNumber: Math.floor(parsedRow),
        statusColumnLetterOverride: columnPart,
      };
    }

    const directRow = extractRowNumber(cleaned);
    if (directRow) {
      return { rowNumber: directRow };
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
          return { rowNumber: extracted };
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
    const spreadsheetId = this.ensureSpreadsheetId();
    const target = this.resolveRowTarget(rowId, row);

    const updates: SheetUpdateInstruction[] = [];

    const statusColumnLetter =
      target.statusColumnLetterOverride || (await this.getStatusColumnLetter());
    updates.push({
      range: `${this.sheetName}!${statusColumnLetter}${target.rowNumber}`,
      values: [[status]],
    });

    if (tracking) {
      const trackingColumnLetter = await this.getTrackingColumnLetter();
      if (trackingColumnLetter) {
        updates.push({
          range: `${this.sheetName}!${trackingColumnLetter}${target.rowNumber}`,
          values: [[tracking]],
        });
      }
    }

    if (updates.length === 1) {
      const [single] = updates;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: single.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: single.values },
      });
    } else if (updates.length > 1) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates.map(update => ({
            range: update.range,
            values: update.values,
          })),
        },
      });
    }

    return {
      updatedRanges: updates.map(update => update.range),
      status,
      tracking: tracking ?? null,
    };
  }
}
