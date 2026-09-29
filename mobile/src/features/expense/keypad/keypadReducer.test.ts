import { CURRENCIES } from '@/lib/currency';
import { formatNumeric } from '@/ui/components/NumericText';

import {
  amountValue,
  canContinue,
  displayParts,
  displayText,
  initialKeypadState,
  isKeyEnabled,
  type KeypadAction,
  type KeypadState,
  keypadReducer,
} from './keypadReducer';

const digit = (d: string): KeypadAction => ({ type: 'key', key: { type: 'digit', digit: d } });
const dot: KeypadAction = { type: 'key', key: { type: 'dot' } };
const del: KeypadAction = { type: 'key', key: { type: 'delete' } };
const type = (state: KeypadState, ...actions: KeypadAction[]) =>
  actions.reduce(keypadReducer, state);

describe('keypadReducer', () => {
  const usd = initialKeypadState(CURRENCIES.USD);
  const vnd = initialKeypadState(CURRENCIES.VND);

  it('appends digits and parses the amount', () => {
    const s = type(usd, digit('1'), digit('2'), digit('5'));
    expect(s.raw).toBe('125');
    expect(amountValue(s)).toBe(125);
    expect(canContinue(s)).toBe(true);
  });

  it('starts empty with "0" placeholder and cannot continue', () => {
    expect(displayText(usd)).toBe('0');
    expect(canContinue(usd)).toBe(false);
    expect(canContinue(type(usd, digit('0')))).toBe(false);
  });

  it('replaces a leading 0 with the next digit', () => {
    expect(type(usd, digit('0'), digit('7')).raw).toBe('7');
  });

  it('dot is disabled for zero-decimal currencies', () => {
    expect(isKeyEnabled(vnd, { type: 'dot' })).toBe(false);
    expect(type(vnd, digit('5'), dot).raw).toBe('5');
  });

  it('dot on empty buffer yields "0." and cannot be typed twice', () => {
    const s = type(usd, dot);
    expect(s.raw).toBe('0.');
    expect(isKeyEnabled(s, { type: 'dot' })).toBe(false);
    expect(type(s, dot).raw).toBe('0.');
  });

  it('caps fraction digits at the currency precision', () => {
    expect(type(usd, digit('1'), dot, digit('2'), digit('3'), digit('4')).raw).toBe('1.23');
  });

  it('caps whole digits at MAX_WHOLE_DIGITS (12)', () => {
    const twelve = Array.from({ length: 12 }, () => digit('9'));
    expect(type(vnd, ...twelve, digit('9')).raw).toHaveLength(12);
  });

  it('delete removes the last char and is disabled when empty', () => {
    expect(type(usd, digit('4'), digit('2'), del).raw).toBe('4');
    expect(isKeyEnabled(usd, { type: 'delete' })).toBe(false);
    expect(type(usd, del).raw).toBe('');
  });

  it('clear empties the buffer (long-press delete)', () => {
    expect(type(usd, digit('4'), digit('2'), { type: 'clear' }).raw).toBe('');
  });

  it('switching USD → VND truncates the fraction; VND → USD keeps the buffer', () => {
    const s = type(usd, digit('1'), digit('0'), dot, digit('5'));
    const asVnd = keypadReducer(s, { type: 'setCurrency', currency: CURRENCIES.VND });
    expect(asVnd.raw).toBe('10');
    expect(asVnd.currency.code).toBe('VND');
    const back = keypadReducer(asVnd, { type: 'setCurrency', currency: CURRENCIES.USD });
    expect(back.raw).toBe('10');
  });

  it('snaps to the first currency when the selection disappears from the list', () => {
    const s = type(usd, digit('9'), dot, digit('9'));
    const snapped = keypadReducer(s, {
      type: 'currenciesChanged',
      currencies: [CURRENCIES.VND, CURRENCIES.THB],
    });
    expect(snapped.currency.code).toBe('VND');
    expect(snapped.raw).toBe('9');
    // Still in the list → unchanged.
    expect(keypadReducer(s, { type: 'currenciesChanged', currencies: [CURRENCIES.USD] })).toBe(s);
    // Empty list → unchanged.
    expect(keypadReducer(s, { type: 'currenciesChanged', currencies: [] })).toBe(s);
  });

  it('formats display text with grouping', () => {
    expect(displayText(type(vnd, digit('1'), digit('2'), digit('3'), digit('4'), digit('5')))).toBe(
      '12,345',
    );
    expect(displayText(type(usd, digit('1'), digit('2'), dot, digit('5')))).toBe('12.5');
  });

  describe('displayParts', () => {
    /** What the amount display renders: the number formatted with the parts' format + "." affix. */
    const rendered = (state: KeypadState) => {
      const parts = displayParts(state);
      return (
        formatNumeric(parts.value, {
          minimumIntegerDigits: parts.integerDigits,
          minimumFractionDigits: parts.fractionDigits,
          maximumFractionDigits: parts.fractionDigits,
        }) + (parts.trailingDot ? '.' : '')
      );
    };

    it('splits representative states', () => {
      expect(displayParts(usd)).toEqual({
        value: 0,
        integerDigits: 1,
        fractionDigits: 0,
        trailingDot: false,
      });
      expect(displayParts(type(usd, dot))).toEqual({
        value: 0,
        integerDigits: 1,
        fractionDigits: 0,
        trailingDot: true,
      });
      expect(displayParts(initialKeypadState(CURRENCIES.USD, '1234.50'))).toEqual({
        value: 1234.5,
        integerDigits: 4,
        fractionDigits: 2,
        trailingDot: false,
      });
    });

    it('reproduces displayText for every short key sequence', () => {
      const keys = [digit('0'), digit('1'), digit('9'), dot, del];
      for (const start of [usd, vnd, initialKeypadState(CURRENCIES.THB)]) {
        let frontier: KeypadState[] = [start];
        for (let depth = 0; depth < 5; depth++) {
          frontier = frontier.flatMap((s) => keys.map((k) => keypadReducer(s, k)));
          for (const s of frontier) expect(rendered(s)).toBe(displayText(s));
        }
      }
    });

    it('reproduces displayText for long, prefilled and edge buffers', () => {
      const raws = [
        '',
        '0',
        '0.',
        '0.0',
        '0.00',
        '0.05',
        '0.29',
        '1.',
        '1.10',
        '007',
        '00.5',
        '1000',
        '123456',
        '1234567.8',
        '999999999999',
        '999999999999.',
        '999999999999.99',
        '100000000000.01',
        '123456789012.34',
      ];
      for (const raw of raws) {
        for (const currency of [CURRENCIES.USD, CURRENCIES.VND]) {
          const s = initialKeypadState(currency, raw);
          expect(rendered(s)).toBe(displayText(s));
        }
      }
      const typed = type(usd, ...'98765432101'.split('').map(digit), digit('2'), dot, digit('4'));
      expect(rendered(typed)).toBe(displayText(typed));
      expect(displayText(typed)).toBe('987,654,321,012.4');
    });
  });
});
