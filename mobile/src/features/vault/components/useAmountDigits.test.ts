// Port of the input rules in `ios/OnePlan/OnePlan/Component/Vault/AmountKeypad.swift`
// (`append`/`delete`). Table below maps each Swift rule to the test that pins it.
//
// | Swift rule (AmountKeypad.swift)                                    | Test                                            |
// |---------------------------------------------------------------------|--------------------------------------------------|
// | digit appended to non-empty, non-"0" buffer                         | 'appends a digit to a non-empty buffer'          |
// | leading "0" replaced, not prefixed ("0" then "5" -> "5")            | 'replaces a leading zero instead of prefixing'   |
// | "." no-op when !allowsDecimal                                       | 'ignores the dot when allowsDecimal is false'    |
// | "." no-op when the buffer already has a dot                         | 'ignores a second dot'                           |
// | "." on an empty buffer -> "0."                                      | 'prefixes an empty buffer with "0" before the dot' |
// | "." on a non-empty buffer just appends                              | 'appends the dot to a non-empty buffer'          |
// | delete removes the last character                                   | 'deletes the last character'                    |
// | delete on an empty buffer is a no-op                                 | 'is a no-op when deleting from an empty buffer'  |

import { act, renderHook } from '@testing-library/react-native';

import { appendDigit, deleteLast, useAmountDigits } from './useAmountDigits';

describe('appendDigit', () => {
  it('appends a digit to a non-empty buffer', () => {
    expect(appendDigit('12', '3', false)).toBe('123');
  });

  it('replaces a leading zero instead of prefixing', () => {
    expect(appendDigit('0', '5', false)).toBe('5');
  });

  it('ignores the dot when allowsDecimal is false', () => {
    expect(appendDigit('12', '.', false)).toBe('12');
  });

  it('ignores a second dot', () => {
    expect(appendDigit('12.5', '.', true)).toBe('12.5');
  });

  it('prefixes an empty buffer with "0" before the dot', () => {
    expect(appendDigit('', '.', true)).toBe('0.');
  });

  it('appends the dot to a non-empty buffer', () => {
    expect(appendDigit('12', '.', true)).toBe('12.');
  });
});

describe('deleteLast', () => {
  it('deletes the last character', () => {
    expect(deleteLast('123')).toBe('12');
  });

  it('is a no-op when deleting from an empty buffer', () => {
    expect(deleteLast('')).toBe('');
  });
});

describe('useAmountDigits', () => {
  it('drives digits through append/delete/clear', async () => {
    const { result } = await renderHook(() => useAmountDigits(true));

    await act(() => result.current.append('2'));
    await act(() => result.current.append('0'));
    await act(() => result.current.append('0'));
    expect(result.current.digits).toBe('200');

    await act(() => result.current.append('.'));
    await act(() => result.current.append('5'));
    expect(result.current.digits).toBe('200.5');

    await act(() => result.current.delete());
    expect(result.current.digits).toBe('200.');

    await act(() => result.current.clear());
    expect(result.current.digits).toBe('');
  });

  it('keeps the dot key inert for the whole hook lifecycle when allowsDecimal is false', async () => {
    const { result } = await renderHook(() => useAmountDigits(false));
    await act(() => result.current.append('7'));
    await act(() => result.current.append('.'));
    expect(result.current.digits).toBe('7');
  });

  it('accepts an initial value and lets the caller overwrite it', async () => {
    const { result } = await renderHook(() => useAmountDigits(true, '150000'));
    expect(result.current.digits).toBe('150000');
    await act(() => result.current.setDigits('999'));
    expect(result.current.digits).toBe('999');
  });
});
