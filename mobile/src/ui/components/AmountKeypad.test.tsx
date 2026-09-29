import { fireEvent, render } from '@testing-library/react-native';
import { useReducer } from 'react';
import { Text } from 'react-native';

import {
  displayText,
  initialKeypadState,
  keypadReducer,
} from '@/features/expense/keypad/keypadReducer';
import { CURRENCIES, type Currency } from '@/lib/currency';

import { AmountKeypad } from './AmountKeypad';

function Harness({ currency }: { currency: Currency }) {
  const [state, dispatch] = useReducer(keypadReducer, initialKeypadState(currency));
  return (
    <>
      <Text testID="display">{displayText(state)}</Text>
      <AmountKeypad state={state} dispatch={dispatch} />
    </>
  );
}

describe('AmountKeypad', () => {
  it('types digits and a decimal for USD', async () => {
    const screen = await render(<Harness currency={CURRENCIES.USD} />);
    await fireEvent.press(screen.getByTestId('key-1'));
    await fireEvent.press(screen.getByTestId('key-2'));
    await fireEvent.press(screen.getByTestId('key-dot'));
    await fireEvent.press(screen.getByTestId('key-5'));
    expect(screen.getByTestId('display').props.children).toBe('12.5');
  });

  it('disables the dot key for VND', async () => {
    const screen = await render(<Harness currency={CURRENCIES.VND} />);
    expect(screen.getByTestId('key-dot').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('key-7'));
    await fireEvent.press(screen.getByTestId('key-dot'));
    expect(screen.getByTestId('display').props.children).toBe('7');
  });

  it('long-pressing delete clears the buffer', async () => {
    const screen = await render(<Harness currency={CURRENCIES.USD} />);
    await fireEvent.press(screen.getByTestId('key-4'));
    await fireEvent.press(screen.getByTestId('key-2'));
    await fireEvent.press(screen.getByTestId('key-delete'));
    expect(screen.getByTestId('display').props.children).toBe('4');
    await fireEvent(screen.getByTestId('key-delete'), 'longPress');
    expect(screen.getByTestId('display').props.children).toBe('0');
  });
});
