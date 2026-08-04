export const parseLocaleAmount = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  let text = String(value)
    .replace(/[\s\u00a0\u202f]+/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!text || !/\d/.test(text)) return null;

  const negative = text.startsWith('-');
  text = text.replace(/-/g, '');
  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    text = text.split(thousandsSeparator).join('');
    const decimalIndex = text.lastIndexOf(decimalSeparator);
    text =
      text.slice(0, decimalIndex).split(decimalSeparator).join('') +
      '.' +
      text.slice(decimalIndex + 1);
  } else {
    const separator = commaIndex >= 0 ? ',' : dotIndex >= 0 ? '.' : '';
    if (separator) {
      const parts = text.split(separator);
      const looksLikeThousands =
        parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
      text = looksLikeThousands
        ? parts.join('')
        : `${parts.slice(0, -1).join('')}.${parts.at(-1) ?? ''}`;
    }
  }

  const parsed = Number(`${negative ? '-' : ''}${text}`);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parsePositiveIntegerQuantity = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return 1;
  }
  const normalized = String(value).trim().replace(',', '.');
  const match = normalized.match(
    /^(\d+)(?:\.0+)?(?:\s*(?:x|pcs?|pi[eè]ces?|unit[eé]s?))?$/i
  );
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : null;
};
