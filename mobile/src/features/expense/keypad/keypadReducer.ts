/**
 * Amount keypad state — port of the input rules in
 * `ios/OnePlan/OnePlan/Component/Common/AmountKeypadScreen.swift` (`isEnabled`, `handle`,
 * `append`, currency re-clamp). The value lives as the raw typed buffer, never a float.
 */
import { applyLiveFormatting, type Currency, MAX_WHOLE_DIGITS, parse } from '@/lib/currency';

export interface KeypadState {
  raw: string;
  currency: Currency;
}

export type KeypadKey = { type: 'digit'; digit: string } | { type: 'dot' } | { type: 'delete' };

export type KeypadAction =
  | { type: 'key'; key: KeypadKey }
  | { type: 'clear' }
  | { type: 'setCurrency'; currency: Currency }
  /** Trip refresh dropped the selection → snap to the first (home) currency. */
  | { type: 'currenciesChanged'; currencies: readonly Currency[] };

export function initialKeypadState(currency: Currency, raw = ''): KeypadState {
  return { raw, currency };
}

export function isKeyEnabled(state: KeypadState, key: KeypadKey): boolean {
  switch (key.type) {
    case 'dot':
      return state.currency.decimalPlaces > 0 && !state.raw.includes('.');
    case 'delete':
      return state.raw.length > 0;
    case 'digit':
      return true;
  }
}

function append(state: KeypadState, digit: string): string {
  // A leading "0" is a placeholder — typing over it replaces it ("0" then "5" → "5").
  if (state.raw === '0') return digit;
  const dot = state.raw.indexOf('.');
  if (dot >= 0) {
    const fraction = state.raw.length - dot - 1;
    if (fraction >= state.currency.decimalPlaces) return state.raw;
  } else if (state.raw.length >= MAX_WHOLE_DIGITS) {
    return state.raw;
  }
  return state.raw + digit;
}

/** Drop a fractional part the new currency cannot represent (USD → VND). */
function clamp(raw: string, currency: Currency): string {
  if (currency.decimalPlaces > 0) return raw;
  const dot = raw.indexOf('.');
  return dot >= 0 ? raw.slice(0, dot) : raw;
}

export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState {
  switch (action.type) {
    case 'key': {
      if (!isKeyEnabled(state, action.key)) return state;
      switch (action.key.type) {
        case 'digit':
          return { ...state, raw: append(state, action.key.digit) };
        case 'dot':
          return { ...state, raw: state.raw === '' ? '0.' : state.raw + '.' };
        case 'delete':
          return { ...state, raw: state.raw.slice(0, -1) };
      }
      return state;
    }
    case 'clear':
      return { ...state, raw: '' };
    case 'setCurrency':
      return { currency: action.currency, raw: clamp(state.raw, action.currency) };
    case 'currenciesChanged': {
      const first = action.currencies[0];
      if (!first || action.currencies.some((c) => c.code === state.currency.code)) return state;
      return { currency: first, raw: clamp(state.raw, first) };
    }
  }
}

export function amountValue(state: KeypadState): number {
  return parse(state.raw, state.currency.decimalPlaces);
}

export function canContinue(state: KeypadState): boolean {
  return amountValue(state) > 0;
}

/** Grouped display text; "0" placeholder when nothing typed (`formattedAmount`). */
export function displayText(state: KeypadState): string {
  const formatted = applyLiveFormatting(state.raw, state.currency.decimalPlaces);
  return formatted === '' ? '0' : formatted;
}

/**
 * `displayText` split into what an animated number view needs: the numeric value plus the exact
 * format that reproduces the typed text — `integerDigits` keeps any leading zeros of a prefilled
 * buffer, `fractionDigits` keeps typed trailing zeros ("1.50"), and `trailingDot` is the dot the
 * user just typed with no fraction yet ("12."), which a number formatter can't express.
 * Invariant (tested): grouped `value` padded to these digits, plus "." when `trailingDot`, equals
 * `displayText(state)`.
 */
export interface DisplayParts {
  value: number;
  integerDigits: number;
  fractionDigits: number;
  trailingDot: boolean;
}

export function displayParts(state: KeypadState): DisplayParts {
  const text = displayText(state);
  const [whole = '', fraction] = text.split('.');
  const trailingDot = fraction === '';
  return {
    value: parse(trailingDot ? text.slice(0, -1) : text, state.currency.decimalPlaces),
    integerDigits: whole.replace(/,/g, '').length,
    fractionDigits: fraction?.length ?? 0,
    trailingDot,
  };
}
