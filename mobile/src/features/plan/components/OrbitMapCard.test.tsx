import { render, screen } from '@testing-library/react-native';

import { OrbitMapCard } from './OrbitMapCard';

jest.mock('expo-router', () => ({
  // Minimal stand-in for expo-router's `useFocusEffect`: runs the effect once
  // on mount (as if the screen were immediately focused) and its cleanup on
  // unmount — enough to exercise `OrbitMapCard`'s focus-gated orbit without
  // pulling in the full router/navigation stack.
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
}));

const center = { latitude: 10.77, longitude: 106.7 };

describe('OrbitMapCard', () => {
  it('renders a non-interactive map centered on the given coordinate', async () => {
    await render(<OrbitMapCard center={center} testID="orbit-map-card" />);

    expect(screen.getByTestId('orbit-map-card')).toBeTruthy();
  });

  it('shows the title when given', async () => {
    await render(<OrbitMapCard center={center} title="Ben Thanh Market" />);

    expect(screen.getByText('Ben Thanh Market')).toBeTruthy();
  });

  it('renders without a title', async () => {
    await render(<OrbitMapCard center={center} />);

    expect(screen.queryByText('Ben Thanh Market')).toBeNull();
  });
});
