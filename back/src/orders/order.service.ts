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

class SheetSyncRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly rawBody?: string
  ) {
    super(message);
    this.name = 'SheetSyncRequestError';
  }
}

class SheetSyncTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Délai dépassé lors de la synchronisation du Sheet (>${timeoutMs} ms)`);
    this.name = 'SheetSyncTimeoutError';
  }
}

class SheetSyncService {
  private readonly endpoint: string | undefined;
  private readonly timeoutMs: number | null;

  constructor() {
    this.endpoint = process.env.GOOGLE_SHEET_SYNC_URL || process.env.SHEET_SYNC_URL;
    this.timeoutMs = this.resolveTimeout();
  }

  private ensureEndpoint(): string {
    if (!this.endpoint) {
      throw new Error('GOOGLE_SHEET_SYNC_URL (ou SHEET_SYNC_URL) n\'est pas défini.');
    }
    return this.endpoint;
  }
private resolveTimeout(): number | null {
    const rawTimeout =
      process.env.GOOGLE_SHEET_SYNC_TIMEOUT_MS || process.env.SHEET_SYNC_TIMEOUT_MS;

    if (!rawTimeout) {
            return 120_000;
    }

    const normalized = rawTimeout.trim().toLowerCase();
    if (normalized === '0' || normalized === 'off' || normalized === 'disable' || normalized === 'disabled') {
      return null;
    }

    const parsed = Number(normalized);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 120_000;
    }

    return parsed;
  }
  
    
  private isTimeoutError(error: unknown): error is Error {
    if (!error) {
      return false;
    }

    if (error instanceof SheetSyncTimeoutError) {
      return true;
    }

    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ETIMEDOUT') {
        return true;
      }

      return /timeout/i.test(error.message) || error.message.includes('Délai dépassé');
    }

    return false;
  }

  async updateStatus(payload: UpdateStatusPayload) {
    const url = this.ensureEndpoint();
    const body = {
      action: 'updateStatus',
      orderId: payload.rowId,
      ...payload,
    };

    try {
      const response = await this.postJson(url, body);
      return response.data;
    } catch (error) {
      if (
        error instanceof SheetSyncRequestError &&
        error.statusCode === 405
      ) {
        const fallbackResponse = await this.getJson(url, body);
        return fallbackResponse.data;
      }
            if (this.isTimeoutError(error)) {
        const fallbackResponse = await this.getJson(url, body);
        return fallbackResponse.data;
      }

      throw error;
    }
  }

  private postJson<T = unknown>(
    urlString: string,
    body: Record<string, unknown>,
    redirectCount = 0,
    skipTimeoutRetry = false
  ): Promise<RequestResult<T>> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlString);
      } catch {
        reject(new Error('URL de synchronisation du Sheet invalide.'));
        return;
      }

      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
      const data = formData.toString();
      const transport = parsedUrl.protocol === 'https:' ? https : http;

      const options: https.RequestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const request = transport.request(parsedUrl, options, response => {
        const statusCode = response.statusCode ?? 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          if (redirectCount >= 5) {
            response.resume();
            reject(new Error('Trop de redirections lors de la synchronisation du Sheet.'));
            return;
          }

          let nextUrl: URL;
          try {
            nextUrl = new URL(response.headers.location, parsedUrl);
          } catch {
            response.resume();
            reject(new Error('Redirection invalide retournée par Google Sheet.'));
            return;
          }

          response.resume();

          this.postJson<T>(nextUrl.toString(), body, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

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
            reject(
              new SheetSyncRequestError(
                `Erreur Google Sheet (${statusCode ?? 'inconnue'}): ${detail}`,
                statusCode,
                rawBody
              )
            );
          }
        });
      });

           request.on('error', error => {
        if (!skipTimeoutRetry && this.isTimeoutError(error)) {
          this.postJson<T>(urlString, body, redirectCount, true)
            .then(resolve)
            .catch(reject);
          return;
        }
        reject(error);
      });

      if (this.timeoutMs !== null) {
        const timeoutMs = this.timeoutMs;
        request.setTimeout(timeoutMs, () => {
          request.destroy(new SheetSyncTimeoutError(timeoutMs));
        });
      }

      request.write(data);
      request.end();
    });
  }

  private getJson<T = unknown>(
    urlString: string,
    body: Record<string, unknown>,
    redirectCount = 0
  ): Promise<RequestResult<T>> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlString);
      } catch {
        reject(new Error('URL de synchronisation du Sheet invalide.'));
        return;
      }

      const params = new URLSearchParams(parsedUrl.search);
      for (const [key, value] of Object.entries(body)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'object') {
          params.set(key, JSON.stringify(value));
        } else {
          params.set(key, String(value));
        }
      }
      parsedUrl.search = params.toString();

      const transport = parsedUrl.protocol === 'https:' ? https : http;

      const request = transport.request(
        parsedUrl,
        { method: 'GET' },
        response => {
          const statusCode = response.statusCode ?? 0;

          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            if (redirectCount >= 5) {
              response.resume();
              reject(new Error('Trop de redirections lors de la synchronisation du Sheet.'));
              return;
            }

            let nextUrl: URL;
            try {
              nextUrl = new URL(response.headers.location, parsedUrl);
            } catch {
              response.resume();
              reject(new Error('Redirection invalide retournée par Google Sheet.'));
              return;
            }

            response.resume();

            this.getJson<T>(nextUrl.toString(), body, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

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
              reject(
                new SheetSyncRequestError(
                  `Erreur Google Sheet (${statusCode ?? 'inconnue'}): ${detail}`,
                  statusCode,
                  rawBody
                )
              );
            }
          });
        }
      );

      request.on('error', reject);
     if (this.timeoutMs !== null) {
        const timeoutMs = this.timeoutMs;
        request.setTimeout(timeoutMs, () => {
          request.destroy(new SheetSyncTimeoutError(timeoutMs));
        });
      }

      request.end();
    });
  }
}

export default new SheetSyncService();