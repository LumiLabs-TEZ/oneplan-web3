/**
 * Currency catalog + formatting/parsing.
 *
 * Port of `ios/OnePlan/OnePlan/Component/Common/Currency/CurrencyFormatter.swift`.
 * Grouping (`,`) and decimal (`.`) separators are hardcoded, NOT locale-dependent —
 * the Swift `NumberFormatter` pins `groupingSeparator = ","`, and we deliberately
 * avoid `Intl` so Hermes' partial ICU cannot change the output.
 */

/** Codes accepted by the API (`components.schemas.Currency` in openapi.json). */
export type CurrencyCode =
  'USD' | 'EUR' | 'VND' | 'THB' | 'KRW' | 'JPY' | 'CNY' | 'TWD' | 'SGD' | 'MYR';

export const CURRENCY_CODES: readonly CurrencyCode[] = [
  'USD',
  'EUR',
  'VND',
  'THB',
  'KRW',
  'JPY',
  'CNY',
  'TWD',
  'SGD',
  'MYR',
];

/** Currency display metadata (mirrors the server currency catalog). */
export interface Currency {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly decimalPlaces: number;
}

export const CURRENCIES = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
  VND: { code: 'VND', name: 'Vietnamese Dong', symbol: 'đ', decimalPlaces: 0 },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalPlaces: 2 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimalPlaces: 0 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2 },
  TWD: { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimalPlaces: 0 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2 },
  MYR: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimalPlaces: 2 },
} as const satisfies Record<CurrencyCode, Currency>;

/** Same order as Swift `Currency.fallbackCurrencies` (VND first). */
export const fallbackCurrencies: readonly Currency[] = [
  CURRENCIES.VND,
  CURRENCIES.USD,
  CURRENCIES.EUR,
  CURRENCIES.THB,
  CURRENCIES.KRW,
  CURRENCIES.JPY,
  CURRENCIES.CNY,
  CURRENCIES.TWD,
  CURRENCIES.SGD,
  CURRENCIES.MYR,
];

export function isCurrencyCode(code: string): code is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(code);
}

/** Look up a catalog currency by code; `undefined` when unknown. */
export function currencyFromCode(code: string | null | undefined): Currency | undefined {
  if (!code) return undefined;
  return fallbackCurrencies.find((c) => c.code === code);
}

/**
 * Resolve a code to a catalog currency, falling back to VND when the code is
 * missing or unknown (mirrors Swift `apiCurrencyOrFallback`, which defaults
 * to `.VND`).
 */
export function fallbackCurrency(code: string | null | undefined): Currency {
  return currencyFromCode(code) ?? CURRENCIES.VND;
}

/** Swift `Currency ==` compares by `code` only. */
export function currencyEquals(
  a: Currency | null | undefined,
  b: Currency | null | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.code === b.code;
}

// ---------------------------------------------------------------------------
// CurrencyFormatter
// ---------------------------------------------------------------------------

/**
 * Maximum number of whole-number digits the live formatter will accept.
 * 12 digits ⇒ max 999,999,999,999. Mirrors Swift `maxWholeDigits`.
 */
export const MAX_WHOLE_DIGITS = 12;

/** Insert `,` every 3 digits into a plain digit string (no sign, no dot). */
function groupDigits(digits: string): string {
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    if (i > 0 && fromEnd % 3 === 0) result += ',';
    result += digits[i];
  }
  return result;
}

/**
 * Integer-only live formatting (VND / JPY / KRW / TWD).
 * Strips non-digit characters, caps at `MAX_WHOLE_DIGITS`, re-inserts commas
 * every 3 digits. `"1234567"` → `"1,234,567"`, `""` → `""`.
 */
function applyLiveFormattingInteger(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').slice(0, MAX_WHOLE_DIGITS);
  if (digits.length === 0) return '';
  return groupDigits(digits);
}

/**
 * Decimal-aware live formatting for currencies like USD, THB, EUR.
 * - Preserves a single `.` separator.
 * - Strips non-digits (except the single dot).
 * - Truncates the fractional part to `decimalPlaces` digits.
 * - Applies comma grouping to the whole portion.
 *
 * When `decimalPlaces` is omitted or `<= 0`, uses the integer-only path.
 *
 * Examples (decimalPlaces=2):
 *   `"121"` → `"121"`, `"121."` → `"121."`, `"1234.567"` → `"1,234.56"`,
 *   `"1.2.3"` → `"1.23"`, `"0.0"` → `"0.0"`, `""` → `""`, `"."` → `"0."`
 */
export function applyLiveFormatting(text: string, decimalPlaces = 0): string {
  if (decimalPlaces <= 0) {
    return applyLiveFormattingInteger(text);
  }

  if (text.length === 0) return '';

  // 1. Strip everything except digits and dots.
  const sanitized = text.replace(/[^0-9.]/g, '');
  if (sanitized.length === 0) return '';

  // 2. Keep only the first dot; drop subsequent ones.
  let sawDot = false;
  let whole = '';
  let fraction = '';
  for (const char of sanitized) {
    if (char === '.') {
      if (sawDot) continue;
      sawDot = true;
    } else if (sawDot) {
      fraction += char;
    } else {
      whole += char;
    }
  }

  // 3. Truncate fraction to the allowed number of decimal places.
  if (fraction.length > decimalPlaces) {
    fraction = fraction.slice(0, decimalPlaces);
  }

  // 4. If user typed just ".", produce "0." so the dot is preserved.
  if (sawDot && whole.length === 0) {
    whole = '0';
  }

  // 5. Group the whole portion with commas (also applies the 12-digit cap).
  const groupedWhole = applyLiveFormattingInteger(whole);

  // 6. Re-attach the dot and fraction exactly as typed.
  if (sawDot) {
    return `${groupedWhole}.${fraction}`;
  }
  return groupedWhole;
}

/**
 * Strips commas and converts to a number. `"1,234.56"` → `1234.56`,
 * `"1,234,567"` → `1234567`, unparseable → `0`.
 * `decimalPlaces` is unused; kept for API symmetry with `applyLiveFormatting`.
 */
export function parse(text: string, decimalPlaces = 0): number {
  const stripped = text.replace(/,/g, '');
  // Swift `Double(String)` rejects empty / whitespace-padded input; `Number`
  // would coerce those to 0 anyway, but be explicit.
  if (stripped.length === 0 || stripped.trim() !== stripped) return 0;
  const value = Number(stripped);
  return Number.isNaN(value) ? 0 : value;
}

/** Swift `round` rounds half away from zero; `Math.round` rounds half up. */
function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Formats the whole part with comma separators, truncating toward zero.
 * `24500000.15` → `"24,500,000"`. Non-finite → `"0"`.
 */
export function formatWhole(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  const truncated = Math.trunc(amount);
  // BigInt gives an exact, non-exponential digit string even for 1e30.
  const digits = BigInt(truncated).toString();
  const negative = digits.startsWith('-');
  const grouped = groupDigits(negative ? digits.slice(1) : digits);
  return negative ? `-${grouped}` : grouped;
}

/**
 * Formats the decimal part. `24500000.15` → `".15"`, `24500000.0` → `".00"`.
 * Non-finite → `".00"`.
 *
 * NOTE: Hardcoded 2-decimal assumption (×100, zero-padded to 2), mirroring the
 * Swift implementation. All currently supported non-zero-decimal currencies
 * (USD, EUR, THB, CNY, SGD, MYR) use 2 places, so this is correct today.
 * TODO: generalize to accept `decimalPlaces` if/when a 3-decimal currency
 * (KWD, BHD) is added — `currency.test.ts` pins this limitation.
 */
export function formatDecimal(amount: number): string {
  if (!Number.isFinite(amount)) return '.00';
  const truncated = Math.trunc(amount);
  const decimalPart = roundHalfAwayFromZero((amount - truncated) * 100);
  return `.${String(Math.abs(decimalPart)).padStart(2, '0')}`;
}

/**
 * Formats an amount with the currency symbol.
 * `format(1234567, CURRENCIES.VND)` → `"đ1,234,567"`,
 * `format(1234.5, CURRENCIES.USD)` → `"$1,234.50"`.
 */
export function format(amount: number, currency: Currency, showDecimals = true): string {
  const whole = formatWhole(amount);
  if (showDecimals && currency.decimalPlaces > 0) {
    return `${currency.symbol}${whole}${formatDecimal(amount)}`;
  }
  return `${currency.symbol}${whole}`;
}

/**
 * The number an animated money display draws so it reads exactly like
 * `formatWhole(amount) + formatDecimal(amount)`: the whole part truncated toward zero and
 * the cents rounded half away from zero on their own. Pair with fraction digits fixed to
 * `currency.decimalPlaces` (see `ui/components/MoneyText`).
 */
export function moneyNumericValue(amount: number, currency: Currency, showDecimals = true): number {
  if (!Number.isFinite(amount)) return 0;
  const whole = Math.trunc(amount);
  if (!showDecimals || currency.decimalPlaces === 0) return whole;
  const cents = Math.abs(roundHalfAwayFromZero((amount - whole) * 100));
  const magnitude = Math.abs(whole) + cents / 100;
  // `formatWhole` only carries a sign when the whole part is non-zero (`-0.5` reads `0.50`).
  return whole < 0 ? -magnitude : magnitude;
}

/**
 * Formats an on-chain USDC amount (vault balances), always 2 fraction digits,
 * comma-grouped. Port of `CurrencyFormatter.formatUsdc` — deliberately NOT
 * `formatWhole` + `formatDecimal`: those round the fraction to 2 places with
 * `%02d`, so `0.999` prints as `"0"` + `".100"` (three digits) instead of
 * carrying the rounded cent into the whole part. Non-finite → `"0.00"`.
 */
export function formatUsdc(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00';
  const roundedCents = roundHalfAwayFromZero(amount * 100);
  const negative = roundedCents < 0;
  const absCents = Math.abs(roundedCents);
  const whole = Math.trunc(absCents / 100);
  const fraction = absCents % 100;
  const grouped = groupDigits(String(whole));
  return `${negative ? '-' : ''}${grouped}.${String(fraction).padStart(2, '0')}`;
}

/** Namespace-style export mirroring Swift's `CurrencyFormatter` enum. */
export const CurrencyFormatter = {
  MAX_WHOLE_DIGITS,
  applyLiveFormatting,
  parse,
  formatWhole,
  formatDecimal,
  format,
  formatUsdc,
} as const;
