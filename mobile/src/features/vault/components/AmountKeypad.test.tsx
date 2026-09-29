import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { initI18n } from '@/i18n';

import { AmountKeypad } from './AmountKeypad';
import { appendDigit, deleteLast } from './useAmountDigits';

function Harness({ allowsDecimal }: { allowsDecimal: boolean }) {
  const [digits, setDigits] = useState('');
  return (
    <>
      <Text testID="display">{digits}</Text>
      <AmountKeypad
        allowsDecimal={allowsDecimal}
        onAppend={(key) => setDigits((d) => appendDigit(d, key, allowsDecimal))}
        onDelete={() => setDigits((d) => deleteLast(d))}
      />
    </>
  );
}

describe('AmountKeypad', () => {
  beforeAll(() => {
    initI18n();
  });

  it('types digits and a decimal when allowsDecimal', async () => {
    const screen = await render(<Harness allowsDecimal />);
    await fireEvent.press(screen.getByTestId('key-2'));
    await fireEvent.press(screen.getByTestId('key-0'));
    await fireEvent.press(screen.getByTestId('key-dot'));
    await fireEvent.press(screen.getByTestId('key-5'));
    expect(screen.getByTestId('display').props.children).toBe('20.5');
  });

  it('hides and disables the dot key when allowsDecimal is false', async () => {
    const screen = await render(<Harness allowsDecimal={false} />);
    const dot = screen.getByTestId('key-dot');
    expect(dot.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(dot);
    expect(screen.queryByTestId('display')!.props.children).toBe('');
  });

  it('deletes the last character', async () => {
    const screen = await render(<Harness allowsDecimal={false} />);
    await fireEvent.press(screen.getByTestId('key-4'));
    await fireEvent.press(screen.getByTestId('key-2'));
    await fireEvent.press(screen.getByTestId('key-delete'));
    expect(screen.getByTestId('display').props.children).toBe('4');
  });

  it('replaces a leading zero instead of appending', async () => {
    const screen = await render(<Harness allowsDecimal={false} />);
    await fireEvent.press(screen.getByTestId('key-0'));
    expect(screen.getByTestId('display').props.children).toBe('0');
    await fireEvent.press(screen.getByTestId('key-5'));
    expect(screen.getByTestId('display').props.children).toBe('5');
  });
});
