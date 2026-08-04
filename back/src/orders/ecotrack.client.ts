import axios, { AxiosError, AxiosRequestConfig } from 'axios';

export type DeliveryApiType = 'api_dhd' | 'api_sook';

export type EcotrackOrderPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface EcotrackStatusEntry {
  status?: string;
  activity?: unknown[];
  [key: string]: unknown;
}

interface EcotrackConfig {
  type: DeliveryApiType;
  baseUrl: string;
  token: string;
}

export class EcotrackApiError extends Error {
  readonly httpStatus?: number;
  readonly apiCode?: string | number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { httpStatus?: number; apiCode?: string | number; details?: unknown } = {}
  ) {
    super(message);
    this.name = 'EcotrackApiError';
    this.httpStatus = options.httpStatus;
    this.apiCode = options.apiCode;
    this.details = options.details;
  }
}

const DEFAULT_BASE_URL = 'https://platform.dhd-dz.com';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const positiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getConfig = (type: DeliveryApiType): EcotrackConfig => {
  const isSook = type === 'api_sook';
  const baseUrl = String(
    isSook
      ? process.env.SOOK_API_URL ?? process.env.DHD_API_URL ?? DEFAULT_BASE_URL
      : process.env.DHD_API_URL ?? DEFAULT_BASE_URL
  )
    .trim()
    .replace(/\/$/, '');
  const token = String(
    isSook ? process.env.SOOK_API_TOKEN ?? '' : process.env.DHD_API_TOKEN ?? ''
  ).trim();

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new EcotrackApiError('URL ECOTRACK invalide dans la configuration serveur.');
  }
  const localDevelopmentUrl =
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1'].includes(parsedBaseUrl.hostname);
  if (
    parsedBaseUrl.username ||
    parsedBaseUrl.password ||
    (parsedBaseUrl.protocol !== 'https:' && !localDevelopmentUrl)
  ) {
    throw new EcotrackApiError('L’URL ECOTRACK doit utiliser HTTPS sans identifiants intégrés.');
  }

  if (!token) {
    throw new EcotrackApiError(
      `Token ${isSook ? 'SOOK' : 'DHD'} non configure sur le serveur.`
    );
  }

  return { type, baseUrl, token };
};

const extractSafeApiError = (error: AxiosError): EcotrackApiError => {
  const payload = error.response?.data;
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : undefined;
  const message =
    (typeof record?.message === 'string' && record.message.trim()) ||
    (typeof payload === 'string' && payload.trim()) ||
    error.message ||
    'Erreur ECOTRACK';

  return new EcotrackApiError(message, {
    httpStatus: error.response?.status,
    apiCode:
      typeof record?.error === 'string' || typeof record?.error === 'number'
        ? record.error
        : undefined,
    details: record?.errors,
  });
};

const request = async <T>(
  config: EcotrackConfig,
  requestConfig: AxiosRequestConfig,
  attempt = 0
): Promise<T> => {
  const timeout = Math.min(
    positiveNumber(process.env.ECOTRACK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    60_000
  );
  try {
    const response = await axios.request<T>({
      ...requestConfig,
      baseURL: config.baseUrl,
      timeout,
      maxContentLength: 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
        ...requestConfig.headers,
      },
    });
    return response.data;
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      throw new EcotrackApiError(
        error instanceof Error ? error.message : 'Erreur ECOTRACK inconnue'
      );
    }

    const maxRetries = Math.min(
      Math.floor(
        positiveNumber(
          process.env.ECOTRACK_RATE_LIMIT_RETRIES,
          DEFAULT_MAX_RETRIES
        )
      ),
      5
    );
    if (error.response?.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(error.response.headers?.['retry-after']);
      const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10_000)
        : Math.min(1000 * 2 ** attempt, 10000);
      await delay(backoffMs);
      return request<T>(config, requestConfig, attempt + 1);
    }

    throw extractSafeApiError(error);
  }
};

export const assertEcotrackSuccess = (
  payload: unknown,
  options: { requireTracking?: boolean } = {}
): { tracking?: string; message?: string } => {
  if (!payload || typeof payload !== 'object') {
    throw new EcotrackApiError('Reponse ECOTRACK invalide.');
  }

  const record = payload as Record<string, unknown>;
  if (record.success !== true) {
    throw new EcotrackApiError(
      typeof record.message === 'string' && record.message.trim()
        ? record.message
        : 'ECOTRACK a refuse la requete.',
      {
        apiCode:
          typeof record.error === 'string' || typeof record.error === 'number'
            ? record.error
            : undefined,
        details: record.errors,
      }
    );
  }

  const tracking =
    typeof record.tracking === 'string' ? record.tracking.trim() : '';
  if (options.requireTracking && !tracking) {
    throw new EcotrackApiError(
      'ECOTRACK a accepte la requete sans retourner de tracking.'
    );
  }

  return {
    tracking: tracking || undefined,
    message:
      typeof record.message === 'string' ? record.message.trim() : undefined,
  };
};

export const chunkTrackings = (
  trackings: string[],
  chunkSize = 100
): string[][] => {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 100) {
    throw new Error('La taille des lots ECOTRACK doit etre comprise entre 1 et 100.');
  }
  const unique = Array.from(
    new Set(trackings.map((value) => value.trim()).filter(Boolean))
  );
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += chunkSize) {
    chunks.push(unique.slice(index, index + chunkSize));
  }
  return chunks;
};

export const parseStatusResponse = (
  payload: unknown
): Map<string, EcotrackStatusEntry> => {
  const result = new Map<string, EcotrackStatusEntry>();
  if (!payload || typeof payload !== 'object') return result;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return result;

  Object.entries(data as Record<string, unknown>).forEach(([tracking, entry]) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    result.set(tracking.trim().toUpperCase(), entry as EcotrackStatusEntry);
  });
  return result;
};

export const parseTrackingActivity = (payload: unknown): unknown[] => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  const activity = (payload as Record<string, unknown>).activity;
  return Array.isArray(activity) ? activity : [];
};

export class EcotrackClient {
  readonly type: DeliveryApiType;
  private readonly config: EcotrackConfig;

  constructor(type: DeliveryApiType) {
    this.type = type;
    this.config = getConfig(type);
  }

  async validateToken(): Promise<void> {
    const payload = await request<unknown>(this.config, {
      method: 'GET',
      url: '/api/v1/validate/token',
      params: { api_token: this.config.token },
    });
    const record = payload as Record<string, unknown>;
    if (record?.success !== true || record?.message !== 'VALID_TOKEN') {
      throw new EcotrackApiError('Token ECOTRACK invalide ou non autorise.');
    }
  }

  async createOrder(order: EcotrackOrderPayload): Promise<{ tracking: string }> {
    const payload = await request<unknown>(this.config, {
      method: 'POST',
      url: '/api/v1/create/order',
      params: order,
    });
    const result = assertEcotrackSuccess(payload, { requireTracking: true });
    return { tracking: result.tracking as string };
  }

  async validateOrder(
    tracking: string,
    askCollection: 0 | 1 = 0
  ): Promise<void> {
    const payload = await request<unknown>(this.config, {
      method: 'POST',
      url: '/api/v1/valid/order',
      params: { tracking, ask_collection: askCollection },
    });
    assertEcotrackSuccess(payload);
  }

  async getStatuses(
    trackings: string[]
  ): Promise<Map<string, EcotrackStatusEntry>> {
    if (trackings.length < 1 || trackings.length > 100) {
      throw new EcotrackApiError(
        'Une requete de statuts ECOTRACK doit contenir entre 1 et 100 trackings.'
      );
    }
    const payload = await request<unknown>(this.config, {
      method: 'GET',
      url: '/api/v1/get/orders/status',
      params: {
        api_token: this.config.token,
        trackings: trackings.join(','),
        status: 'all',
      },
    });
    if (
      payload &&
      typeof payload === 'object' &&
      (payload as Record<string, unknown>).success === false
    ) {
      assertEcotrackSuccess(payload);
    }
    return parseStatusResponse(payload);
  }

  async getTrackingActivity(tracking: string): Promise<unknown[]> {
    const payload = await request<unknown>(this.config, {
      method: 'GET',
      url: '/api/v1/get/tracking/info',
      params: { tracking },
    });
    if (
      payload &&
      typeof payload === 'object' &&
      (payload as Record<string, unknown>).success === false
    ) {
      assertEcotrackSuccess(payload);
    }
    return parseTrackingActivity(payload);
  }
}
