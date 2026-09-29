import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useReducedMotion } from 'react-native-reanimated';

import { AnimatedSplash } from './AnimatedSplash';
import { coverScale, SPLASH_MOTION } from './splashMotion';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: jest.fn() };
});
jest.mock('@shopify/react-native-skia', () => {
  const { View } = jest.requireActual('react-native');
  const Stub = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) => (
      <View testID="splash-canvas">{children}</View>
    ),
    Group: Stub,
    Rect: Stub,
    Image: Stub,
    Blur: Stub,
    useImage: jest.fn(() => ({ width: () => 360, height: () => 360 })),
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const hideAsync = SplashScreen.hideAsync as jest.Mock;
const reducedMotion = useReducedMotion as jest.Mock;

function layout(width = 390, height = 844) {
  return { nativeEvent: { layout: { x: 0, y: 0, width, height } } };
}

describe('coverScale', () => {
  it('scales the 120pt logo until a 4x screen box fits, by the larger side', () => {
    expect(coverScale({ width: 390, height: 844 })).toBeCloseTo((844 * 4) / 120);
    expect(coverScale({ width: 844, height: 390 })).toBeCloseTo((844 * 4) / 120);
  });

  it('is a no-op before layout', () => {
    expect(coverScale({ width: 0, height: 0 })).toBe(1);
  });
});

describe('AnimatedSplash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hideAsync.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('draws the reveal and only then hides the native splash', async () => {
    reducedMotion.mockReturnValue(false);
    const onComplete = jest.fn();
    await render(<AnimatedSplash onComplete={onComplete} />);
    expect(screen.queryByTestId('splash-canvas')).toBeNull();
    expect(hideAsync).not.toHaveBeenCalled();

    await fireEvent(screen.getByTestId('animated-splash'), 'layout', layout());

    expect(screen.getByTestId('splash-canvas')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalledTimes(1);
    // Only the canvas may paint once it is up, or the revealed app stays covered in black.
    expect(screen.getByTestId('animated-splash')).toHaveStyle({ backgroundColor: 'transparent' });
  });

  it('Reduce Motion: fades the logo tile out, then completes', async () => {
    reducedMotion.mockReturnValue(true);
    const onComplete = jest.fn();
    await render(<AnimatedSplash onComplete={onComplete} />);
    await fireEvent(screen.getByTestId('animated-splash'), 'layout', layout());
    expect(hideAsync).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(SPLASH_MOTION.initialDelayMs + SPLASH_MOTION.reducedFadeMs + 100);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
