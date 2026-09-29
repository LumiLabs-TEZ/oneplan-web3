import { act, render } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { RouteTraveler } from './RouteTraveler';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, useReducedMotion: jest.fn(() => false) };
});

const mockUseReducedMotion = useReducedMotion as jest.Mock;

const points = [
  { latitude: 11.94, longitude: 108.45 },
  { latitude: 11.95, longitude: 108.44 },
];

describe('RouteTraveler', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('renders the marker once the loop starts on a drivable path', async () => {
    const screen = await render(<RouteTraveler points={points} durationMs={4000} testID="car" />);
    await advance(100);
    expect(screen.getByTestId('car')).toBeTruthy();
  });

  it('hides the marker at the destination, then starts a new one (no fly-back)', async () => {
    const screen = await render(<RouteTraveler points={points} durationMs={4000} testID="car" />);
    await advance(4300); // inside the 600 ms end pause
    expect(screen.queryByTestId('car')).toBeNull();
    await advance(500); // next lap
    expect(screen.getByTestId('car')).toBeTruthy();
  });

  it('renders nothing under Reduce Motion', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    const screen = await render(<RouteTraveler points={points} durationMs={4000} testID="car" />);
    expect(screen.queryByTestId('car')).toBeNull();
  });

  it('renders nothing for a path with fewer than two points', async () => {
    const screen = await render(
      <RouteTraveler points={points.slice(0, 1)} durationMs={4000} testID="car" />,
    );
    expect(screen.queryByTestId('car')).toBeNull();
  });
});
