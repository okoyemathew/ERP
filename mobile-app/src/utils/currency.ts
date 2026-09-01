export const DEFAULT_BUSINESS_CURRENCY = "XAF";

export const SUPPORTED_CURRENCIES = [
  { country: "Cameroon", code: "XAF", name: "Central African CFA Franc", symbol: "FCFA", fractionDigits: 0 },
  { country: "United States", code: "USD", name: "US Dollar", symbol: "$", fractionDigits: 2 },
  { country: "United Kingdom", code: "GBP", name: "British Pound", symbol: "\u00a3", fractionDigits: 2 },
  { country: "Germany / Eurozone", code: "EUR", name: "Euro", symbol: "\u20ac", fractionDigits: 2 },
  { country: "West Africa", code: "XOF", name: "West African CFA Franc", symbol: "CFA", fractionDigits: 0 },
  { country: "Nigeria", code: "NGN", name: "Nigerian Naira", symbol: "\u20a6", fractionDigits: 2 },
  { country: "Ghana", code: "GHS", name: "Ghanaian Cedi", symbol: "GH\u20b5", fractionDigits: 2 },
  { country: "The Gambia", code: "GMD", name: "Gambian Dalasi", symbol: "D", fractionDigits: 2 },
  { country: "Guinea", code: "GNF", name: "Guinean Franc", symbol: "FG", fractionDigits: 0 },
  { country: "Liberia", code: "LRD", name: "Liberian Dollar", symbol: "$", fractionDigits: 2 },
  { country: "Sierra Leone", code: "SLE", name: "Sierra Leonean Leone", symbol: "Le", fractionDigits: 2 },
  { country: "Mauritania", code: "MRU", name: "Mauritanian Ouguiya", symbol: "UM", fractionDigits: 2 },
] as const;

export type SupportedCurrencyCode =
  (typeof SUPPORTED_CURRENCIES)[number]["code"];

export function normalizeCurrency(value?: string | null): SupportedCurrencyCode {
  const normalized = value?.trim().toUpperCase();
  return SUPPORTED_CURRENCIES.some((currency) => currency.code === normalized)
    ? (normalized as SupportedCurrencyCode)
    : DEFAULT_BUSINESS_CURRENCY;
}

export function getCurrencyOption(value?: string | null) {
  const code = normalizeCurrency(value);
  return (
    SUPPORTED_CURRENCIES.find((currency) => currency.code === code) ??
    SUPPORTED_CURRENCIES[0]
  );
}

export function formatMoney(
  value: number | string | null | undefined,
  currencyCode?: string | null,
) {
  const amount = Number(value ?? 0);
  const currency = getCurrencyOption(currencyCode);
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: currency.fractionDigits,
    maximumFractionDigits: currency.fractionDigits,
  });

  if (
    currency.code === "XAF" ||
    currency.code === "XOF" ||
    currency.code === "GNF" ||
    currency.code === "SLE" ||
    currency.code === "MRU" ||
    currency.code === "GMD"
  ) {
    return `${currency.symbol} ${formatted}`;
  }

  return `${currency.symbol}${formatted}`;
}
