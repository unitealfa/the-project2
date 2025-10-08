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
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCNrlwBs6WmRxDb
cy5lv6m/klx9o0UYic4SCxZ26Mr6PGbkHrUftvHUWxaEE9FREGAGK9LZuh+l2sIn
xW9biXPHKoA/e2oyRkgUN/1MkJw6eISL/iyoVPkf8u1Z1FLIp7qWZMb58Sc1MLgb
lPujtSn2hcSYQshQKJw3oqVOy8x+Eu/snySAQCbt0x17y44lQ5YaNNjqL5ryitBx
UJwEOkU4aqpVrkEcUAeTyzqA9ZdHdBWECSRa6Gy6VCkoL3Fcw2AhwplRgSuOgcxt
LnXVQlYAnWH41go9pvGa1lMSdc703zQQS+IXV+3tU8ouSoZAAsxk0cD3LFfpqfvR
XhSswtazAgMBAAECggEARjb19AXy/y/TA97WTKiq2H0Rh1ZF5P5OeRSzomSGS3Np
zn4FZ11EBejKhNRJdPI3lHddfHfIPWrns8wd/vBkx3yhqFRicd3w1MxWpP453qRh
k/t4aEgMWrAKvu0Bxd2SE/yHu9CujKbDZy/zcdNTo4/xuT/HhCpMGSpq4F0R0ByX
hFjghGRrj2fcVM1Y0mFPaBMtYDl5wRmaSB+7/kWxf56vB4rSPfmZEhWAiuYP6FR3
HVGsAJXZ8u/hAun1L6OYnYaeOdvBvQeHySYMit8Z07UFf6JXRb+/syZaJXtYoucB
kWF4k/+8zpvjgnHubPm1zhJzJvbil++ccl/ddqn72QKBgQDHHdalNoJYTLEsRq6w
rA3sDwHlLX2pqNnlu4TPGjL1lAU9A0IIHuRA50+Ni+iayNFjM8/1B/ocC1RVjBSu
aztamVDEeFamnOdkplgT9ywt4YdyUr+5IZls+fY7SSphacScl/BYPuTIuf2Inmew
jWooZgKS8Kmk2TZDmVZy1FqlrQKBgQC2KAs+QmFP41KLeBS10DXU2RKbz15mtaf3
vcPCho9bRANyzlpVByIGED3D7BmRScyoKby3qDszNN5sS0BFbvWmi7zMm5uQ/Toc
vAxaV0BwMC7XeC7/BIZajhWP6tw6PMRwAn1WPP2EALCDGzSCXKBDpbV/l9jERaly
wz1RYa053wKBgQCRGMhKek8/oxtUpWk1Kxu2EjWSWLUCxh2K0Dv2YyQRWrz6ef5L
Rp+UQDrzbamh6YbT4HTBHQAAIa1h7YNAmrmUyrZVhU+3eA0ShjkWy35xLLBz+aLm
eHqCNCBfkXCFrfptFjc5RxOWxhnfzXbH7DUYnUVw6Fjm3LYzSnD5mo83vQKBgDhH
7RlidyCw0vtGsddvKoLGQyqjCr7fV7ODDW4YF0kSnaImQeDNoGSRNhRH6aprS/GV
W7q/HvN2XVbGdWg+nWXE/SOW3J0SsJbaP1LWbJF9QavPdW3T3xMxnVXnMf5IckVN
b55qn8XeVKtdh37T0ay1EXwH1bDm+TD9Q//WFyivAoGBAIt9BewW34woh/WsiHFZ
sPWlvH29JEi4VK762taEgy26YQ344nLgl7jfehma/1qizL+SYWku2th7DyjgdO1A
zymbLGlB6zCHKa0LRCWzqgr7aAbyJXxvnAwaermaZGCFoBgSMHN7BD0anfkrYu9m
kZ+dy+C+CiIcx23bJlr6405X
-----END PRIVATE KEY-----
`;

const SPREADSHEET_ID = '1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q';
const SHEET_NAME = 'Mirocho';
const STATUS_COLUMN_LETTER = 'L';

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
    const range = `${SHEET_NAME}!${STATUS_COLUMN_LETTER}${rowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status]] },
    });

    return {
      updatedRanges: [range],
      status,
      tracking: tracking ?? null,
    };
  }
}

const sheetService = new SheetSyncService();

export default sheetService;
