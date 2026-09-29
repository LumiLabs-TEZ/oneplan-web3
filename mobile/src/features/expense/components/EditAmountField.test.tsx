import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import { EditAmountField } from './EditAmountField';

const menuMock = jest.requireMock('@react-native-menu/menu') as {
  __menuInstances: {
    actions: { id?: string; title: string; state?: string }[];
    onPressAction?: (event: { nativeEvent: { event: string } }) => void;
    testID?: string;
  }[];
  __resetMenuInstances: () => void;
};

function lastMenu() {
  return menuMock.__menuInstances.findLast((m) => m.testID === 'edit-amount-currency');
}

describe('EditAmountField', () => {
  beforeAll(() => {
    initI18n();
  });
  beforeEach(() => menuMock.__resetMenuInstances());

  it('live-formats typed input for the current currency', async () => {
    const onChangeText = jest.fn();
    await render(
      <EditAmountField
        value=""
        onChangeText={onChangeText}
        currency={CURRENCIES.THB}
        currencies={[CURRENCIES.THB]}
        onCurrencyChange={jest.fn()}
        caption=""
      />,
    );
    await fireEvent.changeText(screen.getByTestId('edit-amount'), '50000.5');
    expect(onChangeText).toHaveBeenCalledWith('50,000.5');
  });

  it('switches currency from the native menu and clamps the fraction', async () => {
    const onChangeText = jest.fn();
    const onCurrencyChange = jest.fn();
    await render(
      <EditAmountField
        value="12.50"
        onChangeText={onChangeText}
        currency={CURRENCIES.USD}
        currencies={[CURRENCIES.USD, CURRENCIES.VND]}
        onCurrencyChange={onCurrencyChange}
        caption="≈ 300,000đ"
      />,
    );
    const menu = lastMenu();
    expect(menu?.actions.map((a) => a.title)).toEqual(['US Dollar (USD)', 'Vietnamese Dong (VND)']);
    menu?.onPressAction?.({ nativeEvent: { event: 'VND' } });
    expect(onCurrencyChange).toHaveBeenCalledWith(CURRENCIES.VND);
    expect(onChangeText).toHaveBeenCalledWith('12');
  });

  it('renders an inert chip with a single currency', async () => {
    await render(
      <EditAmountField
        value="1"
        onChangeText={jest.fn()}
        currency={CURRENCIES.THB}
        currencies={[CURRENCIES.THB]}
        onCurrencyChange={jest.fn()}
        caption=""
      />,
    );
    expect(lastMenu()).toBeUndefined();
    expect(screen.getByText('THB')).toBeTruthy();
  });
});
