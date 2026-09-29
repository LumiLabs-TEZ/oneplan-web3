import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { ProductSubscription } from 'expo-iap';

import { initI18n } from '@/i18n';

import { ProductPicker } from './ProductPicker';

beforeAll(() => {
  initI18n();
});

function iosSub(id: string, unit: 'week' | 'month' | 'year', price = 10): ProductSubscription {
  return {
    id,
    type: 'subs',
    platform: 'ios',
    title: id,
    description: `desc-${id}`,
    displayPrice: `$${price}`,
    currency: 'USD',
    price,
    displayNameIOS: id,
    isFamilyShareableIOS: false,
    jsonRepresentationIOS: '{}',
    introductoryPricePaymentModeIOS: 'empty',
    typeIOS: 'auto-renewable-subscription',
    subscriptionPeriodUnitIOS: unit,
    subscriptionPeriodNumberIOS: '1',
  } as ProductSubscription;
}

const WEEKLY = iosSub('pro_weekly', 'week', 4.99);
const MONTHLY = iosSub('pro_monthly', 'month', 9.99);
const YEARLY = iosSub('pro_yearly', 'year', 59.99);

describe('ProductPicker', () => {
  it('renders a card per product', async () => {
    const screen = await render(
      <ProductPicker
        products={[YEARLY, MONTHLY, WEEKLY]}
        selectedSku="pro_yearly"
        onSelect={jest.fn()}
        onCompareFeaturesTap={jest.fn()}
      />,
    );
    expect(screen.getByTestId('paywall-product-pro_yearly')).toBeTruthy();
    expect(screen.getByTestId('paywall-product-pro_monthly')).toBeTruthy();
    expect(screen.getByTestId('paywall-product-pro_weekly')).toBeTruthy();
  });

  it('marks only the selected sku as selected', async () => {
    const screen = await render(
      <ProductPicker
        products={[YEARLY, MONTHLY, WEEKLY]}
        selectedSku="pro_monthly"
        onSelect={jest.fn()}
        onCompareFeaturesTap={jest.fn()}
      />,
    );
    expect(
      screen.getByTestId('paywall-product-pro_monthly').props.accessibilityState.selected,
    ).toBe(true);
    expect(screen.getByTestId('paywall-product-pro_yearly').props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('calls onSelect with the tapped sku', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <ProductPicker
        products={[YEARLY, MONTHLY, WEEKLY]}
        selectedSku="pro_yearly"
        onSelect={onSelect}
        onCompareFeaturesTap={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('paywall-product-pro_weekly'));
    expect(onSelect).toHaveBeenCalledWith('pro_weekly');
  });

  it('fires a selection haptic on a new sku, but not re-tapping the selected one', async () => {
    // No `clearMocks` in the jest config — clear the shared Haptics mock so earlier tests'
    // presses (which now also go through the same haptic-guarding `select`) don't leak in.
    const selectionSpy = jest.spyOn(Haptics, 'selectionAsync').mockClear();
    const onSelect = jest.fn();
    const screen = await render(
      <ProductPicker
        products={[YEARLY, MONTHLY, WEEKLY]}
        selectedSku="pro_yearly"
        onSelect={onSelect}
        onCompareFeaturesTap={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId('paywall-product-pro_yearly'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(selectionSpy).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('paywall-product-pro_weekly'));
    expect(onSelect).toHaveBeenCalledWith('pro_weekly');
    expect(selectionSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onCompareFeaturesTap when the link is tapped', async () => {
    const onCompareFeaturesTap = jest.fn();
    const screen = await render(
      <ProductPicker
        products={[YEARLY, MONTHLY, WEEKLY]}
        selectedSku="pro_yearly"
        onSelect={jest.fn()}
        onCompareFeaturesTap={onCompareFeaturesTap}
      />,
    );
    fireEvent.press(screen.getByTestId('paywall-compare'));
    expect(onCompareFeaturesTap).toHaveBeenCalledTimes(1);
  });
});
