import { BadRequestException } from '@nestjs/common';

export const DEFAULT_BUSINESS_CURRENCY = 'USD' as const;

// ISO 4217 codes are three uppercase letters. The mobile app only submits a
// currency mapped from one of the 195 supported countries.
export const SUPPORTED_CURRENCIES = [] as const;
export type SupportedCurrency = string;

export function normalizeCurrency(value?: string | null) {
  return value?.trim().toUpperCase();
}

export function isSupportedCurrency(
  value?: string | null,
): value is SupportedCurrency {
  return /^[A-Z]{3}$/.test(normalizeCurrency(value) ?? '');
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
      'Unsupported currency. Use a valid three-letter ISO 4217 currency code.',
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
  const legacyZeroDecimalSymbols: Record<string, string> = {
    XAF: 'FCFA',
    XOF: 'CFA',
    GNF: 'FG',
  };
  if (legacyZeroDecimalSymbols[normalized]) {
    return `${legacyZeroDecimalSymbols[normalized]} ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: normalized }).format(amount);
  } catch {
    return `${normalized} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
