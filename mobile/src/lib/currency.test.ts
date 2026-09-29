// Port of OnePlanTests/CurrencyFormatterTests.swift (26 cases) and
// OnePlanTests/CurrencyFormatterRoundTripTests.swift (7 cases).
// Every case mirrors the Swift @Test 1:1 — same names, same values.

import {
  CURRENCIES,
  CurrencyFormatter,
  fallbackCurrencies,
  moneyNumericValue,
  type Currency,
} from '@/lib/currency';
import { formatNumeric } from '@/ui/components/NumericText';

const { applyLiveFormatting, parse, formatWhole, formatDecimal, format, formatUsdc } =
  CurrencyFormatter;

describe('CurrencyFormatter — decimal-aware live formatting', () => {
  // MARK: - Docstring examples (decimalPlaces = 2)

  test("'121' → '121' (whole-only)", () => {
    expect(applyLiveFormatting('121', 2)).toBe('121');
  });

  test("'121.' → '121.' (trailing dot preserved)", () => {
    expect(applyLiveFormatting('121.', 2)).toBe('121.');
  });

  test("'121.87' → '121.87' (normal decimal)", () => {
    expect(applyLiveFormatting('121.87', 2)).toBe('121.87');
  });

  test("'1234.567' → '1,234.56' (fraction truncated, whole grouped)", () => {
    expect(applyLiveFormatting('1234.567', 2)).toBe('1,234.56');
  });

  test("'1.2.3' → '1.23' (second dot stripped)", () => {
    expect(applyLiveFormatting('1.2.3', 2)).toBe('1.23');
  });

  test("'0.0' → '0.0' (leading zero and short fraction preserved)", () => {
    expect(applyLiveFormatting('0.0', 2)).toBe('0.0');
  });

  test("'' → ''", () => {
    expect(applyLiveFormatting('', 2)).toBe('');
  });

  test("'.' alone → '0.'", () => {
    expect(applyLiveFormatting('.', 2)).toBe('0.');
  });

  // MARK: - Extra coverage

  test("'1234' (whole-only, larger) → '1,234'", () => {
    expect(applyLiveFormatting('1234', 2)).toBe('1,234');
  });

  test("'1234567.89' → '1,234,567.89'", () => {
    expect(applyLiveFormatting('1234567.89', 2)).toBe('1,234,567.89');
  });

  test("'abc' → '' (pure non-digits stripped)", () => {
    expect(applyLiveFormatting('abc', 2)).toBe('');
  });

  test('Non-digits around digits are stripped', () => {
    expect(applyLiveFormatting('a1b2c3.4d5', 2)).toBe('123.45');
  });

  test('Zero decimal places delegates to integer path', () => {
    // Dot is stripped when decimalPlaces == 0, then the remaining 6 digits
    // are grouped with commas by the integer-only path.
    expect(applyLiveFormatting('1234.56', 0)).toBe('123,456');
    expect(applyLiveFormatting('1234567', 0)).toBe('1,234,567');
  });

  // MARK: - parse(_:decimalPlaces:)

  test("parse('1,234.56', decimalPlaces: 2) → 1234.56", () => {
    expect(parse('1,234.56', 2)).toBe(1234.56);
  });

  test("parse('1,234,567', decimalPlaces: 0) → 1234567", () => {
    expect(parse('1,234,567', 0)).toBe(1234567);
  });

  test('parse empty string → 0', () => {
    expect(parse('', 2)).toBe(0);
  });

  // MARK: - Legacy integer-only path still works

  test('Legacy applyLiveFormatting(to:) still groups VND-style amounts', () => {
    expect(applyLiveFormatting('1234567')).toBe('1,234,567');
    expect(applyLiveFormatting('')).toBe('');
    expect(applyLiveFormatting('abc')).toBe('');
  });

  test('Legacy parse(_:) still works', () => {
    expect(parse('1,234,567')).toBe(1234567);
  });

  // MARK: - Input cap (maxWholeDigits = 12) — prevents Int overflow crash

  test('Integer path caps whole digits at 12', () => {
    // 16 digits in → first 12 kept, grouped.
    expect(applyLiveFormatting('1234567890123456')).toBe('123,456,789,012');
  });

  test('Exactly 12 digits is not truncated', () => {
    expect(applyLiveFormatting('999999999999')).toBe('999,999,999,999');
  });

  test('Decimal overload caps whole part at 12, keeps fraction', () => {
    expect(applyLiveFormatting('12345678901234567.89', 2)).toBe('123,456,789,012.89');
  });

  // MARK: - Formatter overflow safety (the crash repro)

  test('formatWhole does not trap on a value far outside Int range', () => {
    const result = formatWhole(1e30);
    expect(result).not.toBe('');
  });

  test('formatDecimal does not trap on a value far outside Int range', () => {
    // 1e30 has no representable fractional part → ".00".
    expect(formatDecimal(1e30)).toBe('.00');
  });

  test('Non-finite input is handled, not crashed', () => {
    expect(formatWhole(Infinity)).toBe('0');
    expect(formatWhole(NaN)).toBe('0');
    expect(formatDecimal(NaN)).toBe('.00');
    expect(formatDecimal(Infinity)).toBe('.00');
  });

  // MARK: - Truncation semantics preserved for normal values

  test('formatWhole still truncates toward zero', () => {
    expect(formatWhole(24_500_000.15)).toBe('24,500,000');
    expect(formatWhole(24_500_000.99)).toBe('24,500,000');
  });

  test('formatDecimal still extracts the fractional part', () => {
    expect(formatDecimal(24_500_000.15)).toBe('.15');
    expect(formatDecimal(24_500_000.0)).toBe('.00');
  });
});

describe('CurrencyFormatter — per-currency round trips', () => {
  test('zero-decimal currencies round-trip whole amounts', () => {
    const currencies: Currency[] = [CURRENCIES.VND, CURRENCIES.JPY, CURRENCIES.KRW, CURRENCIES.TWD];
    for (const currency of currencies) {
      const formatted = applyLiveFormatting('1234567', currency.decimalPlaces);
      expect(formatted).toBe('1,234,567');
      expect(parse(formatted, currency.decimalPlaces)).toBe(1_234_567);
    }
  });

  test('two-decimal currencies round-trip fractional amounts', () => {
    const currencies: Currency[] = [
      CURRENCIES.USD,
      CURRENCIES.EUR,
      CURRENCIES.THB,
      CURRENCIES.CNY,
      CURRENCIES.SGD,
      CURRENCIES.MYR,
    ];
    for (const currency of currencies) {
      const formatted = applyLiveFormatting('1234.56', currency.decimalPlaces);
      expect(formatted).toBe('1,234.56');
      expect(parse(formatted, currency.decimalPlaces)).toBe(1234.56);
    }
  });

  test("format uses the currency's symbol and decimal places", () => {
    expect(format(1234.5, CURRENCIES.USD)).toBe('$1,234.50');
    expect(format(1_234_567, CURRENCIES.VND)).toBe('đ1,234,567');
  });

  test('showDecimals: false drops the fraction', () => {
    expect(format(1234.56, CURRENCIES.USD, false)).toBe('$1,234');
  });

  test('edit-view seed path round-trips (dirty-tracking baseline)', () => {
    // EditExpenseView seeds: "%.2f" → applyLiveFormatting → parse.
    // The parsed value must equal the seeded amount exactly for the
    // untouched-row comparison to hold.
    const seeded = (12.3).toFixed(2);
    const formatted = applyLiveFormatting(seeded, 2);
    expect(parse(formatted, 2)).toBe(12.3);

    // Zero-decimal variant ("%.0f") used for VND-style currencies.
    const seededWhole = (194_250.0).toFixed(0);
    const formattedWhole = applyLiveFormatting(seededWhole, 0);
    expect(parse(formattedWhole, 0)).toBe(194_250);
  });

  test('CurrencyInputField seed path round-trips (budget baseline)', () => {
    // EditBudgetView replicates CurrencyInputField's seed:
    // formatWhole for zero-decimal / legacy mode.
    const seed = formatWhole(194_250.37);
    expect(seed).toBe('194,250');
    const formatted = applyLiveFormatting(seed, 0);
    expect(parse(formatted, 0)).toBe(194_250);
  });

  test('formatDecimal is hardcoded to 2 places — pins the documented TODO', () => {
    // All currently supported decimal currencies use 2 places, and
    // `formatDecimal` hardcodes that assumption (currency.ts TODO). If a
    // 3-decimal currency (KWD, BHD) is ever added, this test fails loudly as
    // the reminder to generalize formatDecimal and its call sites.
    const threeDecimalCurrencies = fallbackCurrencies.filter((c) => c.decimalPlaces > 2);
    expect(threeDecimalCurrencies).toEqual([]);
    expect(formatDecimal(1.239)).toBe('.24');
  });
});

describe('moneyNumericValue', () => {
  const drawn = (amount: number, currency: Currency) =>
    formatNumeric(moneyNumericValue(amount, currency), {
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces,
    });

  it.each([0, 7.25, 1234.5, 24500000.15, 0.994, -1234.56, -0.5, 1e12 + 0.07])(
    'draws %p exactly like formatWhole + formatDecimal (USD)',
    (amount) => {
      const usd = CURRENCIES.USD;
      expect(drawn(amount, usd)).toBe(
        CurrencyFormatter.formatWhole(amount) + CurrencyFormatter.formatDecimal(amount),
      );
    },
  );

  it.each([0, 1234567, 1234567.89, -42.7])(
    'truncates %p like formatWhole for 0-decimal currencies',
    (amount) => {
      expect(drawn(amount, CURRENCIES.VND)).toBe(CurrencyFormatter.formatWhole(amount));
    },
  );

  it('carries rounded-up cents into the whole part (formatDecimal would draw "99.100")', () => {
    expect(drawn(99.995, CURRENCIES.USD)).toBe('100.00');
  });

  it('drops the decimals when showDecimals is false', () => {
    expect(moneyNumericValue(1234.56, CURRENCIES.USD, false)).toBe(1234);
  });
});

// Port of the vault-only `CurrencyFormatter.formatUsdc` addition
// (`ios/OnePlan/OnePlan/Component/Common/Currency/CurrencyFormatter.swift`, web3 branch).
describe('formatUsdc', () => {
  it('always shows exactly 2 fraction digits', () => {
    expect(formatUsdc(9.6)).toBe('9.60');
    expect(formatUsdc(9)).toBe('9.00');
  });

  it('does not split a rounded-up fraction into 3 digits (the formatDecimal bug this exists to avoid)', () => {
    // formatWhole(0.999) + formatDecimal(0.999) would be "0" + ".100" — three fraction digits.
    expect(formatUsdc(0.999)).toBe('1.00');
  });

  it('truncates beyond 2 decimals with half-away-from-zero rounding', () => {
    expect(formatUsdc(9.614)).toBe('9.61');
    expect(formatUsdc(9.615)).toBe('9.62');
  });

  it('comma-groups the whole part', () => {
    expect(formatUsdc(1234567.5)).toBe('1,234,567.50');
  });

  it('carries a negative sign without splitting it from the grouped digits', () => {
    expect(formatUsdc(-42.5)).toBe('-42.50');
  });

  it('falls back to "0.00" for non-finite input', () => {
    expect(formatUsdc(NaN)).toBe('0.00');
    expect(formatUsdc(Infinity)).toBe('0.00');
  });
});
