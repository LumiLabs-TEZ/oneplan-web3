import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PromoCodeRow } from './PromoCodeRow';

beforeAll(() => {
  initI18n();
});

describe('PromoCodeRow', () => {
  it('renders the "Have a promo code?" link on iOS (jest-expo default platform)', async () => {
    const screen = await render(<PromoCodeRow onPress={jest.fn()} />);
    expect(screen.getByText('Have a promo code?')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const screen = await render(<PromoCodeRow onPress={onPress} />);
    fireEvent.press(screen.getByTestId('paywall-promo'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled while a redemption is awaiting verification', async () => {
    const screen = await render(<PromoCodeRow onPress={jest.fn()} disabled />);
    expect(screen.getByTestId('paywall-promo').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});
