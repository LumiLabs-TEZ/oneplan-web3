import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import { initI18n } from '@/i18n';
import { CURRENCIES, type Currency } from '@/lib/currency';

import { clampForCurrency, CurrencyInput } from './CurrencyInput';

function Harness({
  initial,
  currencies,
  onCurrencyChange,
}: {
  initial: Currency;
  currencies?: readonly Currency[];
  onCurrencyChange?: (c: Currency) => void;
}) {
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState(initial);
  return (
    <CurrencyInput
      value={value}
      onChangeText={setValue}
      currency={currency}
      currencies={currencies}
      onCurrencyChange={(c) => {
        setCurrency(c);
        onCurrencyChange?.(c);
      }}
    />
  );
}

describe('CurrencyInput', () => {
  beforeAll(() => {
    initI18n();
  });

  it('groups thousands while typing', async () => {
    const screen = await render(<Harness initial={CURRENCIES.VND} />);
    const input = screen.getByTestId('currency-input');
    await fireEvent.changeText(input, '1234');
    expect(input.props.value).toBe('1,234');
    await fireEvent.changeText(input, '1,2345');
    expect(input.props.value).toBe('12,345');
  });

  it('ignores the decimal separator for a 0-dp currency', async () => {
    const screen = await render(<Harness initial={CURRENCIES.VND} />);
    const input = screen.getByTestId('currency-input');
    await fireEvent.changeText(input, '12');
    await fireEvent.changeText(input, '12.');
    expect(input.props.value).toBe('12');
    expect(input.props.keyboardType).toBe('number-pad');
  });

  it('caps the fraction at two places for USD', async () => {
    const screen = await render(<Harness initial={CURRENCIES.USD} />);
    const input = screen.getByTestId('currency-input');
    await fireEvent.changeText(input, '1234.567');
    expect(input.props.value).toBe('1,234.56');
    expect(input.props.keyboardType).toBe('decimal-pad');
  });

  it('caps the whole part at 12 digits', async () => {
    const screen = await render(<Harness initial={CURRENCIES.USD} />);
    const input = screen.getByTestId('currency-input');
    await fireEvent.changeText(input, '12345678901234');
    expect(input.props.value).toBe('123,456,789,012');
  });

  it('hides the switcher with a single currency', async () => {
    const screen = await render(<Harness initial={CURRENCIES.USD} currencies={[CURRENCIES.USD]} />);
    expect(screen.getByTestId('currency-input-currency').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.queryByTestId('currency-input-option-USD')).toBeNull();
  });

  it('switching to a 0-dp currency drops the fraction and reports the change', async () => {
    const onCurrencyChange = jest.fn();
    const screen = await render(
      <Harness
        initial={CURRENCIES.USD}
        currencies={[CURRENCIES.USD, CURRENCIES.VND]}
        onCurrencyChange={onCurrencyChange}
      />,
    );
    const input = screen.getByTestId('currency-input');
    await fireEvent.changeText(input, '1250.75');
    expect(input.props.value).toBe('1,250.75');
    await fireEvent.press(screen.getByTestId('currency-input-option-VND'));
    expect(onCurrencyChange).toHaveBeenCalledWith(CURRENCIES.VND);
    expect(input.props.value).toBe('1,250');
    expect(screen.getByTestId('currency-input-currency').props.accessibilityValue.text).toBe('VND');
  });
});

describe('clampForCurrency', () => {
  it('keeps decimals for 2-dp currencies and truncates for 0-dp', () => {
    expect(clampForCurrency('1,250.75', CURRENCIES.USD)).toBe('1,250.75');
    expect(clampForCurrency('1,250.75', CURRENCIES.VND)).toBe('1,250');
    expect(clampForCurrency('0.', CURRENCIES.JPY)).toBe('0');
    expect(clampForCurrency('', CURRENCIES.VND)).toBe('');
  });
});
