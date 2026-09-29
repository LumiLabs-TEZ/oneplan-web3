/**
 * Entry state machine for `AmountKeypad` — port of the `digits: String` input rules in
 * `ios/OnePlan/OnePlan/Component/Vault/AmountKeypad.swift` (`append`/`delete`). Digits only, no
 * arithmetic and no currency-aware clamping (that is `@/lib/currency`'s job elsewhere) — the raw
 * typed buffer is exactly what the Swift view keeps in its `@Binding var digits: String`.
 *
 * There is no maximum length: Swift's `AmountKeypad` never caps the buffer either (a cap only
 * shows up in callers, e.g. `ContributeToVaultView.microUSDC(from:)` truncating the *fraction* to
 * 6 digits after the fact when it converts to micro-USDC — that is out of this component's scope
 * and belongs next to whatever reads `digits`).
 */
import { useCallback, useState } from 'react';

/**
 * `"12.34"` + `"5"` → `"12.345"`. `key` is `"."` or a single digit `"0"`–`"9"`.
 *
 * Swift rules, unchanged:
 * - A leading `"0"` is a placeholder — typing over it replaces it (`"0"` then `"5"` → `"5"`),
 *   never `"05"`.
 * - `"."` is a no-op unless `allowsDecimal` and the buffer has no dot yet; an empty buffer gets a
 *   leading `"0"` so the dot never starts the string (`"" ` + `"."` → `"0."`).
 */
export function appendDigit(digits: string, key: string, allowsDecimal: boolean): string {
  if (key === '.') {
    if (!allowsDecimal || digits.includes('.')) return digits;
    return digits === '' ? '0.' : digits + '.';
  }
  if (digits === '0') return key;
  return digits + key;
}

/** Removes the last character; a no-op on an empty buffer. */
export function deleteLast(digits: string): string {
  return digits.length === 0 ? digits : digits.slice(0, -1);
}

export interface UseAmountDigits {
  digits: string;
  /** `"."` or a single digit `"0"`–`"9"`. */
  append: (key: string) => void;
  delete: () => void;
  clear: () => void;
  setDigits: (digits: string) => void;
}

/**
 * VND has no minor units, so the decimal key does nothing for it — pass `allowsDecimal: false`
 * (the `AmountKeypad` default, matching Swift's default) and the keypad's dot key stays hidden.
 */
export function useAmountDigits(allowsDecimal = false, initial = ''): UseAmountDigits {
  const [digits, setDigits] = useState(initial);

  const append = useCallback(
    (key: string) => setDigits((current) => appendDigit(current, key, allowsDecimal)),
    [allowsDecimal],
  );
  const del = useCallback(() => setDigits((current) => deleteLast(current)), []);
  const clear = useCallback(() => setDigits(''), []);

  return { digits, append, delete: del, clear, setDigits };
}
