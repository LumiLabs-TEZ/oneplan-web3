import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { PremiumGate } from './PremiumGate';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('PremiumGate', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders children untouched and without an overlay when allowed', async () => {
    await render(
      <PremiumGate allowed>
        <Text>Premium Feature</Text>
      </PremiumGate>,
    );

    expect(screen.getByText('Premium Feature')).toBeTruthy();
    expect(screen.queryByTestId('premium-gate')).toBeNull();
  });

  it('dims and blocks interaction when blocked (default dimsWhenBlocked)', async () => {
    await render(
      <PremiumGate allowed={false}>
        <Text>Premium Feature</Text>
      </PremiumGate>,
    );

    expect(screen.getByText('Premium Feature')).toBeTruthy();
    const overlay = screen.getByTestId('premium-gate');
    expect(overlay.props.accessibilityLabel).toBe('Requires Pro');
    expect(overlay.props.accessibilityHint).toBe('Opens subscription options');
  });

  it('tapping the overlay pushes /paywall', async () => {
    await render(
      <PremiumGate allowed={false}>
        <Text>Premium Feature</Text>
      </PremiumGate>,
    );

    fireEvent.press(screen.getByTestId('premium-gate'));
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('runs onBlockedPress before pushing /paywall', async () => {
    const onBlockedPress = jest.fn();
    await render(
      <PremiumGate allowed={false} onBlockedPress={onBlockedPress}>
        <Text>Premium Feature</Text>
      </PremiumGate>,
    );

    fireEvent.press(screen.getByTestId('premium-gate'));
    expect(onBlockedPress).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('does not dim when dimsWhenBlocked is false', async () => {
    await render(
      <PremiumGate allowed={false} dimsWhenBlocked={false}>
        <Text testID="child">Premium Feature</Text>
      </PremiumGate>,
    );

    expect(screen.getByTestId('premium-gate')).toBeTruthy();
    expect(screen.getByText('Premium Feature')).toBeTruthy();
  });
});
