import { countryOptions } from "./countries";

export const DEFAULT_BUSINESS_CURRENCY = "USD";

export function normalizeCurrency(value?: string | null): string {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_BUSINESS_CURRENCY;
}

export function getCurrencyOption(value?: string | null) {
  const code = normalizeCurrency(value);
  const country = countryOptions.find((option) => option.currency === code);
  let symbol = code;
  let fractionDigits = 2;
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: code }).formatToParts(0);
    symbol = parts.find((part) => part.type === "currency")?.value ?? code;
    fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // Keep the ISO code visible if a platform does not recognise a legacy currency.
  }
  return { code, name: country ? `${country.name} ${code}` : code, symbol, fractionDigits };
}

export function formatMoney(
  value: number | string | null | undefined,
  currencyCode?: string | null,
) {
  const amount = Number(value ?? 0);
  const currency = getCurrencyOption(currencyCode);
  const legacyZeroDecimalSymbols: Record<string, string> = { XAF: "FCFA", XOF: "CFA", GNF: "FG" };
  if (legacyZeroDecimalSymbols[currency.code]) {
    return `${legacyZeroDecimalSymbols[currency.code]} ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: currency.fractionDigits,
      maximumFractionDigits: currency.fractionDigits,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currency.symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: currency.fractionDigits, maximumFractionDigits: currency.fractionDigits })}`;
  }
}
