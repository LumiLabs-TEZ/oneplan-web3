import { render } from '@testing-library/react-native';

import { CURRENCIES } from '@/lib/currency';

import { MoneyText } from './MoneyText';
import { faceWeight, formatNumeric, NumericText } from './NumericText';

describe('formatNumeric', () => {
  it('groups, pads and rounds half away from zero like the native renderer', () => {
    expect(formatNumeric(1234567)).toBe('1,234,567');
    expect(formatNumeric(1234.5, { minimumFractionDigits: 2 })).toBe('1,234.50');
    expect(formatNumeric(2.345, { maximumFractionDigits: 2 })).toBe('2.35');
    expect(formatNumeric(-2.5)).toBe('-3');
    expect(formatNumeric(-0.001, { maximumFractionDigits: 2 })).toBe('0');
    expect(formatNumeric(4, { minimumIntegerDigits: 2 })).toBe('04');
    expect(formatNumeric(1.5, { maximumFractionDigits: 3 })).toBe('1.5');
    expect(formatNumeric(12345, { useGrouping: false })).toBe('12345');
    expect(formatNumeric(Number.NaN)).toBe('0');
  });
});

it('derives the SwiftUI weight from the named face so bold faces stay bold', () => {
  expect(faceWeight({ fontFamily: 'BeVietnamPro-SemiBold' })).toBe('600');
  expect(faceWeight({ fontFamily: 'BeVietnamPro-ExtraBold' })).toBe('800');
  expect(faceWeight({ fontFamily: 'BeVietnamPro-Bold' })).toBe('700');
  expect(faceWeight({ fontFamily: 'BeVietnamPro-Regular' })).toBe('400');
  expect(faceWeight({ fontFamily: 'System', fontWeight: '700' })).toBe('700');
});

it('exposes only the current number, with its affixes, as one text element', async () => {
  const screen = await render(<NumericText value={120} prefix="+" suffix="%" />);
  expect(screen.getByRole('text', { name: '+120%' })).toBeTruthy();
  await screen.rerender(<NumericText value={90} prefix="+" suffix="%" />);
  expect(screen.getByRole('text', { name: '+90%' })).toBeTruthy();
  expect(screen.queryByRole('text', { name: '+120%' })).toBeNull();
  expect(screen.getByText('90')).toBeTruthy();
});

it('draws money in the app format with the catalog symbol', async () => {
  const screen = await render(
    <>
      <MoneyText amount={1234567.9} currency={CURRENCIES.VND} />
      <MoneyText amount={1234.5} currency={CURRENCIES.USD} sign="+" symbolPosition="suffix" />
    </>,
  );
  expect(screen.getByRole('text', { name: 'đ1,234,567' })).toBeTruthy();
  expect(screen.getByRole('text', { name: '+1,234.50$' })).toBeTruthy();
});

it('draws a static number as one plain text with its affixes and fraction span', async () => {
  const screen = await render(
    <>
      <NumericText
        value={1234.5}
        minimumFractionDigits={2}
        maximumFractionDigits={2}
        prefix="~"
        suffix=" USD"
        fractionColor="red"
        animated={false}
        testID="static-number"
      />
      <MoneyText
        amount={1955000}
        currency={CURRENCIES.VND}
        showDecimals={false}
        sign="-"
        symbolPosition="suffix"
        animated={false}
      />
    </>,
  );
  const number = screen.getByRole('text', { name: '~1,234.50 USD' });
  expect(number.props.testID).toBe('static-number');
  expect(number.props.numberOfLines).toBe(1);
  // One `<Text>` holding the whole string, the fraction in its own coloured span.
  expect(screen.getByText('~1,234.50 USD')).toBe(number);
  expect(screen.getByText('.50').props.style).toEqual({ color: 'red' });
  expect(screen.getByRole('text', { name: '-1,955,000đ' })).toBeTruthy();
});
