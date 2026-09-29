import { fireEvent, render } from '@testing-library/react-native';
import type { ProductSubscription } from 'expo-iap';

import { initI18n } from '@/i18n';

import { ProductCard } from './ProductCard';

beforeAll(() => {
  initI18n();
});

function iosSub(
  id: string,
  unit: 'week' | 'month' | 'year',
  price = 10,
  displayName = '',
): ProductSubscription {
  return {
    id,
    type: 'subs',
    platform: 'ios',
    title: id,
    description: `desc-${id}`,
    displayPrice: `$${price}`,
    currency: 'USD',
    price,
    displayNameIOS: displayName,
    isFamilyShareableIOS: false,
    jsonRepresentationIOS: '{}',
    introductoryPricePaymentModeIOS: 'empty',
    typeIOS: 'auto-renewable-subscription',
    subscriptionPeriodUnitIOS: unit,
    subscriptionPeriodNumberIOS: '1',
  } as ProductSubscription;
}

describe('ProductCard', () => {
  it('shows the sku-derived name and the price/period label', async () => {
    const screen = await render(
      <ProductCard
        product={iosSub('pro_yearly', 'year', 59.99)}
        selected={false}
        onPress={jest.fn()}
        testID="paywall-product-pro_yearly"
      />,
    );
    expect(screen.getByText('Yearly')).toBeTruthy();
    expect(screen.getByText('$59.99/year')).toBeTruthy();
  });

  it('prefers the App Store display name over the sku label', async () => {
    const screen = await render(
      <ProductCard
        product={iosSub('pro_yearly', 'year', 10, 'Best value')}
        selected={false}
        onPress={jest.fn()}
        testID="paywall-product-pro_yearly"
      />,
    );
    expect(screen.getByText('Best value')).toBeTruthy();
    expect(screen.queryByText('Yearly')).toBeNull();
  });

  it('calls onPress with the product id when tapped', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ProductCard
        product={iosSub('pro_monthly', 'month')}
        selected={false}
        onPress={onPress}
        testID="paywall-product-pro_monthly"
      />,
    );
    fireEvent.press(screen.getByTestId('paywall-product-pro_monthly'));
    expect(onPress).toHaveBeenCalledWith('pro_monthly');
  });

  it('marks accessibilityState.selected when selected', async () => {
    const screen = await render(
      <ProductCard
        product={iosSub('pro_monthly', 'month')}
        selected
        onPress={jest.fn()}
        testID="paywall-product-pro_monthly"
      />,
    );
    expect(screen.getByTestId('paywall-product-pro_monthly').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
