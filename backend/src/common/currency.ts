import { BadRequestException } from '@nestjs/common';

export const DEFAULT_BUSINESS_CURRENCY = 'XAF' as const;

export const SUPPORTED_CURRENCIES = [
  'XAF',
  'USD',
  'GBP',
  'EUR',
  'XOF',
  'NGN',
  'GHS',
  'GMD',
  'GNF',
  'LRD',
  'SLE',
  'MRU',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function normalizeCurrency(value?: string | null) {
  return value?.trim().toUpperCase();
}

export function isSupportedCurrency(
  value?: string | null,
): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(
    normalizeCurrency(value) as SupportedCurrency,
  );
}

export function assertSupportedCurrency(
  value?: string | null,
): SupportedCurrency | undefined {
  const normalized = normalizeCurrency(value);
  if (!normalized) {
    return undefined;
  }

  if (!isSupportedCurrency(normalized)) {
    throw new BadRequestException(
      `Unsupported currency. Allowed currencies: ${SUPPORTED_CURRENCIES.join(', ')}`,
    );
  }

  return normalized;
}

export function formatMoney(
  value: number | string | { toString(): string },
  currency: string = DEFAULT_BUSINESS_CURRENCY,
) {
  const amount = Number(value?.toString() ?? 0);
  const normalized = isSupportedCurrency(currency)
    ? currency
    : DEFAULT_BUSINESS_CURRENCY;
  const symbols: Record<SupportedCurrency, string> = {
    XAF: 'FCFA',
    USD: '$',
    GBP: '\u00a3',
    EUR: '\u20ac',
    XOF: 'CFA',
    NGN: '\u20a6',
    GHS: 'GH\u20b5',
    GMD: 'D',
    GNF: 'FG',
    LRD: '$',
    SLE: 'Le',
    MRU: 'UM',
  };

  if (
    normalized === 'XAF' ||
    normalized === 'XOF' ||
    normalized === 'GNF'
  ) {
    return `${symbols[normalized]} ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }

  const separator =
    normalized === 'GMD' || normalized === 'SLE' || normalized === 'MRU'
      ? ' '
      : '';

  return `${symbols[normalized]}${separator}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
