import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PremiumCard } from './PremiumCard';

describe('PremiumCard', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows "Upgrade now" for a free user', async () => {
    const screen = await render(<PremiumCard isPro={false} onPress={jest.fn()} />);
    expect(screen.getByText('Upgrade now')).toBeTruthy();
  });

  it('shows "View Plan" for a Pro user', async () => {
    const screen = await render(<PremiumCard isPro onPress={jest.fn()} />);
    expect(screen.getByText('View Plan')).toBeTruthy();
  });

  it('calls onPress when the CTA is tapped', async () => {
    const onPress = jest.fn();
    const screen = await render(<PremiumCard isPro={false} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId('settings-premium-cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
