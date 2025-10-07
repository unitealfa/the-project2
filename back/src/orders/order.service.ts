import http from 'http';
import https from 'https';

interface UpdateStatusPayload {
  rowId: string;
  status: string;
  tracking?: string;
  row?: Record<string, unknown>;
}

interface RequestResult<T = unknown> {
  statusCode?: number;
  data: T;
  rawBody: string;
}

class SheetSyncService {
  private readonly endpoint: string | undefined;

  constructor() {
    this.endpoint = process.env.GOOGLE_SHEET_SYNC_URL || process.env.SHEET_SYNC_URL;
  }

  private ensureEndpoint(): string {
    if (!this.endpoint) {
      throw new Error('GOOGLE_SHEET_SYNC_URL (ou SHEET_SYNC_URL) n\'est pas défini.');
    }
    return this.endpoint;
  }

  async updateStatus(payload: UpdateStatusPayload) {
    const url = this.ensureEndpoint();
    const response = await this.postJson(url, {
      action: 'updateStatus',
      ...payload,
    });
    return response.data;
  }

  private postJson<T = unknown>(urlString: string, body: Record<string, unknown>): Promise<RequestResult<T>> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlString);
      } catch {
        reject(new Error('URL de synchronisation du Sheet invalide.'));
        return;
      }

      const data = JSON.stringify(body);
      const transport = parsedUrl.protocol === 'https:' ? https : http;

      const options: https.RequestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const request = transport.request(parsedUrl, options, response => {
        const chunks: Buffer[] = [];

        response.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          let parsed: any;
          try {
            parsed = rawBody ? JSON.parse(rawBody) : undefined;
          } catch {
            parsed = rawBody;
          }

          const statusCode = response.statusCode;
          if (statusCode && statusCode >= 200 && statusCode < 300) {
            resolve({ statusCode, data: parsed as T, rawBody });
          } else {
            const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
            reject(new Error(`Erreur Google Sheet (${statusCode ?? 'inconnue'}): ${detail}`));
          }
        });
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy(new Error('Délai dépassé lors de la synchronisation du Sheet'));
      });

      request.write(data);
      request.end();
    });
  }
}

export default new SheetSyncService();