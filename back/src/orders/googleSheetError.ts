export type GoogleSheetFailureCode =
  | 'sheet_spreadsheet_id_missing'
  | 'sheet_credentials_missing'
  | 'sheet_config_invalid'
  | 'sheet_credentials_invalid'
  | 'sheet_unauthorized'
  | 'sheet_forbidden'
  | 'sheet_not_found'
  | 'sheet_rate_limited'
  | 'sheet_timeout'
  | 'sheet_network_error'
  | 'sheet_unknown_error';

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  response?: {
    status?: unknown;
    data?: { error?: { status?: unknown } };
  };
};

const normalizedText = (value: unknown): string =>
  typeof value === 'string' ? value.toLowerCase() : '';

export const classifyGoogleSheetError = (
  error: unknown
): GoogleSheetFailureCode => {
  const details = (error && typeof error === 'object' ? error : {}) as ErrorLike;
  const message = normalizedText(details.message);
  const code = normalizedText(details.code);
  const googleStatus = normalizedText(details.response?.data?.error?.status);
  const rawStatus = details.response?.status ?? details.status;
  const status = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus);

  if (message.includes('google_spreadsheet_id doit être configuré')) {
    return 'sheet_spreadsheet_id_missing';
  }
  if (
    message.includes(
      'google_service_account_email et google_private_key doivent etre configures'
    )
  ) {
    return 'sheet_credentials_missing';
  }
  if (
    message.includes('spreadsheet_id est invalide') ||
    message.includes('sheet_name est invalide')
  ) {
    return 'sheet_config_invalid';
  }
  if (
    message.includes('invalid_grant') ||
    message.includes('invalid jwt') ||
    message.includes('jwt signature') ||
    message.includes('private key') ||
    message.includes('no start line') ||
    message.includes('decoder routines') ||
    code === 'err_ossl_unsupported'
  ) {
    return 'sheet_credentials_invalid';
  }
  if (status === 401 || googleStatus === 'unauthenticated') {
    return 'sheet_unauthorized';
  }
  if (status === 403 || googleStatus === 'permission_denied') {
    return 'sheet_forbidden';
  }
  if (status === 404 || googleStatus === 'not_found') {
    return 'sheet_not_found';
  }
  if (status === 429 || googleStatus === 'resource_exhausted') {
    return 'sheet_rate_limited';
  }
  if (
    code === 'etimedout' ||
    code === 'econnaborted' ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'sheet_timeout';
  }
  if (
    ['econnreset', 'enotfound', 'eai_again', 'enetunreach'].includes(code)
  ) {
    return 'sheet_network_error';
  }
  return 'sheet_unknown_error';
};
